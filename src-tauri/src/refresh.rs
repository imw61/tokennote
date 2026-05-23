use std::{path::PathBuf, time::Duration};

use tauri::{AppHandle, Emitter, Manager};

use crate::{
    data::{
        normalize_bearer_token, normalize_url, now_ts, persist_data, sanitize_cookie,
        trim_balance_history,
    },
    models::{
        AppSettings, AppState, BalanceHistoryPoint, BalanceSnapshot, LowBalanceAlertItem,
        LowBalanceAlertPayload, SharedData, Station,
    },
    providers,
};

#[cfg(not(target_os = "android"))]
use crate::windowing::show_low_balance_alert_window_internal;
#[cfg(target_os = "android")]
use crate::windowing_android::show_low_balance_alert_window_internal;

const FETCH_RETRY_COUNT: usize = 2;
const FETCH_RETRY_DELAY_MS: u64 = 800;

pub(crate) fn station_uses_login(station: &Station) -> bool {
    matches!(
        station.station_type.as_str(),
        "" | "newapi" | "sub2api" | "deepseek"
    ) && station.auth_mode == "login"
        && !station.login_username.trim().is_empty()
        && !station.login_password.is_empty()
}

fn station_needs_login(station: &Station) -> bool {
    if !station_uses_login(station) {
        return false;
    }
    if station.station_type == "sub2api" {
        return normalize_bearer_token(&station.cookie).is_empty();
    }
    if station.station_type == "deepseek" {
        return station.cookie.trim().is_empty();
    }
    station.cookie.trim().is_empty() || station.new_api_user.trim().is_empty()
}

fn should_retry_with_login(station: &Station, error: &str) -> bool {
    if !station_uses_login(station) {
        return false;
    }
    if station.station_type == "deepseek" {
        return false;
    }
    let lower = error.to_lowercase();
    lower.contains("http 401")
        || lower.contains("http 403")
        || lower.contains("unauthorized")
        || lower.contains("forbidden")
        || lower.contains("invalid session")
        || lower.contains("请登录")
        || lower.contains("登录")
}

pub(crate) async fn login_station_credentials(station: &Station) -> Result<Station, String> {
    let mut updated = station.clone();
    updated.base_url = normalize_url(&updated.base_url);
    match updated.station_type.as_str() {
        "" | "newapi" => {
            let result = providers::login_newapi(
                &updated.base_url,
                &updated.login_username,
                &updated.login_password,
            )
            .await?;
            updated.cookie = sanitize_cookie(&result.cookie);
            updated.new_api_user = result.new_api_user.trim().to_string();
            if updated.name.trim().is_empty() && !result.username.trim().is_empty() {
                updated.name = result.username;
            }
        }
        "sub2api" => {
            let result = providers::login_sub2api(
                &updated.base_url,
                &updated.login_username,
                &updated.login_password,
            )
            .await?;
            updated.cookie = normalize_bearer_token(&result.access_token);
            updated.new_api_user.clear();
            if updated.name.trim().is_empty() && !result.username.trim().is_empty() {
                updated.name = result.username;
            }
        }
        "deepseek" => {
            let result =
                providers::login_deepseek(&updated.login_username, &updated.login_password).await?;
            updated.cookie = normalize_bearer_token(&result.token);
            updated.new_api_user = result.username.trim().to_string();
            if updated.name.trim().is_empty() && !result.username.trim().is_empty() {
                updated.name = result.username;
            }
        }
        other => return Err(format!("不支持的站点类型: {}", other)),
    }
    Ok(updated)
}

pub(crate) async fn ensure_station_credentials(station: &Station) -> Result<Station, String> {
    if station_needs_login(station) {
        return login_station_credentials(station).await;
    }
    Ok(station.clone())
}

async fn fetch_station_snapshot_once(
    station: &Station,
    settings: &AppSettings,
) -> Result<(Station, BalanceSnapshot), String> {
    let prepared_station = ensure_station_credentials(station).await?;
    match providers::fetch_snapshot(&prepared_station, settings).await {
        Ok(snapshot) => Ok((prepared_station, snapshot)),
        Err(error) if should_retry_with_login(&prepared_station, &error) => {
            let relogined_station = login_station_credentials(&prepared_station).await?;
            let snapshot = providers::fetch_snapshot(&relogined_station, settings).await?;
            Ok((relogined_station, snapshot))
        }
        Err(error) => Err(error),
    }
}

async fn fetch_station_snapshot_with_retry(
    station: &Station,
    settings: &AppSettings,
) -> Result<(Station, BalanceSnapshot), String> {
    let mut last_error: Option<String> = None;
    for attempt in 0..=FETCH_RETRY_COUNT {
        match fetch_station_snapshot_once(station, settings).await {
            Ok(result) => return Ok(result),
            Err(error) => {
                last_error = Some(error);
                if attempt < FETCH_RETRY_COUNT {
                    tokio::time::sleep(Duration::from_millis(FETCH_RETRY_DELAY_MS)).await;
                }
            }
        }
    }
    let message = last_error.unwrap_or_else(|| "未知错误".to_string());
    Err(format!(
        "获取站点信息失败，已自动重试{}次：{}",
        FETCH_RETRY_COUNT, message
    ))
}

fn failed_snapshot(station: &Station, error: String) -> BalanceSnapshot {
    BalanceSnapshot {
        station_id: station.id.clone(),
        station_name: station.name.clone(),
        username: String::new(),
        current_balance: 0.0,
        historical_consumption: 0.0,
        request_count: 0.0,
        stats_count: 0,
        total_quota: 0.0,
        total_tokens: 0.0,
        average_rpm: 0.0,
        average_tpm: 0.0,
        today_request_count: 0.0,
        today_tokens: 0.0,
        today_input_tokens: 0.0,
        today_output_tokens: 0.0,
        today_actual_cost: 0.0,
        today_cost: 0.0,
        average_response_ms: 0.0,
        quota_per_unit: 500_000.0,
        currency: "USD".to_string(),
        models: Vec::new(),
        fetched_at: now_ts(),
        status: "failed".to_string(),
        error_message: Some(summarize_station_fetch_error(&error)),
        api_station_name: None,
    }
}

fn extract_http_status_code(error: &str) -> Option<u16> {
    let marker = "HTTP ";
    let start = error.find(marker)? + marker.len();
    error[start..].split_whitespace().next()?.parse::<u16>().ok()
}

fn summarize_station_fetch_error(error: &str) -> String {
    let trimmed = error.trim();
    let first_line = trimmed.lines().next().unwrap_or(trimmed).trim();
    let lower = trimmed.to_lowercase();

    if !trimmed.contains('\n') && first_line.chars().count() <= 28 {
        return first_line.to_string();
    }

    if lower.contains("请重新登录")
        || lower.contains("请登录")
        || lower.contains("invalid token")
        || lower.contains("authorization failed")
    {
        return "登录状态已失效，请重新登录".to_string();
    }

    if let Some(status) = extract_http_status_code(trimmed) {
        return match status {
            400 => "站点配置有误，请检查后重试".to_string(),
            401 | 403 => "登录状态已失效，请重新登录".to_string(),
            404 => "站点接口不存在，请检查地址".to_string(),
            408 => "站点响应超时，请稍后重试".to_string(),
            429 => "请求过于频繁，请稍后重试".to_string(),
            500..=599 => "站点服务异常，请稍后重试".to_string(),
            _ => "获取站点信息失败，请稍后重试".to_string(),
        };
    }

    if lower.contains("timed out")
        || lower.contains("timeout")
        || lower.contains("deadline has elapsed")
    {
        return "站点响应超时，请稍后重试".to_string();
    }

    if lower.contains("failed to lookup address information")
        || lower.contains("name or service not known")
        || lower.contains("nodename nor servname provided")
        || lower.contains("dns")
    {
        return "域名解析失败，请检查站点地址".to_string();
    }

    if lower.contains("connection refused")
        || lower.contains("connection reset")
        || lower.contains("connection closed")
        || lower.contains("error trying to connect")
        || lower.contains("tcp connect error")
    {
        return "连接站点失败，请检查地址或网络".to_string();
    }

    if lower.contains("certificate") || lower.contains("tls") || lower.contains("ssl") {
        return "站点证书异常，请检查 HTTPS 配置".to_string();
    }

    if lower.contains("解析 ") || lower.contains("expected") {
        return "站点返回异常，请稍后重试".to_string();
    }

    if first_line.chars().count() <= 40 {
        return first_line.to_string();
    }

    "获取站点信息失败，请稍后重试".to_string()
}

pub(crate) struct StationRefreshResult {
    pub(crate) resolved_station: Station,
    pub(crate) snapshot: BalanceSnapshot,
}

fn build_low_balance_alert_item(
    station: &Station,
    snapshot: &BalanceSnapshot,
) -> Option<LowBalanceAlertItem> {
    if snapshot.status != "success" || !snapshot.current_balance.is_finite() {
        return None;
    }
    if snapshot.current_balance > station.low_balance_threshold {
        return None;
    }

    Some(LowBalanceAlertItem {
        station_id: station.id.clone(),
        station_name: if let Some(name) = &snapshot.api_station_name {
            name.clone()
        } else {
            station.name.clone()
        },
        current_balance: snapshot.current_balance,
        threshold: station.low_balance_threshold,
        currency: snapshot.currency.clone(),
    })
}

pub(crate) fn build_low_balance_alert_payload(
    mut items: Vec<LowBalanceAlertItem>,
) -> LowBalanceAlertPayload {
    items.sort_by(|left, right| left.current_balance.total_cmp(&right.current_balance));
    let total_count = items.len();
    LowBalanceAlertPayload { items, total_count }
}

pub(crate) async fn show_low_balance_alert_payload(
    app: &AppHandle,
    state: &AppState,
    payload: LowBalanceAlertPayload,
) -> Result<(), String> {
    *state.low_balance_alert_payload.lock().await = Some(payload.clone());
    // Android：直接通过 JNI 推送一条系统通知，确保 WebView 被挂起时仍然能提醒。
    // 桌面端这里没有副作用，依旧由独立窗口处理。
    #[cfg(target_os = "android")]
    {
        let android_enabled = {
            let state = app.state::<AppState>();
            let data = state.data.lock().await;
            data.settings.android_low_balance_notification_enabled
        };
        if android_enabled {
        let visible = payload.items.iter().take(3).map(|item| {
            // 通知摘要中币种符号统一走 normalize_currency_symbol。
            let symbol = crate::currency::normalize_currency_symbol(&item.currency);
            let name = if item.station_name.trim().is_empty() {
                "未命名".to_string()
            } else {
                item.station_name.clone()
            };
            format!("{}: {}{:.2}", name, symbol, item.current_balance)
        }).collect::<Vec<_>>().join("；");
        let more_count = payload.total_count.saturating_sub(payload.items.len().min(3));
        let body = if more_count > 0 {
            format!("{}（还有 {} 个）", visible, more_count)
        } else {
            visible
        };
        let _ = crate::android::push_low_balance_notification(
            &format!("{} 个站点余额不足", payload.total_count),
            &body,
        );
        }
    }
    show_low_balance_alert_window_internal(app, payload)
}

pub(crate) async fn refresh_station_once(
    station: Station,
    settings: AppSettings,
) -> StationRefreshResult {
    let (resolved_station, snapshot) =
        match fetch_station_snapshot_with_retry(&station, &settings).await {
            Ok(result) => result,
            Err(error) => (station.clone(), failed_snapshot(&station, error)),
        };

    StationRefreshResult {
        resolved_station,
        snapshot,
    }
}

pub(crate) async fn apply_station_refresh_result(
    app: &AppHandle,
    data: &SharedData,
    data_path: &PathBuf,
    result: StationRefreshResult,
    emit_station_change_always: bool,
) -> Result<Option<LowBalanceAlertItem>, String> {
    let mut current = data.lock().await;
    if let Some(existing) = current
        .stations
        .iter_mut()
        .find(|item| item.id == result.resolved_station.id)
    {
        existing.cookie = result.resolved_station.cookie.clone();
        existing.new_api_user = result.resolved_station.new_api_user.clone();
        existing.login_username = result.resolved_station.login_username.clone();
        existing.login_password = result.resolved_station.login_password.clone();
        existing.auth_mode = result.resolved_station.auth_mode.clone();
        existing.base_url = normalize_url(&result.resolved_station.base_url);
    }

    current
        .snapshots
        .retain(|item| item.station_id != result.snapshot.station_id);
    if let Some(ref name) = result.snapshot.api_station_name {
        if let Some(station) = current
            .stations
            .iter_mut()
            .find(|item| item.id == result.snapshot.station_id)
        {
            station.name = name.clone();
        }
    }
    let low_balance_alert_item = if current.settings.low_balance_popup_enabled {
        current
            .stations
            .iter()
            .find(|item| item.id == result.snapshot.station_id)
            .and_then(|station| build_low_balance_alert_item(station, &result.snapshot))
    } else {
        None
    };
    current.snapshots.push(result.snapshot.clone());
    let mut history_point: Option<BalanceHistoryPoint> = None;
    if result.snapshot.status == "success" && result.snapshot.current_balance.is_finite() {
        let point = BalanceHistoryPoint {
            station_id: result.snapshot.station_id.clone(),
            currency: result.snapshot.currency.clone(),
            balance: result.snapshot.current_balance,
            fetched_at: result.snapshot.fetched_at,
        };
        current.balance_history.push(point.clone());
        trim_balance_history(&mut current.balance_history, now_ts() - 7 * 24 * 3600, 3000);
        history_point = Some(point);
    }
    let name_changed = result.snapshot.api_station_name.is_some();
    persist_data(data_path, &current)?;
    if emit_station_change_always || name_changed {
        let _ = app.emit("stations-changed", ());
    }
    let _ = app.emit("snapshot-updated", result.snapshot);
    if let Some(point) = history_point {
        let _ = app.emit("balance-history-updated", point);
    }
    let alert_item = if let Some(alert_item) = low_balance_alert_item {
        let app_state = app.state::<AppState>();
        let mut alerted_station_ids = app_state.low_balance_alerted_station_ids.lock().await;
        let first_alert_this_session = alerted_station_ids.insert(alert_item.station_id.clone());
        if first_alert_this_session {
            Some(alert_item)
        } else {
            None
        }
    } else {
        None
    };
    drop(current);
    Ok(alert_item)
}

pub(crate) async fn refresh_stations_with_limit(
    app: &AppHandle,
    data: &SharedData,
    data_path: &PathBuf,
    stations: Vec<Station>,
    settings: AppSettings,
    emit_station_change_always: bool,
) -> Result<(), String> {
    let concurrency = crate::models::normalize_refresh_concurrency(settings.refresh_concurrency);
    let mut alert_items = Vec::new();
    for batch in stations.chunks(concurrency) {
        let mut handles = Vec::with_capacity(batch.len());
        for station in batch.iter().cloned() {
            let settings = settings.clone();
            handles.push(tauri::async_runtime::spawn(async move {
                refresh_station_once(station, settings).await
            }));
        }

        for handle in handles {
            let result = handle.await.map_err(|error| error.to_string())?;
            if let Some(alert_item) = apply_station_refresh_result(
                app,
                data,
                data_path,
                result,
                emit_station_change_always,
            )
            .await?
            {
                alert_items.push(alert_item);
            }
        }
    }
    if !alert_items.is_empty() {
        let payload = build_low_balance_alert_payload(alert_items);
        let app_state = app.state::<AppState>();
        show_low_balance_alert_payload(app, &app_state, payload).await?;
    }
    Ok(())
}

async fn do_refresh_cycle(app: &AppHandle, data: &SharedData, data_path: &PathBuf) {
    let (stations, settings) = {
        let current = data.lock().await;
        (
            current
                .stations
                .iter()
                .filter(|station| station.enabled)
                .cloned()
                .collect::<Vec<_>>(),
            current.settings.clone(),
        )
    };
    let _ = refresh_stations_with_limit(app, data, data_path, stations, settings, false).await;

    // Android：每完成一轮刷新后，主动把摘要推送给前台 Service 的常驻通知与桌面小组件，
    // 即便此时 WebView 已经被系统挂起，前端 effect 不再触发，状态依然能保持最新。
    #[cfg(target_os = "android")]
    {
        let snapshot_data = data.lock().await.clone();
        let background_enabled = snapshot_data
            .settings
            .android_background_refresh_enabled;
        if background_enabled {
            let (title, summary) =
                crate::android_summary::build_persistent_notification_lines(&snapshot_data);
            let _ =
                crate::android::update_persistent_notification(&title, &summary);
        }
        let widget_json = crate::android_summary::build_widget_payload_json(&snapshot_data);
        if !widget_json.is_empty() {
            let _ = crate::android::update_widgets_with_json(&widget_json);
        }
        let _ = app;
    }
}

pub(crate) fn start_scheduler(app: AppHandle, data: SharedData, data_path: PathBuf) {
    tauri::async_runtime::spawn(async move {
        do_refresh_cycle(&app, &data, &data_path).await;
        loop {
            let settings_interval = {
                let current = data.lock().await;
                current.settings.global_refresh_interval_sec.max(15)
            };
            tokio::time::sleep(Duration::from_secs(settings_interval)).await;
            do_refresh_cycle(&app, &data, &data_path).await;
        }
    });
}
