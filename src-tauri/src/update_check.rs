use std::time::Duration;

use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::models::UpdateWindowPayload;

const UPDATE_MANIFEST_URL: &str = "https://update.tokennote.dev/public/version";

#[derive(Debug, Deserialize)]
struct ApiSuccess<T> {
    data: T,
}

#[derive(Debug)]
struct UpdateManifest {
    latest_version: String,
    min_supported_version: String,
    release_url: String,
    fallback_release_url: Option<String>,
    notes: Vec<String>,
}

fn normalize_version(value: &str) -> String {
    value.trim().trim_start_matches(['v', 'V']).to_string()
}

fn parse_version_parts(value: &str) -> Vec<u64> {
    normalize_version(value)
        .split('.')
        .map(|part| part.parse::<u64>().unwrap_or(0))
        .collect()
}

fn compare_versions(left: &str, right: &str) -> i8 {
    let left_parts = parse_version_parts(left);
    let right_parts = parse_version_parts(right);
    let max_length = left_parts.len().max(right_parts.len());

    for index in 0..max_length {
        let left_value = left_parts.get(index).copied().unwrap_or(0);
        let right_value = right_parts.get(index).copied().unwrap_or(0);
        if left_value > right_value {
            return 1;
        }
        if left_value < right_value {
            return -1;
        }
    }

    0
}

fn parse_notes(value: &Value) -> Vec<String> {
    match value {
        Value::Array(items) => items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToString::to_string)
            .collect(),
        Value::String(raw) => raw
            .lines()
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToString::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

fn parse_manifest(raw: Value) -> Result<UpdateManifest, String> {
    let object = raw
        .as_object()
        .ok_or_else(|| "版本信息结构无效".to_string())?;

    let latest_version = object
        .get("latestVersion")
        .and_then(Value::as_str)
        .map(normalize_version)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "版本信息缺少 latestVersion".to_string())?;
    let min_supported_version = object
        .get("minSupportedVersion")
        .and_then(Value::as_str)
        .map(normalize_version)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "版本信息缺少 minSupportedVersion".to_string())?;
    let release_url = object
        .get("releaseUrl")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "版本信息缺少 releaseUrl".to_string())?
        .to_string();
    let fallback_release_url = object
        .get("fallbackReleaseUrl")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);
    let notes = object.get("notes").map(parse_notes).unwrap_or_default();

    reqwest::Url::parse(&release_url).map_err(|error| format!("releaseUrl 无效: {error}"))?;
    if let Some(url) = &fallback_release_url {
        reqwest::Url::parse(url).map_err(|error| format!("fallbackReleaseUrl 无效: {error}"))?;
    }

    Ok(UpdateManifest {
        latest_version,
        min_supported_version,
        release_url,
        fallback_release_url,
        notes,
    })
}

fn build_manifest_url(current_version: &str, machine_uuid: &str) -> Result<String, String> {
    let mut url =
        reqwest::Url::parse(UPDATE_MANIFEST_URL).map_err(|error| format!("更新地址无效: {error}"))?;
    url.query_pairs_mut()
        .append_pair("clientVersion", current_version)
        .append_pair("source", crate::source_label::source_label());
    if !machine_uuid.is_empty() {
        url.query_pairs_mut()
            .append_pair("machineUuid", machine_uuid);
    }
    Ok(url.to_string())
}

pub(crate) async fn fetch_required_update_payload(
    app: &AppHandle,
) -> Result<Option<UpdateWindowPayload>, String> {
    let current_version = normalize_version(&app.package_info().version.to_string());
    let machine_uuid = crate::device_id::machine_id_or_default();
    let request_url = build_manifest_url(&current_version, &machine_uuid)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(request_url)
        .header("accept", "application/json")
        .header("cache-control", "no-store")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("更新服务返回 HTTP {status}"));
    }

    let payload = response
        .json::<ApiSuccess<Value>>()
        .await
        .map_err(|error| error.to_string())?;
    let manifest = parse_manifest(payload.data)?;
    if compare_versions(&current_version, &manifest.min_supported_version) >= 0 {
        return Ok(None);
    }

    Ok(Some(UpdateWindowPayload {
        mode: "required".to_string(),
        current_version,
        latest_version: manifest.latest_version,
        min_supported_version: manifest.min_supported_version,
        notes: manifest.notes,
        primary_update_link: manifest.release_url,
        fallback_update_link: manifest.fallback_release_url,
        error_message: None,
    }))
}
