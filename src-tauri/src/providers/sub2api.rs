use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{Duration as ChronoDuration, Utc};
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::{
    normalize_bearer_token, normalize_url, now_ts, AppSettings, BalanceSnapshot, ModelUsageSummary,
    Station,
};

#[derive(Debug, Deserialize)]
struct ApiEnvelope<T> {
    code: i32,
    message: String,
    data: T,
}

#[derive(Debug, Deserialize)]
struct LoginData {
    access_token: String,
    #[serde(default)]
    refresh_token: String,
    #[serde(default)]
    expires_in: i64,
    user: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct Sub2ApiUser {
    email: Option<String>,
    username: Option<String>,
    balance: f64,
}

#[derive(Debug, Deserialize)]
struct DashboardStats {
    total_requests: f64,
    total_tokens: f64,
    total_cost: f64,
    total_actual_cost: f64,
    today_requests: f64,
    today_tokens: f64,
    today_input_tokens: f64,
    today_output_tokens: f64,
    today_cost: f64,
    today_actual_cost: f64,
    average_duration_ms: f64,
    rpm: f64,
    tpm: f64,
}

#[derive(Debug, Deserialize)]
struct PublicSettings {
    site_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DashboardModelsResponse {
    models: Vec<DashboardModel>,
}

#[derive(Debug, Deserialize)]
struct DashboardModel {
    model: String,
    requests: f64,
    total_tokens: f64,
    cost: f64,
    actual_cost: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sub2ApiLoginResult {
    pub access_token: String,
    pub username: String,
    pub refresh_token: String,
    pub token_expires_at: i64,
    pub auth_user_json: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sub2ApiWebSession {
    pub auth_token: String,
    pub auth_user_json: String,
    pub refresh_token: String,
    pub token_expires_at: i64,
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())
}

fn shanghai_date_range(hours: u64) -> (String, String) {
    let now = Utc::now() + ChronoDuration::hours(8);
    let start = now - ChronoDuration::hours(hours as i64);
    (
        start.date_naive().format("%Y-%m-%d").to_string(),
        now.date_naive().format("%Y-%m-%d").to_string(),
    )
}

fn extract_user_text(user: &serde_json::Value, key: &str) -> Option<String> {
    user.get(key)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn extract_login_username(user: &serde_json::Value) -> String {
    extract_user_text(user, "username")
        .or_else(|| extract_user_text(user, "email"))
        .unwrap_or_else(|| "Sub2API 用户".to_string())
}

fn token_expires_at_from_now(expires_in_seconds: i64) -> i64 {
    Utc::now().timestamp_millis() + expires_in_seconds.max(0) * 1000
}

fn token_expires_at_from_jwt(access_token: &str) -> Option<i64> {
    let payload = access_token.split('.').nth(1)?;
    let decoded = URL_SAFE_NO_PAD.decode(payload).ok()?;
    let value: serde_json::Value = serde_json::from_slice(&decoded).ok()?;
    value
        .get("exp")
        .and_then(|exp| exp.as_i64())
        .map(|exp| exp * 1000)
}

async fn fetch_with_bearer<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    url: &str,
    access_token: &str,
) -> Result<T, String> {
    let response = client
        .get(url)
        .header("accept", "application/json, text/plain, */*")
        .header("accept-language", "zh")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {status} {url}\n{body}"));
    }
    let parsed: ApiEnvelope<T> = serde_json::from_str(&body)
        .map_err(|error| format!("解析 {url} 失败: {error}\n响应前200字符: {:.200}", body))?;
    if parsed.code != 0 {
        return Err(if parsed.message.trim().is_empty() {
            format!("请求失败: {url}")
        } else {
            parsed.message
        });
    }
    Ok(parsed.data)
}

pub async fn login(
    base_url: &str,
    username: &str,
    password: &str,
) -> Result<Sub2ApiLoginResult, String> {
    let normalized = normalize_url(base_url);
    let login_url = format!("{}/api/v1/auth/login", normalized);
    let client = build_client()?;
    let response = client
        .post(&login_url)
        .header("accept", "application/json, text/plain, */*")
        .header("accept-language", "zh")
        .header("content-type", "application/json")
        .json(&serde_json::json!({
            "email": username.trim(),
            "password": password,
        }))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("登录失败 HTTP {status} {login_url}\n{body}"));
    }
    let parsed: ApiEnvelope<LoginData> = serde_json::from_str(&body)
        .map_err(|error| format!("解析登录响应失败: {error}\n响应前200字符: {:.200}", body))?;
    if parsed.code != 0 {
        return Err(if parsed.message.trim().is_empty() {
            "登录失败".to_string()
        } else {
            parsed.message
        });
    }
    let token = normalize_bearer_token(&parsed.data.access_token);
    if token.is_empty() {
        return Err("登录成功但未返回 access token".to_string());
    }
    let username = extract_login_username(&parsed.data.user);
    let auth_user_json = serde_json::to_string(&parsed.data.user)
        .map_err(|error| format!("序列化 Sub2API 登录用户失败: {error}"))?;
    let token_expires_at = if parsed.data.expires_in > 0 {
        token_expires_at_from_now(parsed.data.expires_in)
    } else {
        token_expires_at_from_jwt(&token).unwrap_or_else(|| Utc::now().timestamp_millis())
    };

    Ok(Sub2ApiLoginResult {
        access_token: token,
        username,
        refresh_token: parsed.data.refresh_token,
        token_expires_at,
        auth_user_json,
    })
}

pub async fn build_web_session_from_token(
    base_url: &str,
    access_token: &str,
) -> Result<Sub2ApiWebSession, String> {
    let normalized = normalize_url(base_url);
    let token = normalize_bearer_token(access_token);
    if token.is_empty() {
        return Err("缺少 Sub2API access token".to_string());
    }
    let client = build_client()?;
    let user_url = format!("{}/api/v1/auth/me?timezone=Asia%2FShanghai", normalized);
    let auth_user: serde_json::Value = fetch_with_bearer(&client, &user_url, &token).await?;
    let auth_user_json = serde_json::to_string(&auth_user)
        .map_err(|error| format!("序列化 Sub2API 用户信息失败: {error}"))?;

    Ok(Sub2ApiWebSession {
        auth_token: token.clone(),
        auth_user_json,
        refresh_token: String::new(),
        token_expires_at: token_expires_at_from_jwt(&token)
            .unwrap_or_else(|| Utc::now().timestamp_millis()),
    })
}

pub async fn fetch(station: &Station, settings: &AppSettings) -> Result<BalanceSnapshot, String> {
    let access_token = normalize_bearer_token(&station.cookie);
    if access_token.is_empty() {
        return Err("缺少 Sub2API Bearer Token，请重新登录或手动填写".to_string());
    }

    let client = build_client()?;
    let normalized = normalize_url(&station.base_url);
    let (start_date, end_date) = shanghai_date_range(settings.stats_range_hours);
    let user_url = format!("{}/api/v1/auth/me?timezone=Asia%2FShanghai", normalized);
    let stats_url = format!(
        "{}/api/v1/usage/dashboard/stats?timezone=Asia%2FShanghai",
        normalized
    );
    let settings_url = format!(
        "{}/api/v1/settings/public?timezone=Asia%2FShanghai",
        normalized
    );
    let models_url = format!(
        "{}/api/v1/usage/dashboard/models?start_date={}&end_date={}&timezone=Asia%2FShanghai",
        normalized, start_date, end_date
    );

    let user: Sub2ApiUser = fetch_with_bearer(&client, &user_url, &access_token).await?;
    let stats: DashboardStats = fetch_with_bearer(&client, &stats_url, &access_token).await?;
    let public_settings: PublicSettings =
        fetch_with_bearer(&client, &settings_url, &access_token).await?;
    let model_data: DashboardModelsResponse =
        fetch_with_bearer(&client, &models_url, &access_token).await?;

    let mut models = model_data
        .models
        .into_iter()
        .map(|item| ModelUsageSummary {
            model_name: item.model,
            token_used: item.total_tokens,
            count: item.requests,
            quota: item.cost,
            quota_usd: item.actual_cost,
            ratio: if item.total_tokens > 0.0 {
                item.actual_cost / item.total_tokens
            } else {
                0.0
            },
            last_used_at: 0,
        })
        .collect::<Vec<_>>();
    models.sort_by(|a, b| {
        b.quota_usd
            .partial_cmp(&a.quota_usd)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(BalanceSnapshot {
        station_id: station.id.clone(),
        station_name: station.name.clone(),
        username: user
            .username
            .filter(|value| !value.trim().is_empty())
            .or(user.email)
            .unwrap_or_else(|| "Sub2API 用户".to_string()),
        current_balance: user.balance,
        historical_consumption: stats.total_actual_cost,
        request_count: stats.total_requests,
        stats_count: models.len(),
        total_quota: stats.total_cost,
        total_tokens: stats.total_tokens,
        average_rpm: stats.rpm,
        average_tpm: stats.tpm,
        today_request_count: stats.today_requests,
        today_tokens: stats.today_tokens,
        today_input_tokens: stats.today_input_tokens,
        today_output_tokens: stats.today_output_tokens,
        today_actual_cost: stats.today_actual_cost,
        today_cost: stats.today_cost,
        average_response_ms: stats.average_duration_ms,
        quota_per_unit: 1.0,
        currency: "USD".to_string(),
        models,
        fetched_at: now_ts(),
        status: "success".to_string(),
        error_message: None,
        api_station_name: public_settings
            .site_name
            .filter(|value| !value.trim().is_empty()),
    })
}
