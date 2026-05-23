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
#[cfg(any(target_os = "macos", target_os = "windows"))]
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;
use uuid::Uuid;

mod data;
mod device_id;
mod console_scripts;
mod force_reminder;
mod key_derivation;
mod key_storage;
mod models;
mod providers;
mod refresh;
mod secure_storage;
mod security;
mod source_label;
mod update_check;
mod android_summary;
mod currency;

// 桌面端窗口管理：托盘、悬浮窗、多窗口、macOS dock 控制等。
// Android 上 Tauri 不提供 `set_always_on_top` / `minimize` 等 API，使用 `windowing_android` 桩模块替代，
// 通过 `pub(crate) use ... as windowing` 在 Android target 下保持上层调用入口一致。
#[cfg(not(target_os = "android"))]
mod windowing;

#[cfg(target_os = "android")]
mod windowing_android;
#[cfg(target_os = "android")]
use windowing_android as windowing;

// 安卓 JNI 桥接（前台 Service / 通知 / Android ID）。
// 模块所在目录 `src-tauri/src/android/` 已被 `.gitignore` 排除，不进入公开仓库。
#[cfg(target_os = "android")]
mod android;

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
    ForceReminderPayload, LowBalanceAlertPayload, NewApiLoginInput, NewApiLoginOutput,
    SaveStationReviewRecordInput, UpdateWindowPayload,
};
use refresh::{
    apply_station_refresh_result, build_low_balance_alert_payload, ensure_station_credentials,
    login_station_credentials, refresh_station_once, refresh_stations_with_limit,
    show_low_balance_alert_payload, start_scheduler, station_uses_login,
};
use security::normalize_station_base_url;
use windowing::{
    apply_always_on_top, apply_widget_visibility, deepseek_console_base_url,
    deepseek_console_script, external_link_guard_script,
    hide_force_reminder_window_internal,
    hide_low_balance_alert_window_internal, hide_main_window_internal,
    hide_security_notice_window_internal, hide_update_window_internal,
    minimize_main_window_internal, newapi_console_script, open_console_webview,
    show_force_reminder_window_internal, show_main_window_internal,
    show_security_notice_window_internal, show_update_window_internal, station_console_label,
    sub2api_console_script,
};
#[cfg(not(target_os = "android"))]
use windowing::load_tray_icon;
#[cfg(target_os = "macos")]
use windowing::{clear_ns_window_background, ensure_macos_app_icon, sync_macos_dock_visibility};

async fn show_startup_force_reminder(app_handle: &AppHandle) {
    let Some(payload) = force_reminder::fetch_active_force_reminder().await else {
        return;
    };

    if payload.mode == "once" {
        let already_read = {
            let state = app_handle.state::<AppState>();
            let data = state.data.lock().await;
            payload
                .updated_at
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|updated_at| {
                    data.read_force_reminder_updated_ats
                        .iter()
                        .any(|item| item == updated_at)
                })
                .unwrap_or(false)
        };
        if already_read {
            return;
        }
    }

    for _ in 0..20 {
        let notice_visible = app_handle
            .get_webview_window("security-notice")
            .and_then(|window| window.is_visible().ok())
            .unwrap_or(false);
        if !notice_visible {
            break;
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
    }

    let state = app_handle.state::<AppState>();
    *state.force_reminder_payload.lock().await = Some(payload.clone());

    // Android：强制提醒在应用内弹层之外，再发一条系统通知，
    // 保证 App 退后台 / 杀掉重开后用户也能看到提醒。
    // 桌面端继续走独立窗口，本块没有副作用。
    #[cfg(target_os = "android")]
    {
        let android_enabled = {
            let state = app_handle.state::<AppState>();
            let data = state.data.lock().await;
            data.settings.android_force_reminder_notification_enabled
        };
        if android_enabled {
            let title = match payload.r#type.as_str() {
                "warning" => "TokenNote · 提醒",
                "danger" => "TokenNote · 重要提醒",
                _ => "TokenNote · 启动提醒",
            };
            let body = if payload.content.chars().count() > 120 {
                let truncated: String = payload.content.chars().take(120).collect();
                format!("{}…", truncated)
            } else {
                payload.content.clone()
            };
            let _ = android::push_force_reminder_notification(title, &body);
        }
    }

    let _ = show_force_reminder_window_on_main_thread(app_handle, payload);
}

async fn set_active_update_window_payload(
    app: &AppHandle,
    payload: Option<UpdateWindowPayload>,
) {
    let state = app.state::<AppState>();
    *state.update_window_payload.lock().await = payload;
}

fn show_update_window_on_main_thread(
    app: &AppHandle,
    payload: UpdateWindowPayload,
) -> Result<(), String> {
    let app_handle = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) = show_update_window_internal(&app_handle, payload) {
            eprintln!("展示更新窗口失败: {}", error);
        }
    })
    .map_err(|error| error.to_string())
}

fn show_security_notice_window_on_main_thread(app: &AppHandle) -> Result<(), String> {
    let app_handle = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) = show_security_notice_window_internal(&app_handle) {
            eprintln!("展示数据安全提示窗口失败: {}", error);
        }
    })
    .map_err(|error| error.to_string())
}

fn show_force_reminder_window_on_main_thread(
    app: &AppHandle,
    payload: ForceReminderPayload,
) -> Result<(), String> {
    let app_handle = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) = show_force_reminder_window_internal(&app_handle, payload) {
            eprintln!("展示强制提醒窗口失败: {}", error);
        }
    })
    .map_err(|error| error.to_string())
}

fn hide_update_window_on_main_thread(app: &AppHandle) -> Result<(), String> {
    let app_handle = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) = hide_update_window_internal(&app_handle) {
            eprintln!("隐藏更新窗口失败: {}", error);
        }
    })
    .map_err(|error| error.to_string())
}

async fn run_startup_window_sequence(app_handle: AppHandle, security_notice_acknowledged: bool) {
    let security_notice_due_at = tokio::time::Instant::now() + Duration::from_millis(800);
    let force_reminder_due_at = tokio::time::Instant::now() + Duration::from_millis(1200);

    match update_check::fetch_required_update_payload(&app_handle).await {
        Ok(Some(payload)) => {
            set_active_update_window_payload(&app_handle, Some(payload.clone())).await;
            let _ = show_update_window_on_main_thread(&app_handle, payload);
            return;
        }
        Ok(None) => {}
        Err(error) => eprintln!("启动时检查强制更新失败: {}", error),
    }

    if !security_notice_acknowledged {
        tokio::time::sleep_until(security_notice_due_at).await;
        let _ = show_security_notice_window_on_main_thread(&app_handle);
    }

    tokio::time::sleep_until(force_reminder_due_at).await;
    show_startup_force_reminder(&app_handle).await;
}

/// 命令名称：等待 AppState 就绪
/// 请求地址：仅供本文件内 `get_app_data` / `get_persistence_notice` 复用，不暴露给前端
/// 主要功能：在 `app.manage(AppState)` 完成之前，IPC 命令调用方可能比 setup 闭包跑得更早，
///           Tauri 默认会以 "state not managed" 直接 reject。这里做最多 ~3s 的短轮询，
///           直到 state 注册完成再返回，避免前端为此丢弃首屏数据。
/// 权限范围：内部 helper，无前端暴露
async fn wait_for_app_state(app: &AppHandle) -> Result<State<'_, AppState>, String> {
    // 安卓端 setup 闭包与 webview JS 是并发运行的：webview 起来后立刻 `invoke('get_app_data')`，
    // 此时 setup 还在 `load_data` / 解密 / 备份恢复，state 尚未 manage。把"早到的 invoke"
    // 等到 setup 完成是最简单也最稳的办法，不需要给前端再设计重试节奏。
    const MAX_ATTEMPTS: u32 = 60;
    const SLEEP_MS: u64 = 50;
    for _ in 0..MAX_ATTEMPTS {
        if let Some(state) = app.try_state::<AppState>() {
            return Ok(state);
        }
        tokio::time::sleep(std::time::Duration::from_millis(SLEEP_MS)).await;
    }
    Err("应用尚未完成初始化，请稍后再试".to_string())
}

/// 命令名称：获取应用数据
/// 请求地址：tauri invoke `get_app_data`
/// 主要功能：返回当前内存中的 `AppData`（站点、设置、快照、本地评测等）
/// 权限范围：本地前端调用，无网络暴露
#[tauri::command]
async fn get_app_data(app: AppHandle) -> Result<AppData, String> {
    let state = wait_for_app_state(&app).await?;
    // 显式把克隆值落在 local 变量上，让 `MutexGuard` 与 `State` 借用都在 return 前先 drop，
    // 避免临时借用在 `Ok(...)` 末尾还活着、与函数返回的生命周期冲突。
    let data = state.data.lock().await.clone();
    Ok(data)
}

/// 命令名称：获取持久化告警
/// 请求地址：tauri invoke `get_persistence_notice`
/// 主要功能：返回最近一次 `load_data` 留下的告警（解密失败 / 备份恢复 等）
/// 权限范围：本地前端调用，无网络暴露
#[tauri::command]
async fn get_persistence_notice(app: AppHandle) -> Result<Option<PersistenceNotice>, String> {
    let state = wait_for_app_state(&app).await?;
    let notice = state.persistence_notice.lock().await.clone();
    Ok(notice)
}

fn sync_auto_launch(app: &AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        let manager = app.autolaunch();
        let current_enabled = manager.is_enabled().map_err(|error| error.to_string())?;
        if current_enabled != enabled {
            if enabled {
                manager.enable().map_err(|error| error.to_string())?;
            } else {
                manager.disable().map_err(|error| error.to_string())?;
            }
        }
    }
    // Linux 与 Android 端没有挂接开机自启，参数显式消费一下避免未使用告警。
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let _ = (app, enabled);

    Ok(())
}

fn apply_runtime_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    apply_always_on_top(app, settings.always_on_top)?;
    apply_widget_visibility(app, settings.widget_enabled)?;
    sync_auto_launch(app, settings.auto_launch_enabled)?;
    Ok(())
}

#[tauri::command]
async fn import_app_data(
    input: AppDataImport,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<AppData, String> {
    let imported = normalize_imported_data(input)?;
    let previous_data = state.data.lock().await.clone();

    if let Err(error) = apply_runtime_settings(&app, &imported.settings) {
        let _ = apply_runtime_settings(&app, &previous_data.settings);
        return Err(error);
    }

    if let Err(error) = persist_data(&state.data_path, &imported) {
        let _ = apply_runtime_settings(&app, &previous_data.settings);
        return Err(error);
    }

    {
        let mut data = state.data.lock().await;
        *data = imported.clone();
    }
    *state.persistence_notice.lock().await = None;
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
                label: "未知".to_string(),
                min_client_version: None,
            });
        }
    };
    if normalized.is_empty() {
        return Ok(DetectStationTypeResult {
            station_type: "unknown".to_string(),
            label: "未知".to_string(),
            min_client_version: None,
        });
    }

    // 优先调用云端识别
    if let Some(result) = detect_station_type_cloud(&normalized).await {
        return Ok(result);
    }

    // 云端失败时降级到本地识别
    detect_station_type_local(&normalized).await
}

async fn detect_station_type_cloud(base_url: &str) -> Option<DetectStationTypeResult> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .ok()?;

    let machine_uuid = device_id::machine_id_or_default();
    let current_version = env!("CARGO_PKG_VERSION");

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CloudDetectPayload {
        #[serde(rename = "type")]
        station_type: String,
        label: String,
        min_client_version: Option<String>,
    }

    #[derive(serde::Deserialize)]
    struct CloudDetectResponse {
        data: CloudDetectPayload,
    }

    let resp = client
        .post("https://update.tokennote.dev/public/station-detect")
        .header("content-type", "application/json")
        .json(&serde_json::json!({
            "baseUrl": base_url,
            "clientVersion": current_version,
            "source": source_label::source_label(),
            "machineUuid": machine_uuid
        }))
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let data: CloudDetectResponse = resp.json().await.ok()?;

    Some(DetectStationTypeResult {
        station_type: data.data.station_type,
        label: data.data.label,
        min_client_version: data.data.min_client_version,
    })
}

async fn detect_station_type_local(base_url: &str) -> Result<DetectStationTypeResult, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|error| error.to_string())?;

    let candidates = [
        (
            "sub2api",
            "Sub2API",
            format!(
                "{}/api/v1/settings/public?timezone=Asia%2FShanghai",
                base_url
            ),
        ),
        ("newapi", "NewAPI", format!("{}/api/status", base_url)),
    ];

    for (kind, label, url) in candidates {
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
                    label: label.to_string(),
                    min_client_version: None,
                });
            }
            continue;
        }

        if kind == "newapi" {
            if value.get("data").is_some() {
                return Ok(DetectStationTypeResult {
                    station_type: "newapi".to_string(),
                    label: label.to_string(),
                    min_client_version: None,
                });
            }
            continue;
        }
    }

    Ok(DetectStationTypeResult {
        station_type: "unknown".to_string(),
        label: "未知".to_string(),
        min_client_version: None,
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
    let previous_data = state.data.lock().await.clone();
    if let Err(error) = apply_runtime_settings(&app, &normalized_settings) {
        let _ = apply_runtime_settings(&app, &previous_data.settings);
        return Err(error);
    }

    let mut next_data = previous_data.clone();
    next_data.settings = normalized_settings.clone();
    if let Err(error) = persist_data(&state.data_path, &next_data) {
        let _ = apply_runtime_settings(&app, &previous_data.settings);
        return Err(error);
    }

    let mut data = state.data.lock().await;
    *data = next_data;
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
            let station_origin = normalize_url(&prepared_station.base_url);
            let station_display_name = if prepared_station.name.trim().is_empty() {
                station_origin.clone()
            } else {
                prepared_station.name.clone()
            };
            let script = format!(
                "{}{}",
                newapi_console_script(
                    &prepared_station.base_url,
                    &sanitize_cookie(&web_session.cookie),
                    &web_session.new_api_user,
                    &web_session.user_json,
                    &web_session.status_json,
                    &web_session.quota_display_type,
                    &web_session.quota_per_unit,
                    &web_session.system_name,
                )?,
                external_link_guard_script(&station_origin, &station_display_name)?
            );
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

            let station_origin = normalize_url(&prepared_station.base_url);
            let station_display_name = if prepared_station.name.trim().is_empty() {
                station_origin.clone()
            } else {
                prepared_station.name.clone()
            };
            let script = format!(
                "{}{}",
                sub2api_console_script(
                    &prepared_station.base_url,
                    &web_session.auth_token,
                    &web_session.auth_user_json,
                    &web_session.refresh_token,
                    web_session.token_expires_at,
                )?,
                external_link_guard_script(&station_origin, &station_display_name)?
            );
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
            let station_origin = normalize_url(console_base_url);
            let station_display_name = if prepared_station.name.trim().is_empty() {
                station_origin.clone()
            } else {
                prepared_station.name.clone()
            };
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
            let script = format!(
                "{}{}",
                deepseek_console_script(console_base_url, &prepared_station.cookie)?,
                external_link_guard_script(&station_origin, &station_display_name)?
            );
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
async fn confirm_open_external_url(
    url: String,
    station_name: String,
    reason: String,
    app: AppHandle,
) -> Result<(), String> {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

    let trimmed = url.trim();
    let parsed = crate::security::validate_http_url(trimmed, true)?;
    let display_url = parsed.as_str().to_string();
    let reason_text = match reason.as_str() {
        "window.open" => "弹出新窗口",
        "target_blank" => "新标签页链接",
        "cross_origin" => "跨域跳转",
        _ => "外部链接",
    };
    let message = format!(
        "来源：{}\n类型：{}\n目标：{}\n\n是否使用系统浏览器打开此链接？",
        station_name, reason_text, display_url
    );
    let title = format!("{} · 外部链接确认", station_name);
    let confirmed = app
        .dialog()
        .message(message)
        .title(title)
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "使用浏览器打开".to_string(),
            "取消".to_string(),
        ))
        .blocking_show();
    if confirmed {
        tauri_plugin_opener::open_url(&display_url, None::<&str>)
            .map_err(|error| error.to_string())?;
    }
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

/// 命令名称：请求退出应用
/// 请求地址：tauri invoke `request_app_exit`
/// 主要功能：让前端在响应安卓系统返回手势时，能从顶层把 Activity finish 掉，避免出现"按一次没反应"的体感。
/// 权限范围：本地前端调用，无网络暴露
#[tauri::command]
async fn request_app_exit(app: AppHandle) -> Result<(), String> {
    // 桌面端（macOS / Windows）通常由托盘菜单或窗口关闭按钮收尾；移动端则直接 exit(0)
    // 让 Activity 与前台 Service 一起结束。这里不做平台分支：桌面端默认前端不会调到这个命令。
    app.exit(0);
    Ok(())
}

#[tauri::command]
async fn show_update_window(app: AppHandle, payload: UpdateWindowPayload) -> Result<(), String> {
    set_active_update_window_payload(&app, Some(payload.clone())).await;
    show_update_window_on_main_thread(&app, payload)
}

#[tauri::command]
async fn hide_update_window(
    app: AppHandle,
    state: State<'_, AppState>,
    allow_required: Option<bool>,
) -> Result<(), String> {
    let allow_required = allow_required.unwrap_or(false);
    if !allow_required {
        let active_payload = state.update_window_payload.lock().await.clone();
        if active_payload
            .as_ref()
            .map(|payload| payload.mode == "required")
            .unwrap_or(false)
        {
            return Ok(());
        }
    }
    set_active_update_window_payload(&app, None).await;
    hide_update_window_on_main_thread(&app)
}

#[tauri::command]
async fn get_update_window_payload(
    state: State<'_, AppState>,
) -> Result<Option<UpdateWindowPayload>, String> {
    Ok(state.update_window_payload.lock().await.clone())
}

#[tauri::command]
async fn get_low_balance_alert_payload(
    state: State<'_, AppState>,
) -> Result<Option<LowBalanceAlertPayload>, String> {
    Ok(state.low_balance_alert_payload.lock().await.clone())
}

#[tauri::command]
async fn get_force_reminder_payload(
    state: State<'_, AppState>,
) -> Result<Option<ForceReminderPayload>, String> {
    Ok(state.force_reminder_payload.lock().await.clone())
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
async fn hide_security_notice_window(app: AppHandle) -> Result<(), String> {
    hide_security_notice_window_internal(&app)
}

#[tauri::command]
async fn acknowledge_security_notice(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let mut data = state.data.lock().await;
    if !data.security_notice_acknowledged {
        data.security_notice_acknowledged = true;
        persist_data(&state.data_path, &data)?;
    }
    drop(data);
    hide_security_notice_window_internal(&app)
}

#[tauri::command]
async fn hide_force_reminder_window(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    *state.force_reminder_payload.lock().await = None;
    hide_force_reminder_window_internal(&app)
}

#[tauri::command]
async fn acknowledge_force_reminder(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let payload = state.force_reminder_payload.lock().await.clone();

    if let Some(payload) = payload {
        if payload.mode == "once" {
            if let Some(updated_at) = payload
                .updated_at
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                let mut data = state.data.lock().await;
                let exists = data
                    .read_force_reminder_updated_ats
                    .iter()
                    .any(|item| item == updated_at);
                if !exists {
                    data.read_force_reminder_updated_ats
                        .push(updated_at.to_string());
                    if data.read_force_reminder_updated_ats.len() > 100 {
                        let overflow = data.read_force_reminder_updated_ats.len() - 100;
                        data.read_force_reminder_updated_ats.drain(0..overflow);
                    }
                    persist_data(&state.data_path, &data)?;
                }
            }
        }

        if let Some(updated_at) = payload.updated_at.clone() {
            tauri::async_runtime::spawn(async move {
                force_reminder::submit_force_reminder_read(&updated_at).await;
            });
        }
    }

    *state.force_reminder_payload.lock().await = None;
    hide_force_reminder_window_internal(&app)
}

#[tauri::command]
async fn get_machine_uuid() -> String {
    device_id::machine_id_or_default()
}

/// 启动 / 停止 Android 前台 Service。
/// 桌面端无对应概念，统一返回成功，方便前端不必为不同平台分支。
#[tauri::command]
async fn set_android_background_refresh(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if enabled {
            android::start_refresh_service()?;
        } else {
            android::stop_refresh_service()?;
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = enabled;
    Ok(())
}

/// 更新 Android 常驻通知。Rust 共享逻辑刷新成功后由前端转发调用。
/// 桌面端 no-op，避免前端做多平台分支。
#[tauri::command]
async fn update_android_persistent_notification(
    title: String,
    summary: String,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        android::update_persistent_notification(&title, &summary)?;
    }
    #[cfg(not(target_os = "android"))]
    let _ = (title, summary);
    Ok(())
}

/// 推送一条低余额通知。前端在 alert payload 出现时调用。
#[tauri::command]
async fn push_android_low_balance_notification(
    title: String,
    body: String,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        android::push_low_balance_notification(&title, &body)?;
    }
    #[cfg(not(target_os = "android"))]
    let _ = (title, body);
    Ok(())
}

/// 把最新的小组件数据推送给 Android 桌面小组件。
/// 数据结构由前端按 `WidgetData` JSON 拼好（`stations` / `currencyTotals` / `summary` / `lastUpdatedLabel`）。
/// 桌面端 no-op，避免前端做平台分支。
#[tauri::command]
async fn update_android_widgets(payload: serde_json::Value) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        let json = serde_json::to_string(&payload)
            .map_err(|error| format!("序列化小组件数据失败: {}", error))?;
        android::update_widgets_with_json(&json)?;
    }
    #[cfg(not(target_os = "android"))]
    let _ = payload;
    Ok(())
}

#[cfg(not(target_os = "android"))]
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

#[cfg(target_os = "android")]
#[tauri::command]
async fn snap_to_edge(_app: AppHandle, _auto_hide: Option<bool>) -> Result<(), String> {
    // Android 端没有悬浮窗，贴边动作直接 no-op，让前端继续保留按钮也不报错。
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Android：把 panic message 通过 stderr 抛出，让 logcat 的 `RustStdoutStderr`
    // 能拿到具体内容。tao 的 ndk_glue 在 Activity 创建时若 panic，原本只能看到 native abort
    // 堆栈，看不到 Rust 侧 message，这里手动打印一份。
    #[cfg(target_os = "android")]
    {
        std::panic::set_hook(Box::new(|info| {
            eprintln!("[tokennote panic] {}", info);
            if let Ok(true) = std::env::var("RUST_BACKTRACE").map(|v| v == "1" || v == "full") {
                eprintln!("{}", std::backtrace::Backtrace::force_capture());
            }
        }));
    }

    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        let _ = show_main_window_internal(app);
    }));
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    let builder = builder.plugin(tauri_plugin_autostart::init(
        MacosLauncher::LaunchAgent,
        None::<Vec<&str>>,
    ));
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

            // 这里在把数据塞进 `Arc<Mutex<>>` 之前先取出需要的字段，避免后续再锁。
            // 注：使用 `tokio::sync::Mutex::blocking_lock()` 在 Tauri 2 mobile 的 setup 里
            // 会 panic（"Cannot block the current thread from within a runtime."），
            // 桌面端因为 setup 不在 tokio 上下文中暂未触发；移动端启动会直接 abort。
            let widget_enabled = loaded_app_data.settings.widget_enabled;
            let security_notice_acknowledged = loaded_app_data.security_notice_acknowledged;
            #[cfg(target_os = "android")]
            let android_background_refresh_enabled =
                loaded_app_data.settings.android_background_refresh_enabled;
            let _ = apply_runtime_settings(app.handle(), &loaded_app_data.settings);

            let loaded_data = Arc::new(Mutex::new(loaded_app_data));

            // 必须在 webview 触发首个 IPC 之前完成 manage：
            // 安卓端 setup 与 webview 创建是并发的，前端 React 挂载后会立刻调用
            // `get_app_data`，如果在 manage 之前到达，Tauri 会以 "state not managed"
            // 直接 reject，导致前端 stations 一直是空，必须等用户手动刷新（refresh_all）
            // 才能看到站点。所以把 manage / start_scheduler 提到所有窗口显示与平台 UI
            // 操作之前，让 invoke 命令在最早可能的时间就具备完整的 AppState。
            app.manage(AppState {
                data: loaded_data.clone(),
                data_path: data_path.clone(),
                persistence_notice: Arc::new(Mutex::new(load_result.warning)),
                update_window_payload: Arc::new(Mutex::new(None)),
                low_balance_alert_payload: Arc::new(Mutex::new(None)),
                force_reminder_payload: Arc::new(Mutex::new(None)),
                low_balance_alerted_station_ids: Arc::new(Mutex::new(HashSet::new())),
            });
            start_scheduler(app.handle().clone(), loaded_data, data_path);

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

            // Android：根据用户上一次保存的"后台刷新"开关来决定是否启动前台 Service。
            // 之前 Kotlin 在 MainActivity.onCreate 里无条件启动，会覆盖用户的关闭操作；
            // 现在统一交给 Rust 在读完 settings 之后再调。
            #[cfg(target_os = "android")]
            if android_background_refresh_enabled {
                let _ = android::start_refresh_service();
            }

            let startup_app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                run_startup_window_sequence(startup_app_handle, security_notice_acknowledged).await;
            });

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
            confirm_open_external_url,
            set_always_on_top,
            show_main_window,
            hide_main_window,
            request_app_exit,
            show_update_window,
            hide_update_window,
            get_update_window_payload,
            get_low_balance_alert_payload,
            get_force_reminder_payload,
            hide_low_balance_alert_window,
            hide_security_notice_window,
            acknowledge_security_notice,
            hide_force_reminder_window,
            acknowledge_force_reminder,
            get_machine_uuid,
            set_android_background_refresh,
            update_android_persistent_notification,
            push_android_low_balance_notification,
            update_android_widgets,
            snap_to_edge
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
