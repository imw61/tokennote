use crate::{
    endpoint, fetch_json, normalize_url, now_ts, AppSettings, BalanceSnapshot, ModelUsageSummary,
    Station,
};
use reqwest::header::SET_COOKIE;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, time::Duration};

#[derive(Debug, Deserialize)]
struct ApiEnvelope<T> {
    data: T,
}

#[derive(Debug, Deserialize)]
struct UserData {
    username: Option<String>,
    display_name: Option<String>,
    quota: f64,
    used_quota: f64,
    request_count: f64,
}

#[derive(Debug, Deserialize)]
struct StatusData {
    quota_per_unit: Option<f64>,
    quota_display_type: Option<String>,
    custom_currency_symbol: Option<String>,
    system_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct NewApiModelUsage {
    model_name: String,
    token_used: f64,
    count: f64,
    quota: f64,
    created_at: i64,
}

#[derive(Debug, Deserialize)]
struct LoginEnvelope<T> {
    success: bool,
    message: String,
    data: Option<T>,
}

#[derive(Debug, Deserialize)]
struct LoginData {
    id: i64,
    username: Option<String>,
    display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewApiLoginResult {
    pub cookie: String,
    pub new_api_user: String,
    pub username: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewApiWebSession {
    pub cookie: String,
    pub new_api_user: String,
    pub user_json: String,
    pub status_json: String,
    pub quota_display_type: String,
    pub quota_per_unit: String,
    pub system_name: String,
}

fn extract_session_cookie(headers: &reqwest::header::HeaderMap) -> Result<String, String> {
    for value in headers.get_all(SET_COOKIE).iter() {
        let raw = value.to_str().map_err(|error| error.to_string())?;
        if let Some(session_part) = raw
            .split(';')
            .find(|part| part.trim_start().starts_with("session="))
        {
            return Ok(session_part.trim().to_string());
        }
        if raw.trim_start().starts_with("session=") {
            return Ok(raw.split(';').next().unwrap_or(raw).trim().to_string());
        }
    }
    Err("登录成功但未返回 session cookie".to_string())
}

pub async fn login(
    base_url: &str,
    username: &str,
    password: &str,
) -> Result<NewApiLoginResult, String> {
    let normalized = normalize_url(base_url);
    let login_url = endpoint(&normalized, "/api/user/login?turnstile=");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .post(&login_url)
        .header("accept", "application/json, text/plain, */*")
        .header("accept-language", "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6")
        .header("cache-control", "no-store")
        .header("pragma", "no-cache")
        .header("origin", normalized.clone())
        .header("referer", format!("{}/login", normalized))
        .header("content-type", "application/json")
        .header("user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0")
        .json(&serde_json::json!({
            "username": username.trim(),
            "password": password,
        }))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = response.status();
    let headers = response.headers().clone();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("登录失败 HTTP {status} {login_url}\n{body}"));
    }

    let parsed: LoginEnvelope<LoginData> = serde_json::from_str(&body)
        .map_err(|error| format!("解析登录响应失败: {error}\n响应前200字符: {:.200}", body))?;
    if !parsed.success {
        return Err(if parsed.message.trim().is_empty() {
            "登录失败".to_string()
        } else {
            parsed.message
        });
    }

    let data = parsed
        .data
        .ok_or_else(|| "登录成功但响应缺少用户信息".to_string())?;
    let cookie = extract_session_cookie(&headers)?;
    let username = data
        .display_name
        .filter(|name| !name.is_empty())
        .or(data.username)
        .unwrap_or_else(|| data.id.to_string());

    Ok(NewApiLoginResult {
        cookie,
        new_api_user: data.id.to_string(),
        username,
    })
}

pub async fn fetch(station: &Station, settings: &AppSettings) -> Result<BalanceSnapshot, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;

    let user_url = endpoint(&station.base_url, "/api/user/self");
    let status_url = endpoint(&station.base_url, "/api/status");
    let end_timestamp = now_ts();
    let start_timestamp = end_timestamp - (settings.stats_range_hours as i64 * 3600);
    let data_url = format!(
        "{}/api/data/self?start_timestamp={}&end_timestamp={}&default_time={}",
        normalize_url(&station.base_url),
        start_timestamp,
        end_timestamp,
        settings.default_time
    );

    let user: ApiEnvelope<UserData> = fetch_json(&client, &user_url, station).await?;
    let status: ApiEnvelope<StatusData> = fetch_json(&client, &status_url, station).await?;
    let usage: ApiEnvelope<Vec<NewApiModelUsage>> = fetch_json(&client, &data_url, station).await?;

    let quota_per_unit = status.data.quota_per_unit.unwrap_or(500_000.0).max(1.0);
    let currency = status
        .data
        .custom_currency_symbol
        .map(|s| s.trim().to_string())
        .filter(|symbol| !symbol.is_empty() && symbol != "¤")
        .map(|symbol| match symbol.as_str() {
            "CNY" | "RMB" => "¥".to_string(),
            "USD" => "$".to_string(),
            "EUR" => "€".to_string(),
            _ => symbol,
        })
        .or_else(|| {
            status
                .data
                .quota_display_type
                .as_ref()
                .map(|t| match t.trim() {
                    "CNY" | "RMB" => "¥".to_string(),
                    "USD" => "$".to_string(),
                    "EUR" => "€".to_string(),
                    other => other.to_string(),
                })
        })
        .unwrap_or_else(|| "$".to_string());

    let total_quota_raw = usage.data.iter().map(|item| item.quota).sum::<f64>();
    let total_tokens = usage.data.iter().map(|item| item.token_used).sum::<f64>();
    let total_requests = usage.data.iter().map(|item| item.count).sum::<f64>();
    let minutes = (settings.stats_range_hours as f64 * 60.0).max(1.0);

    let mut grouped: HashMap<String, ModelUsageSummary> = HashMap::new();
    for item in usage.data.iter() {
        let entry = grouped
            .entry(item.model_name.clone())
            .or_insert(ModelUsageSummary {
                model_name: item.model_name.clone(),
                token_used: 0.0,
                count: 0.0,
                quota: 0.0,
                quota_usd: 0.0,
                ratio: 0.0,
                last_used_at: item.created_at,
            });
        entry.token_used += item.token_used;
        entry.count += item.count;
        entry.quota += item.quota;
        entry.quota_usd = entry.quota / quota_per_unit;
        entry.ratio = if entry.token_used > 0.0 {
            entry.quota / entry.token_used
        } else {
            0.0
        };
        entry.last_used_at = entry.last_used_at.max(item.created_at);
    }

    let mut models = grouped.into_values().collect::<Vec<_>>();
    models.sort_by(|a, b| {
        b.quota
            .partial_cmp(&a.quota)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(BalanceSnapshot {
        station_id: station.id.clone(),
        station_name: station.name.clone(),
        username: user
            .data
            .display_name
            .filter(|name| !name.is_empty())
            .or(user.data.username)
            .unwrap_or_else(|| "NewAPI 用户".to_string()),
        current_balance: user.data.quota / quota_per_unit,
        historical_consumption: user.data.used_quota / quota_per_unit,
        request_count: user.data.request_count,
        stats_count: usage.data.len(),
        total_quota: total_quota_raw / quota_per_unit,
        total_tokens,
        average_rpm: total_requests / minutes,
        average_tpm: total_tokens / minutes,
        today_request_count: 0.0,
        today_tokens: 0.0,
        today_input_tokens: 0.0,
        today_output_tokens: 0.0,
        today_actual_cost: 0.0,
        today_cost: 0.0,
        average_response_ms: 0.0,
        quota_per_unit,
        currency,
        models,
        fetched_at: now_ts(),
        status: "success".to_string(),
        error_message: None,
        api_station_name: status.data.system_name.filter(|n| !n.is_empty()),
    })
}

pub async fn build_web_session(station: &Station) -> Result<NewApiWebSession, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;
    let user_url = endpoint(&station.base_url, "/api/user/self");
    let status_url = endpoint(&station.base_url, "/api/status");

    let user_value: ApiEnvelope<serde_json::Value> =
        fetch_json(&client, &user_url, station).await?;
    let status_value: ApiEnvelope<serde_json::Value> =
        fetch_json(&client, &status_url, station).await?;

    let quota_display_type = status_value
        .data
        .get("quota_display_type")
        .and_then(|value| value.as_str())
        .unwrap_or("USD")
        .to_string();
    let quota_per_unit = status_value
        .data
        .get("quota_per_unit")
        .map(|value| {
            value
                .as_str()
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| value.to_string())
        })
        .unwrap_or_else(|| "500000".to_string());
    let system_name = status_value
        .data
        .get("system_name")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();

    Ok(NewApiWebSession {
        cookie: station.cookie.clone(),
        new_api_user: station.new_api_user.clone(),
        user_json: serde_json::to_string(&user_value.data)
            .map_err(|error| format!("序列化 NewAPI user 失败: {error}"))?,
        status_json: serde_json::to_string(&status_value.data)
            .map_err(|error| format!("序列化 NewAPI status 失败: {error}"))?,
        quota_display_type,
        quota_per_unit,
        system_name,
    })
}
