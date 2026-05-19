use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Datelike;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

use crate::{
    endpoint, normalize_bearer_token, now_ts, AppSettings, BalanceSnapshot, ModelUsageSummary,
    Station,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepSeekLoginResult {
    pub token: String,
    pub username: String,
}

#[derive(Debug, Deserialize)]
struct LoginEnvelope {
    #[serde(default)]
    code: i64,
    #[serde(default)]
    msg: String,
    data: Option<LoginEnvelopeData>,
}

#[derive(Debug, Deserialize)]
struct LoginEnvelopeData {
    #[serde(default)]
    biz_code: i64,
    #[serde(default)]
    biz_msg: String,
    biz_data: Option<LoginBizData>,
}

#[derive(Debug, Deserialize)]
struct LoginBizData {
    #[serde(default)]
    code: i64,
    #[serde(default)]
    msg: String,
    user: Option<LoginUser>,
}

#[derive(Debug, Deserialize)]
struct LoginUser {
    #[serde(default)]
    id: String,
    #[serde(default)]
    token: String,
    #[serde(default)]
    email: String,
    #[serde(default)]
    mobile_number: String,
    id_profile: Option<LoginIdProfile>,
}

#[derive(Debug, Deserialize)]
struct LoginIdProfile {
    #[serde(default)]
    name: String,
}

fn login_display_name(user: &LoginUser) -> String {
    if let Some(profile) = user.id_profile.as_ref() {
        let name = profile.name.trim();
        if !name.is_empty() {
            return name.to_string();
        }
    }
    let email = user.email.trim();
    if !email.is_empty() {
        return email.to_string();
    }
    let mobile = user.mobile_number.trim();
    if !mobile.is_empty() {
        return mobile.to_string();
    }
    if !user.id.trim().is_empty() {
        return user.id.clone();
    }
    "DeepSeek".to_string()
}

fn normalize_login_username(raw: &str) -> (String, String, String) {
    let value = raw.trim();
    if value.contains('@') {
        return (value.to_string(), String::new(), String::new());
    }
    let (area_code, mobile) = if value.starts_with('+') {
        let digits = value[1..]
            .chars()
            .take_while(|ch| ch.is_ascii_digit())
            .collect::<String>();
        if digits.is_empty() {
            ("+86".to_string(), value.to_string())
        } else {
            let rest = value[(1 + digits.len())..].trim();
            let rest = rest.strip_prefix('-').unwrap_or(rest).trim();
            (format!("+{}", digits), rest.to_string())
        }
    } else {
        ("+86".to_string(), value.to_string())
    };
    (String::new(), mobile, area_code)
}

fn random_device_id() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    STANDARD.encode(bytes)
}

pub async fn login(username: &str, password: &str) -> Result<DeepSeekLoginResult, String> {
    if let Ok(result) = login_platform(username, password).await {
        return Ok(result);
    }

    let fallback = login_chat(username, password).await?;
    match fetch_platform_summary(&fallback.token).await {
        Ok(_) => Ok(fallback),
        Err(error) => {
            if error.to_lowercase().contains("invalid token")
                || error.to_lowercase().contains("authorization failed")
            {
                return Err("DeepSeek 登录成功但平台鉴权失败：chat.deepseek.com 的 token 不能直接用于 platform.deepseek.com。\n请使用 DeepSeek 平台账号登录（或改用 API Key 模式）。".to_string());
            }
            Err(error)
        }
    }
}

async fn login_platform(username: &str, password: &str) -> Result<DeepSeekLoginResult, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .cookie_store(true)
        .build()
        .map_err(|error| error.to_string())?;

    let _ = client
        .get("https://platform.deepseek.com/sign_in")
        .header("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("accept-language", "zh-CN,zh;q=0.9")
        .header("cache-control", "no-store")
        .header("pragma", "no-cache")
        .header(
            "user-agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let (email, mobile, area_code) = normalize_login_username(username);
    let device_id = random_device_id();

    let candidates = [
        "https://platform.deepseek.com/auth-api/v0/users",
        "https://platform.deepseek.com/auth-api/v0/users/login",
        "https://platform.deepseek.com/api/v0/users/login",
    ];

    let mut last_error = String::new();
    for login_url in candidates.iter() {
        let response = client
            .post(*login_url)
            .header("accept", "*/*")
            .header("content-type", "application/json")
            .header("origin", "https://platform.deepseek.com")
            .header("referer", "https://platform.deepseek.com/sign_in")
            .header("x-app-version", "1.0.0")
            .header(
                "user-agent",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
            )
            .json(&serde_json::json!({
                "email": email.clone(),
                "mobile": mobile.clone(),
                "password": password,
                "area_code": area_code.clone(),
                "device_id": device_id.clone(),
                "os": "web",
            }))
            .send()
            .await
            .map_err(|error| error.to_string())?;

        let status = response.status();
        let body = response.text().await.map_err(|error| error.to_string())?;
        if !status.is_success() {
            last_error = format!("登录失败 HTTP {status} {login_url}\n{body}");
            continue;
        }

        if let Ok(parsed) = serde_json::from_str::<LoginEnvelope>(&body) {
            if parsed.code != 0 {
                last_error = if parsed.msg.trim().is_empty() {
                    "DeepSeek 平台登录失败".to_string()
                } else {
                    parsed.msg
                };
                continue;
            }
            let data = parsed
                .data
                .ok_or_else(|| "DeepSeek 平台登录失败：响应缺少 data".to_string())?;
            if data.biz_code != 0 {
                last_error = if data.biz_msg.trim().is_empty() {
                    "DeepSeek 平台登录失败".to_string()
                } else {
                    data.biz_msg
                };
                continue;
            }
            let biz = data
                .biz_data
                .ok_or_else(|| "DeepSeek 平台登录失败：响应缺少 biz_data".to_string())?;
            if biz.code != 0 {
                last_error = if biz.msg.trim().is_empty() {
                    "DeepSeek 平台登录失败".to_string()
                } else {
                    biz.msg
                };
                continue;
            }
            let user = biz
                .user
                .ok_or_else(|| "DeepSeek 平台登录失败：响应缺少 user".to_string())?;
            if !user.token.trim().is_empty() {
                let username = login_display_name(&user);
                return Ok(DeepSeekLoginResult {
                    token: user.token.clone(),
                    username,
                });
            }
        }

        let json: serde_json::Value = match serde_json::from_str(&body) {
            Ok(value) => value,
            Err(error) => {
                last_error = format!(
                    "解析 DeepSeek 平台登录响应失败: {error}\n响应前200字符: {:.200}",
                    body
                );
                continue;
            }
        };
        if let Some((token, extracted_name)) = extract_token_and_name_from_json(&json) {
            return Ok(DeepSeekLoginResult {
                token,
                username: extracted_name,
            });
        }

        last_error = format!(
            "DeepSeek 平台登录失败：无法从响应提取 token\n响应前200字符: {:.200}",
            body
        );
    }

    Err(if last_error.is_empty() {
        "DeepSeek 平台登录失败".to_string()
    } else {
        last_error
    })
}

async fn login_chat(username: &str, password: &str) -> Result<DeepSeekLoginResult, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .cookie_store(true)
        .build()
        .map_err(|error| error.to_string())?;

    let _ = client
        .get("https://chat.deepseek.com/sign_in")
        .header("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("accept-language", "zh-CN,zh;q=0.9")
        .header("cache-control", "no-store")
        .header("pragma", "no-cache")
        .header(
            "user-agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let (email, mobile, area_code) = normalize_login_username(username);
    let device_id = random_device_id();
    let login_url = "https://chat.deepseek.com/api/v0/users/login";
    let response = client
        .post(login_url)
        .header("accept", "*/*")
        .header("content-type", "application/json")
        .header("origin", "https://chat.deepseek.com")
        .header("referer", "https://chat.deepseek.com/sign_in")
        .header("x-client-locale", "zh_CN")
        .header("x-client-platform", "web")
        .header("x-client-version", "2.0.0")
        .header("x-app-version", "2.0.0")
        .header("x-client-timezone-offset", "28800")
        .header(
            "user-agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        )
        .json(&serde_json::json!({
            "email": email,
            "mobile": mobile,
            "password": password,
            "area_code": area_code,
            "device_id": device_id,
            "os": "web",
        }))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("登录失败 HTTP {status} {login_url}\n{body}"));
    }

    let parsed: LoginEnvelope = serde_json::from_str(&body).map_err(|error| {
        format!(
            "解析 DeepSeek 登录响应失败: {error}\n响应前200字符: {:.200}",
            body
        )
    })?;

    if parsed.code != 0 {
        return Err(if parsed.msg.trim().is_empty() {
            "DeepSeek 登录失败".to_string()
        } else {
            parsed.msg
        });
    }

    let data = parsed
        .data
        .ok_or_else(|| "DeepSeek 登录失败：响应缺少 data".to_string())?;
    if data.biz_code != 0 {
        return Err(if data.biz_msg.trim().is_empty() {
            "DeepSeek 登录失败".to_string()
        } else {
            data.biz_msg
        });
    }
    let biz = data
        .biz_data
        .ok_or_else(|| "DeepSeek 登录失败：响应缺少 biz_data".to_string())?;
    if biz.code != 0 {
        return Err(if biz.msg.trim().is_empty() {
            "DeepSeek 登录失败".to_string()
        } else {
            biz.msg
        });
    }
    let user = biz
        .user
        .ok_or_else(|| "DeepSeek 登录失败：响应缺少 user".to_string())?;

    if user.token.trim().is_empty() {
        return Err("DeepSeek 登录失败：未返回 token".to_string());
    }

    let username = login_display_name(&user);
    Ok(DeepSeekLoginResult {
        token: user.token.clone(),
        username,
    })
}

fn extract_token_and_name_from_json(value: &serde_json::Value) -> Option<(String, String)> {
    let pointers = [
        "/data/biz_data/user/token",
        "/data/biz_data/token",
        "/data/token",
        "/token",
    ];
    for pointer in pointers.iter() {
        if let Some(token) = value.pointer(pointer).and_then(|v| v.as_str()) {
            let token = token.trim();
            if token.len() > 10 {
                let name = value
                    .pointer("/data/biz_data/user/id_profile/name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("DeepSeek")
                    .trim()
                    .to_string();
                return Some((
                    token.to_string(),
                    if name.is_empty() {
                        "DeepSeek".to_string()
                    } else {
                        name
                    },
                ));
            }
        }
    }

    fn walk(value: &serde_json::Value) -> Option<String> {
        match value {
            serde_json::Value::Object(map) => {
                for (k, v) in map.iter() {
                    if k == "token" {
                        if let Some(s) = v.as_str() {
                            let s = s.trim();
                            if s.len() > 10 {
                                return Some(s.to_string());
                            }
                        }
                    }
                    if let Some(found) = walk(v) {
                        return Some(found);
                    }
                }
                None
            }
            serde_json::Value::Array(arr) => {
                for v in arr.iter() {
                    if let Some(found) = walk(v) {
                        return Some(found);
                    }
                }
                None
            }
            _ => None,
        }
    }

    let token = walk(value)?;
    Some((token, "DeepSeek".to_string()))
}

#[derive(Debug, Deserialize)]
struct DeepSeekBalanceResponse {
    #[serde(default)]
    balance_infos: Vec<DeepSeekBalanceInfo>,
}

#[derive(Debug, Deserialize)]
struct DeepSeekBalanceInfo {
    #[serde(default)]
    currency: String,
    #[serde(default)]
    total_balance: String,
}

#[derive(Debug, Deserialize)]
struct DeepSeekApiErrorEnvelope {
    error: DeepSeekApiError,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct DeepSeekApiError {
    #[serde(default)]
    message: String,
    #[serde(default)]
    r#type: String,
    #[serde(default)]
    code: String,
}

fn pick_balance_info(infos: &[DeepSeekBalanceInfo]) -> Option<&DeepSeekBalanceInfo> {
    if let Some(cny) = infos.iter().find(|info| info.currency == "CNY") {
        return Some(cny);
    }
    infos.first()
}

#[derive(Debug, Deserialize)]
struct DeepSeekPlatformEnvelope<T> {
    #[serde(default)]
    code: i64,
    #[serde(default)]
    msg: String,
    data: Option<DeepSeekPlatformEnvelopeData<T>>,
}

#[derive(Debug, Deserialize)]
struct DeepSeekPlatformEnvelopeData<T> {
    #[serde(default)]
    biz_code: i64,
    #[serde(default)]
    biz_msg: String,
    biz_data: Option<T>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct DeepSeekUserSummary {
    #[serde(default)]
    current_token: i64,
    #[serde(default)]
    monthly_usage: String,
    #[serde(default)]
    total_usage: i64,
    #[serde(default)]
    normal_wallets: Vec<DeepSeekWallet>,
    #[serde(default)]
    bonus_wallets: Vec<DeepSeekWallet>,
    #[serde(default)]
    total_available_token_estimation: String,
    #[serde(default)]
    monthly_costs: Vec<DeepSeekCost>,
    #[serde(default)]
    monthly_token_usage: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct DeepSeekWallet {
    #[serde(default)]
    currency: String,
    #[serde(default)]
    balance: String,
    #[serde(default)]
    token_estimation: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct DeepSeekCost {
    #[serde(default)]
    currency: String,
    #[serde(default)]
    amount: String,
}

fn parse_f64(value: &str) -> f64 {
    value.trim().parse::<f64>().unwrap_or(0.0)
}

fn parse_i64(value: &str) -> i64 {
    value.trim().parse::<i64>().unwrap_or(0)
}

async fn fetch_platform_summary(token: &str) -> Result<DeepSeekUserSummary, String> {
    let token = normalize_bearer_token(token);
    if token.is_empty() {
        return Err("缺少 DeepSeek 登录 Token".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;

    let url = "https://platform.deepseek.com/api/v0/users/get_user_summary";
    let response = client
        .get(url)
        .header("accept", "application/json")
        .header("origin", "https://platform.deepseek.com")
        .header("referer", "https://platform.deepseek.com/usage")
        .header("x-app-version", "1.0.0")
        .header(
            "user-agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        )
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {status} {url}\n{body}"));
    }

    let parsed: DeepSeekPlatformEnvelope<DeepSeekUserSummary> = serde_json::from_str(&body)
        .map_err(|error| {
            format!(
                "解析 DeepSeek 平台用户汇总失败: {error}\n响应前200字符: {:.200}",
                body
            )
        })?;
    if parsed.code != 0 {
        return Err(if parsed.msg.trim().is_empty() {
            "DeepSeek 平台请求失败".to_string()
        } else {
            parsed.msg
        });
    }
    let data = parsed
        .data
        .ok_or_else(|| "DeepSeek 平台响应缺少 data".to_string())?;
    if data.biz_code != 0 {
        let msg = if data.biz_msg.trim().is_empty() {
            "DeepSeek 平台请求失败".to_string()
        } else {
            data.biz_msg
        };
        let lower = msg.to_lowercase();
        if lower.contains("invalid token") || lower.contains("authorization failed") {
            return Err(format!(
                "{msg}\n请在站点里重新登录（平台登录），或切换为 API Key 模式。"
            ));
        }
        return Err(msg);
    }
    data.biz_data
        .ok_or_else(|| "DeepSeek 平台响应缺少 biz_data".to_string())
}

fn wallet_currency(summary: &DeepSeekUserSummary) -> String {
    summary
        .normal_wallets
        .first()
        .or_else(|| summary.bonus_wallets.first())
        .map(|w| w.currency.clone())
        .unwrap_or_else(|| "CNY".to_string())
}

fn wallet_balance_total(summary: &DeepSeekUserSummary) -> f64 {
    let normal_sum = summary
        .normal_wallets
        .iter()
        .map(|w| parse_f64(&w.balance))
        .sum::<f64>();
    let bonus_sum = summary
        .bonus_wallets
        .iter()
        .map(|w| parse_f64(&w.balance))
        .sum::<f64>();
    normal_sum + bonus_sum
}

fn wallet_monthly_cost(summary: &DeepSeekUserSummary) -> f64 {
    summary
        .monthly_costs
        .first()
        .map(|c| parse_f64(&c.amount))
        .unwrap_or(0.0)
}

fn platform_host(base_url: &str) -> &str {
    let _ = base_url;
    "https://platform.deepseek.com"
}

async fn fetch_platform_usage_amount(
    base_url: &str,
    token: &str,
    month: i32,
    year: i32,
) -> Result<serde_json::Value, String> {
    let token = normalize_bearer_token(token);
    if token.is_empty() {
        return Err("缺少 DeepSeek 登录 Token".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;
    let url = format!(
        "{}/api/v0/usage/amount?month={}&year={}",
        platform_host(base_url),
        month,
        year
    );
    let response = client
        .get(&url)
        .header("accept", "application/json")
        .header("origin", "https://platform.deepseek.com")
        .header("referer", "https://platform.deepseek.com/usage")
        .header("x-app-version", "1.0.0")
        .header(
            "user-agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        )
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {status} {url}\n{body}"));
    }
    serde_json::from_str::<serde_json::Value>(&body).map_err(|error| {
        format!(
            "解析 DeepSeek 用量 amount 失败: {error}\n响应前200字符: {:.200}",
            body
        )
    })
}

async fn fetch_platform_usage_cost(
    base_url: &str,
    token: &str,
    month: i32,
    year: i32,
) -> Result<serde_json::Value, String> {
    let token = normalize_bearer_token(token);
    if token.is_empty() {
        return Err("缺少 DeepSeek 登录 Token".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;
    let url = format!(
        "{}/api/v0/usage/cost?month={}&year={}",
        platform_host(base_url),
        month,
        year
    );
    let response = client
        .get(&url)
        .header("accept", "application/json")
        .header("origin", "https://platform.deepseek.com")
        .header("referer", "https://platform.deepseek.com/usage")
        .header("x-app-version", "1.0.0")
        .header(
            "user-agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        )
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {status} {url}\n{body}"));
    }
    serde_json::from_str::<serde_json::Value>(&body).map_err(|error| {
        format!(
            "解析 DeepSeek 用量 cost 失败: {error}\n响应前200字符: {:.200}",
            body
        )
    })
}

#[derive(Debug, Default, Clone)]
struct PlatformUsageTotals {
    prompt_tokens: f64,
    prompt_cache_hit_tokens: f64,
    prompt_cache_miss_tokens: f64,
    response_tokens: f64,
    requests: f64,
}

impl PlatformUsageTotals {
    fn input_tokens(&self) -> f64 {
        self.prompt_tokens + self.prompt_cache_hit_tokens + self.prompt_cache_miss_tokens
    }

    fn total_tokens(&self) -> f64 {
        self.input_tokens() + self.response_tokens
    }

    fn add_type_amount(&mut self, t: &str, amount: f64) {
        match t {
            "PROMPT_TOKEN" => self.prompt_tokens += amount,
            "PROMPT_CACHE_HIT_TOKEN" => self.prompt_cache_hit_tokens += amount,
            "PROMPT_CACHE_MISS_TOKEN" => self.prompt_cache_miss_tokens += amount,
            "RESPONSE_TOKEN" => self.response_tokens += amount,
            "REQUEST" => self.requests += amount,
            _ => {}
        }
    }
}

#[derive(Debug, Default, Clone)]
struct PlatformUsageSnapshot {
    total: PlatformUsageTotals,
    today: PlatformUsageTotals,
    models: Vec<ModelUsageSummary>,
}

fn pick_platform_biz_data<'a>(value: &'a serde_json::Value) -> Option<&'a serde_json::Value> {
    let data = value.get("data")?;
    let env = data.get("biz_data").or_else(|| data.get("bizData"))?;
    if let Some(array) = env.as_array() {
        return array.first();
    }
    Some(env)
}

fn parse_platform_usage_totals(value: &serde_json::Value) -> Option<PlatformUsageSnapshot> {
    let env = pick_platform_biz_data(value)?;
    let total = env.get("total")?.as_array()?.to_vec();

    let mut totals = PlatformUsageTotals::default();
    let mut per_model: Vec<(String, PlatformUsageTotals)> = Vec::new();

    for item in total.iter() {
        let model = item
            .get("model")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let usage = item
            .get("usage")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let mut model_totals = PlatformUsageTotals::default();
        for entry in usage.iter() {
            let t = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let amount = entry.get("amount").and_then(|v| v.as_str()).unwrap_or("0");
            let amount = parse_f64(amount);
            totals.add_type_amount(t, amount);
            model_totals.add_type_amount(t, amount);
        }
        if !model.is_empty() {
            per_model.push((model, model_totals));
        }
    }

    let now = chrono::Utc::now() + chrono::Duration::hours(8);
    let today_str = format!("{:04}-{:02}-{:02}", now.year(), now.month(), now.day());
    let mut today = PlatformUsageTotals::default();
    if let Some(days) = env.get("days").and_then(|v| v.as_array()) {
        for day in days.iter() {
            if day.get("date").and_then(|v| v.as_str()).unwrap_or("") != today_str {
                continue;
            }
            if let Some(day_data) = day.get("data").and_then(|v| v.as_array()) {
                for model in day_data.iter() {
                    if let Some(usage) = model.get("usage").and_then(|v| v.as_array()) {
                        for entry in usage.iter() {
                            let t = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");
                            let amount =
                                entry.get("amount").and_then(|v| v.as_str()).unwrap_or("0");
                            today.add_type_amount(t, parse_f64(amount));
                        }
                    }
                }
            }
            break;
        }
    }

    let mut models = per_model
        .into_iter()
        .map(|(model, model_totals)| ModelUsageSummary {
            model_name: model,
            token_used: model_totals.total_tokens(),
            count: model_totals.requests,
            quota: model_totals.total_tokens(),
            quota_usd: 0.0,
            ratio: 0.0,
            last_used_at: 0,
        })
        .collect::<Vec<_>>();
    models.sort_by(|a, b| {
        b.token_used
            .partial_cmp(&a.token_used)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Some(PlatformUsageSnapshot {
        total: totals,
        today,
        models,
    })
}

#[derive(Debug, Default, Clone)]
struct PlatformCostSnapshot {
    total_cost: f64,
    today_cost: f64,
    model_costs: HashMap<String, f64>,
}

fn parse_platform_cost_totals(value: &serde_json::Value) -> Option<PlatformCostSnapshot> {
    let env = pick_platform_biz_data(value)?;
    let total = env.get("total")?.as_array()?.to_vec();

    let mut total_cost = 0.0;
    let mut model_costs: HashMap<String, f64> = HashMap::new();
    for item in total.iter() {
        let model_name = item
            .get("model")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let usage = item
            .get("usage")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let mut model_cost = 0.0;
        for entry in usage.iter() {
            let t = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if t == "REQUEST" {
                continue;
            }
            let amount = entry.get("amount").and_then(|v| v.as_str()).unwrap_or("0");
            let amount = parse_f64(amount);
            total_cost += amount;
            model_cost += amount;
        }
        if !model_name.is_empty() {
            model_costs.insert(model_name, model_cost);
        }
    }

    let now = chrono::Utc::now() + chrono::Duration::hours(8);
    let today_str = format!("{:04}-{:02}-{:02}", now.year(), now.month(), now.day());
    let mut today_cost = 0.0;
    if let Some(days) = env.get("days").and_then(|v| v.as_array()) {
        for day in days.iter() {
            if day.get("date").and_then(|v| v.as_str()).unwrap_or("") != today_str {
                continue;
            }
            if let Some(day_data) = day.get("data").and_then(|v| v.as_array()) {
                for model in day_data.iter() {
                    if let Some(usage) = model.get("usage").and_then(|v| v.as_array()) {
                        for entry in usage.iter() {
                            let t = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");
                            if t == "REQUEST" {
                                continue;
                            }
                            let amount =
                                entry.get("amount").and_then(|v| v.as_str()).unwrap_or("0");
                            today_cost += parse_f64(amount);
                        }
                    }
                }
            }
            break;
        }
    }

    Some(PlatformCostSnapshot {
        total_cost,
        today_cost,
        model_costs,
    })
}

async fn fetch_api_balance(api_key: &str) -> Result<(String, f64), String> {
    let token = normalize_bearer_token(api_key);
    if token.is_empty() {
        return Err("缺少 DeepSeek API Key（Bearer Token）".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;

    let url = endpoint("https://api.deepseek.com", "/user/balance");
    let response = client
        .get(&url)
        .header("accept", "application/json")
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        if status.as_u16() == 401 {
            if let Ok(parsed) = serde_json::from_str::<DeepSeekApiErrorEnvelope>(&body) {
                return Err(format!(
                    "DeepSeek API 鉴权失败：{}（{}）\n请到 https://platform.deepseek.com/api_keys 创建 API Key，并在“手动凭证 / API Key”中填写。",
                    parsed.error.message,
                    parsed.error.code
                ));
            }
        }
        return Err(format!("HTTP {status} {url}\n{body}"));
    }

    let parsed: DeepSeekBalanceResponse = serde_json::from_str(&body).map_err(|error| {
        format!(
            "解析 DeepSeek 余额失败: {error}\n响应前200字符: {:.200}",
            body
        )
    })?;
    let balance_info = pick_balance_info(&parsed.balance_infos)
        .ok_or_else(|| "DeepSeek 余额响应缺少 balance_infos".to_string())?;
    let balance = balance_info
        .total_balance
        .trim()
        .parse::<f64>()
        .map_err(|error| format!("解析 DeepSeek total_balance 失败: {error}"))?;
    Ok((balance_info.currency.clone(), balance))
}

pub async fn fetch(station: &Station, _settings: &AppSettings) -> Result<BalanceSnapshot, String> {
    let token = normalize_bearer_token(&station.cookie);
    if token.is_empty() {
        return Err(if station.auth_mode == "login" {
            "缺少 DeepSeek 登录信息，请重新登录".to_string()
        } else {
            "缺少 DeepSeek API Key（Bearer Token）".to_string()
        });
    }

    let username = if station.new_api_user.trim().is_empty() {
        "DeepSeek".to_string()
    } else {
        station.new_api_user.trim().to_string()
    };

    if station.auth_mode == "login" {
        let summary = fetch_platform_summary(&token).await?;
        let currency = wallet_currency(&summary);
        let current_balance = wallet_balance_total(&summary);
        let mut monthly_cost = wallet_monthly_cost(&summary);
        let _quota_estimation = parse_i64(&summary.total_available_token_estimation) as f64;

        let mut monthly_tokens = 0.0;
        let mut monthly_requests = 0.0;
        let mut today_tokens = 0.0;
        let mut today_input_tokens = 0.0;
        let mut today_output_tokens = 0.0;
        let mut today_requests = 0.0;
        let mut today_cost = 0.0;
        let mut models: Vec<ModelUsageSummary> = Vec::new();

        let now = chrono::Utc::now() + chrono::Duration::hours(8);
        let month = now.month() as i32;
        let year = now.year() as i32;
        if let Ok(value) = fetch_platform_usage_amount(&station.base_url, &token, month, year).await
        {
            if let Some(parsed) = parse_platform_usage_totals(&value) {
                monthly_tokens = parsed.total.total_tokens();
                monthly_requests = parsed.total.requests;
                today_tokens = parsed.today.total_tokens();
                today_input_tokens = parsed.today.input_tokens();
                today_output_tokens = parsed.today.response_tokens;
                today_requests = parsed.today.requests;
                models = parsed.models;
            }
        }
        if let Ok(value) = fetch_platform_usage_cost(&station.base_url, &token, month, year).await {
            if let Some(parsed) = parse_platform_cost_totals(&value) {
                if parsed.total_cost > 0.0 {
                    monthly_cost = parsed.total_cost;
                }
                if parsed.today_cost > 0.0 {
                    today_cost = parsed.today_cost;
                }
                if !models.is_empty() && !parsed.model_costs.is_empty() {
                    for model in models.iter_mut() {
                        if let Some(cost) = parsed.model_costs.get(&model.model_name) {
                            model.quota = *cost;
                            model.quota_usd = *cost;
                            model.ratio = if model.token_used > 0.0 {
                                *cost / model.token_used
                            } else {
                                0.0
                            };
                        }
                    }
                    models.sort_by(|a, b| {
                        b.quota_usd
                            .partial_cmp(&a.quota_usd)
                            .unwrap_or(std::cmp::Ordering::Equal)
                    });
                }
            }
        }

        if monthly_tokens <= 0.0 {
            monthly_tokens = parse_f64(&summary.monthly_token_usage);
        }
        if monthly_tokens <= 0.0 {
            monthly_tokens = parse_f64(&summary.monthly_usage);
        }
        return Ok(BalanceSnapshot {
            station_id: station.id.clone(),
            station_name: station.name.clone(),
            username,
            current_balance,
            historical_consumption: monthly_cost,
            request_count: monthly_requests,
            stats_count: models.len(),
            total_quota: monthly_cost,
            total_tokens: monthly_tokens,
            average_rpm: 0.0,
            average_tpm: 0.0,
            today_request_count: today_requests,
            today_tokens,
            today_input_tokens,
            today_output_tokens,
            today_actual_cost: today_cost,
            today_cost,
            average_response_ms: 0.0,
            quota_per_unit: 1.0,
            currency,
            models,
            fetched_at: now_ts(),
            status: "success".to_string(),
            error_message: None,
            api_station_name: None,
        });
    }

    {
        let (curr, bal) = fetch_api_balance(&token).await?;
        return Ok(BalanceSnapshot {
            station_id: station.id.clone(),
            station_name: station.name.clone(),
            username,
            current_balance: bal,
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
            quota_per_unit: 1.0,
            currency: curr,
            models: Vec::new(),
            fetched_at: now_ts(),
            status: "success".to_string(),
            error_message: None,
            api_station_name: None,
        });
    }
}
