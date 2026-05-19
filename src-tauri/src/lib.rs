use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
    time::Duration,
};

#[cfg(any(target_os = "macos", target_os = "windows"))]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;
use uuid::Uuid;

mod data;
mod models;
mod providers;
mod refresh;
mod secure_storage;
mod security;
mod windowing;

pub use data::{endpoint, fetch_json, normalize_bearer_token, normalize_url, now_ts};
pub use models::{
    AppData, AppSettings, BalanceSnapshot, LocalStationReviewRecord, ModelUsageRaw,
    ModelUsageSummary, PersistenceNotice, Station,
};

use data::{
    load_data, normalize_imported_data, normalize_station_type, persist_data, sanitize_cookie,
    trim_balance_history,
};
use models::{
    normalize_refresh_concurrency, AppDataImport, AppState, DetectStationTypeResult,
    LowBalanceAlertPayload, NewApiLoginInput, NewApiLoginOutput, SaveStationReviewRecordInput,
    UpdateWindowPayload,
};
use refresh::{
    apply_station_refresh_result, build_low_balance_alert_payload, ensure_station_credentials,
    login_station_credentials, refresh_station_once, refresh_stations_with_limit,
    show_low_balance_alert_payload, start_scheduler, station_uses_login,
};
use security::normalize_station_base_url;
use windowing::{
    apply_always_on_top, apply_widget_visibility, deepseek_console_base_url,
    deepseek_console_script, hide_low_balance_alert_window_internal, hide_main_window_internal,
    hide_update_window_internal, load_tray_icon, minimize_main_window_internal,
    newapi_console_script, open_console_webview, show_main_window_internal,
    show_update_window_internal, station_console_label, sub2api_console_script,
};
#[cfg(target_os = "macos")]
use windowing::{clear_ns_window_background, ensure_macos_app_icon, sync_macos_dock_visibility};

#[tauri::command]
async fn get_app_data(state: State<'_, AppState>) -> Result<AppData, String> {
    Ok(state.data.lock().await.clone())
}

#[tauri::command]
async fn get_persistence_notice(
    state: State<'_, AppState>,
) -> Result<Option<PersistenceNotice>, String> {
    Ok(state.persistence_notice.lock().await.clone())
}

#[tauri::command]
async fn import_app_data(
    input: AppDataImport,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<AppData, String> {
    let imported = normalize_imported_data(input)?;
    {
        let mut data = state.data.lock().await;
        *data = imported.clone();
        persist_data(&state.data_path, &data)?;
    }
    *state.persistence_notice.lock().await = None;
    let _ = apply_always_on_top(&app, imported.settings.always_on_top);
    let _ = apply_widget_visibility(&app, imported.settings.widget_enabled);
    let _ = app.emit("stations-changed", ());
    Ok(imported)
}

#[tauri::command]
async fn login_newapi(input: NewApiLoginInput) -> Result<NewApiLoginOutput, String> {
    let base_url = normalize_station_base_url(&input.base_url)?;
    let result = providers::login_newapi(&base_url, &input.username, &input.password).await?;
    Ok(NewApiLoginOutput {
        cookie: sanitize_cookie(&result.cookie),
        new_api_user: result.new_api_user,
        username: result.username,
    })
}

#[tauri::command]
async fn detect_station_type(base_url: String) -> Result<DetectStationTypeResult, String> {
    let normalized = match normalize_station_base_url(&base_url) {
        Ok(value) => value,
        Err(_) => {
            return Ok(DetectStationTypeResult {
                station_type: "unknown".to_string(),
            });
        }
    };
    if normalized.is_empty() {
        return Ok(DetectStationTypeResult {
            station_type: "unknown".to_string(),
        });
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|error| error.to_string())?;

    let candidates = [
        (
            "sub2api",
            format!(
                "{}/api/v1/settings/public?timezone=Asia%2FShanghai",
                normalized
            ),
        ),
        ("newapi", format!("{}/api/status", normalized)),
    ];

    for (kind, url) in candidates {
        let resp = match client
            .get(&url)
            .header("accept", "application/json, text/plain, */*")
            .header("cache-control", "no-store")
            .header("pragma", "no-cache")
            .send()
            .await
        {
            Ok(value) => value,
            Err(_) => continue,
        };
        if !resp.status().is_success() {
            continue;
        }
        let body = resp.text().await.unwrap_or_default();
        let value: serde_json::Value = match serde_json::from_str(&body) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if kind == "sub2api" {
            let code_ok = value.get("code").and_then(|v| v.as_i64()).unwrap_or(-1) == 0;
            let has_data = value.get("data").is_some();
            if code_ok && has_data {
                return Ok(DetectStationTypeResult {
                    station_type: "sub2api".to_string(),
                });
            }
            continue;
        }

        if kind == "newapi" {
            if value.get("data").is_some() {
                return Ok(DetectStationTypeResult {
                    station_type: "newapi".to_string(),
                });
            }
            continue;
        }
    }

    Ok(DetectStationTypeResult {
        station_type: "unknown".to_string(),
    })
}

#[tauri::command]
async fn save_settings(
    settings: AppSettings,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<AppData, String> {
    let normalized_settings = AppSettings {
        refresh_concurrency: normalize_refresh_concurrency(settings.refresh_concurrency) as u64,
        ..settings
    };
    apply_always_on_top(&app, normalized_settings.always_on_top)?;
    apply_widget_visibility(&app, normalized_settings.widget_enabled)?;
    let mut data = state.data.lock().await;
    data.settings = normalized_settings.clone();
    persist_data(&state.data_path, &data)?;
    let _ = app.emit("settings-updated", normalized_settings);
    Ok(data.clone())
}

#[tauri::command]
async fn add_station(
    mut station: Station,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<AppData, String> {
    let mut data = state.data.lock().await;
    let timestamp = now_ts();
    if station.id.is_empty() {
        station.id = Uuid::new_v4().to_string();
    }
    station.station_type = normalize_station_type(&station.station_type)?;
    station.base_url = normalize_station_base_url(&station.base_url)?;
    station.auth_mode = if station.auth_mode.trim().is_empty() {
        "manual".to_string()
    } else {
        station.auth_mode.trim().to_string()
    };
    station.created_at = timestamp;
    station.updated_at = timestamp;
    station.login_username = station.login_username.trim().to_string();
    if station.auth_mode == "login" {
        if station.login_username.is_empty() || station.login_password.is_empty() {
            return Err("请输入登录账号和密码".to_string());
        }
        station = login_station_credentials(&station).await?;
    } else {
        if station.station_type == "sub2api" {
            station.cookie = normalize_bearer_token(&station.cookie);
            station.new_api_user.clear();
        } else {
            station.cookie = sanitize_cookie(&station.cookie);
            station.new_api_user = station.new_api_user.trim().to_string();
        }
        station.login_password.clear();
    }
    data.stations.push(station);
    persist_data(&state.data_path, &data)?;
    let _ = app.emit("stations-changed", ());
    Ok(data.clone())
}

#[tauri::command]
async fn update_station(
    station: Station,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<AppData, String> {
    let mut data = state.data.lock().await;
    if let Some(existing) = data.stations.iter_mut().find(|item| item.id == station.id) {
        let mut normalized_station = station;
        if normalized_station.station_type.trim().is_empty() {
            normalized_station.station_type = existing.station_type.clone();
        }
        normalized_station.station_type = normalize_station_type(&normalized_station.station_type)?;
        normalized_station.base_url = normalize_station_base_url(&normalized_station.base_url)?;
        if normalized_station.station_type == "sub2api" {
            normalized_station.cookie = normalize_bearer_token(&normalized_station.cookie);
            normalized_station.new_api_user.clear();
        } else {
            normalized_station.cookie = sanitize_cookie(&normalized_station.cookie);
            normalized_station.new_api_user = normalized_station.new_api_user.trim().to_string();
        }
        normalized_station.auth_mode = if normalized_station.auth_mode.trim().is_empty() {
            existing.auth_mode.clone()
        } else {
            normalized_station.auth_mode.trim().to_string()
        };
        normalized_station.login_username = normalized_station.login_username.trim().to_string();
        if normalized_station.auth_mode == "login" {
            if normalized_station.login_username.is_empty()
                || normalized_station.login_password.is_empty()
            {
                return Err("请输入登录账号和密码".to_string());
            }
            normalized_station = login_station_credentials(&normalized_station).await?;
        } else {
            if normalized_station.station_type == "sub2api" {
                normalized_station.cookie = normalize_bearer_token(&normalized_station.cookie);
                normalized_station.new_api_user.clear();
            } else {
                normalized_station.cookie = sanitize_cookie(&normalized_station.cookie);
                normalized_station.new_api_user =
                    normalized_station.new_api_user.trim().to_string();
            }
            normalized_station.login_password.clear();
        }
        let updated_station = Station {
            updated_at: now_ts(),
            base_url: normalized_station.base_url.clone(),
            ..normalized_station
        };
        *existing = updated_station;
    }
    persist_data(&state.data_path, &data)?;
    let _ = app.emit("stations-changed", ());
    Ok(data.clone())
}

#[tauri::command]
async fn delete_station(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<AppData, String> {
    let mut data = state.data.lock().await;
    data.stations.retain(|item| item.id != id);
    data.snapshots.retain(|item| item.station_id != id);
    data.balance_history.retain(|item| item.station_id != id);
    data.local_station_reviews
        .retain(|item| item.station_id != id);
    persist_data(&state.data_path, &data)?;
    let _ = app.emit("stations-changed", ());
    Ok(data.clone())
}

#[tauri::command]
async fn save_station_review_record(
    input: SaveStationReviewRecordInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<AppData, String> {
    let station_id = input.station_id.trim();
    let station_name = input.station_name.trim();
    let base_url = normalize_url(&input.base_url);
    let station_type = input.station_type.trim();
    let content = input.content.trim();
    let rating = input.rating;

    if station_id.is_empty() {
        return Err("缺少中转站 ID，无法保存本机评价记录。".to_string());
    }
    if base_url.is_empty() {
        return Err("缺少中转站地址，无法保存本机评价记录。".to_string());
    }
    if !(1..=5).contains(&rating) {
        return Err("评分必须在 1 到 5 星之间。".to_string());
    }
    if content.chars().count() < 4 {
        return Err("评价内容至少需要 4 个字符。".to_string());
    }
    if content.chars().count() > 120 {
        return Err("评价内容请控制在 120 个字符以内。".to_string());
    }

    let mut data = state.data.lock().await;
    let exists = data
        .local_station_reviews
        .iter()
        .any(|item| item.station_id == station_id || normalize_url(&item.base_url) == base_url);
    if exists {
        return Err("当前设备已经提交过该中转站评价，不能重复提交。".to_string());
    }

    data.local_station_reviews.push(LocalStationReviewRecord {
        station_id: station_id.to_string(),
        station_name: station_name.to_string(),
        base_url,
        station_type: station_type.to_string(),
        rating,
        content: content.to_string(),
        submitted_at: now_ts(),
    });
    persist_data(&state.data_path, &data)?;
    let _ = app.emit("stations-changed", ());
    Ok(data.clone())
}

#[tauri::command]
async fn reorder_stations(
    station_ids: Vec<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<AppData, String> {
    let mut data = state.data.lock().await;
    let original = std::mem::take(&mut data.stations);
    let mut original_order = Vec::with_capacity(original.len());
    let mut station_map = HashMap::with_capacity(original.len());

    for station in original {
        original_order.push(station.id.clone());
        station_map.insert(station.id.clone(), station);
    }

    let mut reordered = Vec::with_capacity(original_order.len());
    for id in station_ids {
        if let Some(station) = station_map.remove(&id) {
            reordered.push(station);
        }
    }

    for id in original_order {
        if let Some(station) = station_map.remove(&id) {
            reordered.push(station);
        }
    }

    data.stations = reordered;
    persist_data(&state.data_path, &data)?;
    let _ = app.emit("stations-changed", ());
    Ok(data.clone())
}

#[tauri::command]
async fn refresh_station(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<AppData, String> {
    let (station, settings) = {
        let data = state.data.lock().await;
        let station = data
            .stations
            .iter()
            .find(|item| item.id == id)
            .cloned()
            .ok_or_else(|| "未找到中转站".to_string())?;
        (station, data.settings.clone())
    };
    let result = refresh_station_once(station, settings).await;
    if let Some(alert_item) =
        apply_station_refresh_result(&app, &state.data, &state.data_path, result, true).await?
    {
        let payload = build_low_balance_alert_payload(vec![alert_item]);
        show_low_balance_alert_payload(&app, &state, payload).await?;
    }
    Ok(state.data.lock().await.clone())
}

#[tauri::command]
async fn open_station_console(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let station = {
        let data = state.data.lock().await;
        data.stations
            .iter()
            .find(|item| item.id == id)
            .cloned()
            .ok_or_else(|| "未找到中转站".to_string())?
    };

    match station.station_type.as_str() {
        "" | "newapi" => {
            let prepared_station = ensure_station_credentials(&station).await?;
            let web_session = providers::build_newapi_web_session(&prepared_station).await?;
            let script = newapi_console_script(
                &prepared_station.base_url,
                &sanitize_cookie(&web_session.cookie),
                &web_session.new_api_user,
                &web_session.user_json,
                &web_session.status_json,
                &web_session.quota_display_type,
                &web_session.quota_per_unit,
                &web_session.system_name,
            )?;
            {
                let mut data = state.data.lock().await;
                if let Some(existing) = data
                    .stations
                    .iter_mut()
                    .find(|item| item.id == prepared_station.id)
                {
                    existing.cookie = prepared_station.cookie.clone();
                    existing.new_api_user = prepared_station.new_api_user.clone();
                    existing.login_username = prepared_station.login_username.clone();
                    existing.login_password = prepared_station.login_password.clone();
                    existing.auth_mode = prepared_station.auth_mode.clone();
                    existing.base_url = normalize_url(&prepared_station.base_url);
                }
                persist_data(&state.data_path, &data)?;
            }
            let title = if prepared_station.name.trim().is_empty() {
                "TokenNote Console".to_string()
            } else {
                format!("{} · 控制台", prepared_station.name)
            };
            open_console_webview(
                &app,
                &station_console_label(&prepared_station.id),
                &title,
                &format!("{}/login", normalize_url(&prepared_station.base_url)),
                &script,
            )?;
        }
        "sub2api" => {
            let prepared_station = ensure_station_credentials(&station).await?;
            let web_session = if station_uses_login(&prepared_station) {
                let login = providers::login_sub2api(
                    &prepared_station.base_url,
                    &prepared_station.login_username,
                    &prepared_station.login_password,
                )
                .await?;
                {
                    let mut data = state.data.lock().await;
                    if let Some(existing) = data
                        .stations
                        .iter_mut()
                        .find(|item| item.id == prepared_station.id)
                    {
                        existing.cookie = normalize_bearer_token(&login.access_token);
                    }
                    persist_data(&state.data_path, &data)?;
                }
                providers::Sub2ApiWebSession {
                    auth_token: login.access_token,
                    auth_user_json: login.auth_user_json,
                    refresh_token: login.refresh_token,
                    token_expires_at: login.token_expires_at,
                }
            } else {
                providers::build_sub2api_web_session_from_token(
                    &prepared_station.base_url,
                    &prepared_station.cookie,
                )
                .await?
            };

            let script = sub2api_console_script(
                &prepared_station.base_url,
                &web_session.auth_token,
                &web_session.auth_user_json,
                &web_session.refresh_token,
                web_session.token_expires_at,
            )?;
            let title = if prepared_station.name.trim().is_empty() {
                "TokenNote Dashboard".to_string()
            } else {
                format!("{} · 仪表盘", prepared_station.name)
            };
            open_console_webview(
                &app,
                &station_console_label(&prepared_station.id),
                &title,
                &format!("{}/login", normalize_url(&prepared_station.base_url)),
                &script,
            )?;
        }
        "deepseek" => {
            let prepared_station = ensure_station_credentials(&station).await?;
            if !station_uses_login(&prepared_station) {
                return Err("DeepSeek 快捷登录仅支持账号密码登录模式；当前手动凭证 / API Key 模式只能用于接口请求，不能直接登录网页控制台。".to_string());
            }
            let console_base_url = deepseek_console_base_url();
            {
                let mut data = state.data.lock().await;
                if let Some(existing) = data
                    .stations
                    .iter_mut()
                    .find(|item| item.id == prepared_station.id)
                {
                    existing.cookie = normalize_bearer_token(&prepared_station.cookie);
                    existing.new_api_user = prepared_station.new_api_user.clone();
                    existing.login_username = prepared_station.login_username.clone();
                    existing.login_password = prepared_station.login_password.clone();
                    existing.auth_mode = prepared_station.auth_mode.clone();
                    existing.base_url = normalize_url(console_base_url);
                }
                persist_data(&state.data_path, &data)?;
            }
            let script = deepseek_console_script(console_base_url, &prepared_station.cookie)?;
            let title = if prepared_station.name.trim().is_empty() {
                "TokenNote DeepSeek".to_string()
            } else {
                format!("{} · DeepSeek", prepared_station.name)
            };
            open_console_webview(
                &app,
                &station_console_label(&prepared_station.id),
                &title,
                &format!("{}/sign_in", normalize_url(console_base_url)),
                &script,
            )?;
        }
        other => return Err(format!("不支持的站点类型: {}", other)),
    }

    minimize_main_window_internal(&app)?;

    Ok(())
}

#[tauri::command]
async fn refresh_all(state: State<'_, AppState>, app: AppHandle) -> Result<AppData, String> {
    let (stations, settings) = {
        let data = state.data.lock().await;
        (
            data.stations
                .iter()
                .filter(|station| station.enabled)
                .cloned()
                .collect::<Vec<_>>(),
            data.settings.clone(),
        )
    };
    refresh_stations_with_limit(
        &app,
        &state.data,
        &state.data_path,
        stations,
        settings,
        false,
    )
    .await?;
    Ok(state.data.lock().await.clone())
}

#[tauri::command]
async fn set_always_on_top(value: bool, app: AppHandle) -> Result<(), String> {
    apply_always_on_top(&app, value)
}

#[tauri::command]
async fn show_main_window(app: AppHandle) -> Result<(), String> {
    show_main_window_internal(&app)
}

#[tauri::command]
async fn hide_main_window(app: AppHandle) -> Result<(), String> {
    hide_main_window_internal(&app)
}

#[tauri::command]
async fn show_update_window(app: AppHandle, payload: UpdateWindowPayload) -> Result<(), String> {
    show_update_window_internal(&app, payload)
}

#[tauri::command]
async fn hide_update_window(app: AppHandle) -> Result<(), String> {
    hide_update_window_internal(&app)
}

#[tauri::command]
async fn get_low_balance_alert_payload(
    state: State<'_, AppState>,
) -> Result<Option<LowBalanceAlertPayload>, String> {
    Ok(state.low_balance_alert_payload.lock().await.clone())
}

#[tauri::command]
async fn hide_low_balance_alert_window(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    *state.low_balance_alert_payload.lock().await = None;
    hide_low_balance_alert_window_internal(&app)
}

#[tauri::command]
async fn snap_to_edge(app: AppHandle, auto_hide: Option<bool>) -> Result<(), String> {
    let window = app
        .get_webview_window("widget")
        .or(app.get_webview_window("main"))
        .ok_or_else(|| "未找到窗口".to_string())?;

    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;

    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    if monitors.is_empty() {
        return Err("未检测到显示器".to_string());
    }

    // Hidden widget windows can sit partially outside the monitor bounds, so
    // choose the nearest display instead of relying on the top-left corner.
    let monitor = monitors
        .iter()
        .min_by_key(|monitor| {
            let mon_pos = monitor.position();
            let mon_size = monitor.size();
            let mon_left = mon_pos.x;
            let mon_top = mon_pos.y;
            let mon_right = mon_pos.x + mon_size.width as i32;
            let mon_bottom = mon_pos.y + mon_size.height as i32;
            let win_left = position.x;
            let win_top = position.y;
            let win_right = position.x + size.width as i32;
            let win_bottom = position.y + size.height as i32;

            let dx = if win_right < mon_left {
                mon_left - win_right
            } else if win_left > mon_right {
                win_left - mon_right
            } else {
                0
            } as i64;

            let dy = if win_bottom < mon_top {
                mon_top - win_bottom
            } else if win_top > mon_bottom {
                win_top - mon_bottom
            } else {
                0
            } as i64;

            dx * dx + dy * dy
        })
        .ok_or_else(|| "未找到显示器".to_string())?;

    let mon_pos = monitor.position();
    let mon_size = monitor.size();
    let snap_margin: i32 = 8;
    let reveal_width: i32 = 22;
    let should_auto_hide = auto_hide.unwrap_or(false);

    let win_center_x = position.x + (size.width as i32) / 2;
    let dist_left = win_center_x - mon_pos.x;
    let dist_right = (mon_pos.x + mon_size.width as i32) - win_center_x;

    let new_x = if dist_left <= dist_right {
        if should_auto_hide {
            mon_pos.x - size.width as i32 + reveal_width
        } else {
            mon_pos.x + snap_margin
        }
    } else {
        if should_auto_hide {
            mon_pos.x + mon_size.width as i32 - reveal_width
        } else {
            mon_pos.x + mon_size.width as i32 - (size.width as i32) - snap_margin
        }
    };

    let new_y = position.y.clamp(
        mon_pos.y,
        mon_pos.y + mon_size.height as i32 - (size.height as i32),
    );

    window
        .set_position(tauri::PhysicalPosition::new(new_x, new_y))
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        let _ = show_main_window_internal(app);
    }));
    let builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build());
    builder
        .setup(move |app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?;
            let data_path = app_dir.join("tokennote.json");
            let load_result = load_data(&data_path)?;
            if let Some(warning) = &load_result.warning {
                eprintln!("{}", warning.message);
            }

            let mut loaded_app_data = load_result.data;
            let original_history_len = loaded_app_data.balance_history.len();
            trim_balance_history(
                &mut loaded_app_data.balance_history,
                now_ts() - 7 * 24 * 3600,
                3000,
            );
            let history_trimmed = loaded_app_data.balance_history.len() != original_history_len;
            if load_result.should_persist || history_trimmed {
                let _ = persist_data(&data_path, &loaded_app_data);
            }
            let loaded_data = Arc::new(Mutex::new(loaded_app_data));
            let current = loaded_data.blocking_lock();
            let widget_enabled = current.settings.widget_enabled;
            let _ = apply_always_on_top(app.handle(), current.settings.always_on_top);
            let _ = apply_widget_visibility(app.handle(), current.settings.widget_enabled);
            drop(current);
            if !widget_enabled {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            #[cfg(target_os = "macos")]
            {
                if let Some(widget) = app.get_webview_window("widget") {
                    clear_ns_window_background(&widget);
                }
                if let Some(main) = app.get_webview_window("main") {
                    clear_ns_window_background(&main);
                }

                let _ = ensure_macos_app_icon();
                let _ = sync_macos_dock_visibility(app.handle());
            }

            #[cfg(any(target_os = "macos", target_os = "windows"))]
            {
                let open_main =
                    MenuItem::with_id(app, "show_main", "打开主界面", true, None::<&str>)
                        .map_err(|error| error.to_string())?;
                let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)
                    .map_err(|error| error.to_string())?;
                let menu = Menu::with_items(app, &[&open_main, &quit])
                    .map_err(|error| error.to_string())?;
                let icon = load_tray_icon(app.handle())?;

                let _tray = TrayIconBuilder::with_id("menu-bar")
                    .icon(icon)
                    .menu(&menu)
                    .icon_as_template(cfg!(target_os = "macos"))
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show_main" => {
                            let _ = show_main_window_internal(app);
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            let _ = show_main_window_internal(&app);
                        }
                    })
                    .build(app)
                    .map_err(|error| error.to_string())?;
            }
            app.manage(AppState {
                data: loaded_data.clone(),
                data_path: data_path.clone(),
                persistence_notice: Arc::new(Mutex::new(load_result.warning)),
                low_balance_alert_payload: Arc::new(Mutex::new(None)),
                low_balance_alerted_station_ids: Arc::new(Mutex::new(HashSet::new())),
            });
            start_scheduler(app.handle().clone(), loaded_data, data_path);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_data,
            get_persistence_notice,
            import_app_data,
            login_newapi,
            detect_station_type,
            save_settings,
            add_station,
            update_station,
            delete_station,
            save_station_review_record,
            reorder_stations,
            refresh_station,
            refresh_all,
            open_station_console,
            set_always_on_top,
            show_main_window,
            hide_main_window,
            show_update_window,
            hide_update_window,
            get_low_balance_alert_payload,
            hide_low_balance_alert_window,
            snap_to_edge
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
