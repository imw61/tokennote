use std::time::Duration;

use crate::models::ForceReminderPayload;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForceReminderResponse {
    ok: Option<bool>,
    data: ForceReminderResponseData,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForceReminderResponseData {
    enabled: bool,
    mode: Option<String>,
    r#type: Option<String>,
    content: String,
    updated_at: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ForceReminderReadRequest<'a> {
    updated_at: &'a str,
    client_version: &'a str,
    source: &'a str,
    machine_uuid: &'a str,
}

pub(crate) async fn fetch_active_force_reminder() -> Option<ForceReminderPayload> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .ok()?;

    let machine_uuid = machine_uid::get().unwrap_or_default();
    let current_version = env!("CARGO_PKG_VERSION");
    let response = client
        .get("https://update.tokennote.dev/public/force-reminder")
        .query(&[
            ("clientVersion", current_version),
            ("source", "desktop"),
            ("machineUuid", machine_uuid.as_str()),
        ])
        .header("accept", "application/json")
        .send()
        .await
        .ok()?;

    if !response.status().is_success() {
        return None;
    }

    let payload: ForceReminderResponse = response.json().await.ok()?;
    if payload.ok == Some(false) || !payload.data.enabled {
        return None;
    }

    let content = payload.data.content.trim().to_string();
    if content.is_empty() {
        return None;
    }

    Some(ForceReminderPayload {
        content,
        mode: normalize_force_reminder_mode(payload.data.mode.as_deref()),
        r#type: normalize_force_reminder_type(payload.data.r#type.as_deref()),
        updated_at: payload.data.updated_at,
    })
}

pub(crate) async fn submit_force_reminder_read(updated_at: &str) {
    let trimmed_updated_at = updated_at.trim();
    if trimmed_updated_at.is_empty() {
        return;
    }

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
    {
        Ok(value) => value,
        Err(_) => return,
    };

    let machine_uuid = machine_uid::get().unwrap_or_default();
    let current_version = env!("CARGO_PKG_VERSION");
    let _ = client
        .post("https://update.tokennote.dev/public/force-reminder-read")
        .header("accept", "application/json")
        .json(&ForceReminderReadRequest {
            updated_at: trimmed_updated_at,
            client_version: current_version,
            source: "desktop",
            machine_uuid: machine_uuid.as_str(),
        })
        .send()
        .await;
}

fn normalize_force_reminder_mode(value: Option<&str>) -> String {
    match value.unwrap_or("").trim() {
        "once" => "once".to_string(),
        _ => "always".to_string(),
    }
}

fn normalize_force_reminder_type(value: Option<&str>) -> String {
    match value.unwrap_or("").trim() {
        "warning" => "warning".to_string(),
        "danger" => "danger".to_string(),
        _ => "info".to_string(),
    }
}
