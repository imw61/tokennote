mod deepseek;
mod newapi;
mod sub2api;

use crate::{AppSettings, BalanceSnapshot, Station};
pub use newapi::{NewApiLoginResult, NewApiWebSession};
pub use sub2api::{Sub2ApiLoginResult, Sub2ApiWebSession};

pub async fn fetch_snapshot(
    station: &Station,
    settings: &AppSettings,
) -> Result<BalanceSnapshot, String> {
    match station.station_type.as_str() {
        "newapi" | "" => newapi::fetch(station, settings).await,
        "sub2api" => sub2api::fetch(station, settings).await,
        "deepseek" => deepseek::fetch(station, settings).await,
        other => Err(format!("不支持的站点类型: {}", other)),
    }
}

pub async fn login_newapi(
    base_url: &str,
    username: &str,
    password: &str,
) -> Result<NewApiLoginResult, String> {
    newapi::login(base_url, username, password).await
}

pub async fn build_newapi_web_session(station: &Station) -> Result<NewApiWebSession, String> {
    newapi::build_web_session(station).await
}

pub async fn login_sub2api(
    base_url: &str,
    username: &str,
    password: &str,
) -> Result<Sub2ApiLoginResult, String> {
    sub2api::login(base_url, username, password).await
}

pub async fn build_sub2api_web_session_from_token(
    base_url: &str,
    access_token: &str,
) -> Result<Sub2ApiWebSession, String> {
    sub2api::build_web_session_from_token(base_url, access_token).await
}

pub async fn login_deepseek(
    username: &str,
    password: &str,
) -> Result<deepseek::DeepSeekLoginResult, String> {
    deepseek::login(username, password).await
}
