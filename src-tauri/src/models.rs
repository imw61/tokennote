use serde::{Deserialize, Serialize};
use std::{collections::HashSet, path::PathBuf, sync::Arc};
use tokio::sync::Mutex;

fn default_refresh_concurrency() -> u64 {
    3
}

fn default_widget_enabled() -> bool {
    true
}

fn default_auto_launch_enabled() -> bool {
    true
}

fn default_low_balance_popup_enabled() -> bool {
    false
}

fn default_widget_auto_hide_enabled() -> bool {
    false
}

fn default_android_background_refresh_enabled() -> bool {
    true
}

fn default_android_low_balance_notification_enabled() -> bool {
    true
}

fn default_android_force_reminder_notification_enabled() -> bool {
    true
}

pub(crate) fn normalize_refresh_concurrency(value: u64) -> usize {
    value.clamp(1, 10) as usize
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Station {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub cookie: String,
    pub new_api_user: String,
    #[serde(default)]
    pub auth_mode: String,
    #[serde(default)]
    pub login_username: String,
    #[serde(default)]
    pub login_password: String,
    pub station_type: String,
    pub enabled: bool,
    pub refresh_interval_sec: u64,
    pub low_balance_threshold: f64,
    pub change_threshold: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub global_refresh_interval_sec: u64,
    pub always_on_top: bool,
    #[serde(default = "default_auto_launch_enabled")]
    pub auto_launch_enabled: bool,
    #[serde(default = "default_widget_enabled")]
    pub widget_enabled: bool,
    #[serde(default = "default_widget_auto_hide_enabled")]
    pub widget_auto_hide_enabled: bool,
    #[serde(default = "default_low_balance_popup_enabled")]
    pub low_balance_popup_enabled: bool,
    pub opacity: f64,
    pub stats_range_hours: u64,
    pub default_time: String,
    #[serde(default = "default_refresh_concurrency")]
    pub refresh_concurrency: u64,
    /// Android 端"后台刷新"开关。桌面端不消费这个字段，但保留在共享配置中
    /// 方便配置文件双向迁移；默认开启。
    #[serde(default = "default_android_background_refresh_enabled")]
    pub android_background_refresh_enabled: bool,
    /// Android 端"低余额系统通知"开关，默认开启。桌面端不消费这个字段。
    #[serde(default = "default_android_low_balance_notification_enabled")]
    pub android_low_balance_notification_enabled: bool,
    /// Android 端"强制提醒系统通知"开关，默认开启。桌面端不消费这个字段。
    #[serde(default = "default_android_force_reminder_notification_enabled")]
    pub android_force_reminder_notification_enabled: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            global_refresh_interval_sec: 180,
            always_on_top: true,
            auto_launch_enabled: default_auto_launch_enabled(),
            widget_enabled: true,
            widget_auto_hide_enabled: default_widget_auto_hide_enabled(),
            low_balance_popup_enabled: default_low_balance_popup_enabled(),
            opacity: 0.82,
            stats_range_hours: 25,
            default_time: "hour".to_string(),
            refresh_concurrency: default_refresh_concurrency(),
            android_background_refresh_enabled: default_android_background_refresh_enabled(),
            android_low_balance_notification_enabled:
                default_android_low_balance_notification_enabled(),
            android_force_reminder_notification_enabled:
                default_android_force_reminder_notification_enabled(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelUsageRaw {
    pub model_name: String,
    pub token_used: f64,
    pub count: f64,
    pub quota: f64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsageSummary {
    pub model_name: String,
    pub token_used: f64,
    pub count: f64,
    pub quota: f64,
    pub quota_usd: f64,
    pub ratio: f64,
    pub last_used_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceSnapshot {
    pub station_id: String,
    pub station_name: String,
    pub username: String,
    pub current_balance: f64,
    pub historical_consumption: f64,
    pub request_count: f64,
    pub stats_count: usize,
    pub total_quota: f64,
    pub total_tokens: f64,
    pub average_rpm: f64,
    pub average_tpm: f64,
    #[serde(default)]
    pub today_request_count: f64,
    #[serde(default)]
    pub today_tokens: f64,
    #[serde(default)]
    pub today_input_tokens: f64,
    #[serde(default)]
    pub today_output_tokens: f64,
    #[serde(default)]
    pub today_actual_cost: f64,
    #[serde(default)]
    pub today_cost: f64,
    #[serde(default)]
    pub average_response_ms: f64,
    pub quota_per_unit: f64,
    pub currency: String,
    pub models: Vec<ModelUsageSummary>,
    pub fetched_at: i64,
    pub status: String,
    pub error_message: Option<String>,
    pub api_station_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceHistoryPoint {
    pub station_id: String,
    pub currency: String,
    pub balance: f64,
    pub fetched_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalStationReviewRecord {
    pub station_id: String,
    pub station_name: String,
    pub base_url: String,
    pub station_type: String,
    pub rating: i32,
    pub content: String,
    pub submitted_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveStationReviewRecordInput {
    pub(crate) station_id: String,
    pub(crate) station_name: String,
    pub(crate) base_url: String,
    pub(crate) station_type: String,
    pub(crate) rating: i32,
    pub(crate) content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppData {
    pub stations: Vec<Station>,
    pub settings: AppSettings,
    pub snapshots: Vec<BalanceSnapshot>,
    #[serde(default)]
    pub security_notice_acknowledged: bool,
    #[serde(default)]
    pub balance_history: Vec<BalanceHistoryPoint>,
    #[serde(default)]
    pub local_station_reviews: Vec<LocalStationReviewRecord>,
    #[serde(default)]
    pub read_force_reminder_updated_ats: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistenceNotice {
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppDataImport {
    pub(crate) settings: AppSettings,
    pub(crate) stations: Vec<Station>,
    #[serde(default)]
    pub(crate) local_station_reviews: Vec<LocalStationReviewRecord>,
}

impl Default for AppData {
    fn default() -> Self {
        Self {
            stations: Vec::new(),
            settings: AppSettings::default(),
            snapshots: Vec::new(),
            security_notice_acknowledged: false,
            balance_history: Vec::new(),
            local_station_reviews: Vec::new(),
            read_force_reminder_updated_ats: Vec::new(),
        }
    }
}

pub(crate) type SharedData = Arc<Mutex<AppData>>;

pub(crate) struct AppState {
    pub(crate) data: SharedData,
    pub(crate) data_path: PathBuf,
    pub(crate) persistence_notice: Arc<Mutex<Option<PersistenceNotice>>>,
    pub(crate) update_window_payload: Arc<Mutex<Option<UpdateWindowPayload>>>,
    pub(crate) low_balance_alert_payload: Arc<Mutex<Option<LowBalanceAlertPayload>>>,
    pub(crate) force_reminder_payload: Arc<Mutex<Option<ForceReminderPayload>>>,
    pub(crate) low_balance_alerted_station_ids: Arc<Mutex<HashSet<String>>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NewApiLoginInput {
    pub(crate) base_url: String,
    pub(crate) username: String,
    pub(crate) password: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NewApiLoginOutput {
    pub(crate) cookie: String,
    pub(crate) new_api_user: String,
    pub(crate) username: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DetectStationTypeResult {
    pub(crate) station_type: String,
    pub(crate) label: String,
    pub(crate) min_client_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateWindowPayload {
    pub(crate) mode: String,
    pub(crate) current_version: String,
    pub(crate) latest_version: String,
    pub(crate) min_supported_version: String,
    pub(crate) notes: Vec<String>,
    pub(crate) primary_update_link: String,
    pub(crate) fallback_update_link: Option<String>,
    pub(crate) error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LowBalanceAlertPayload {
    pub(crate) items: Vec<LowBalanceAlertItem>,
    pub(crate) total_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForceReminderPayload {
    pub(crate) content: String,
    pub(crate) mode: String,
    pub(crate) r#type: String,
    pub(crate) updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LowBalanceAlertItem {
    pub(crate) station_id: String,
    pub(crate) station_name: String,
    pub(crate) current_balance: f64,
    pub(crate) threshold: f64,
    pub(crate) currency: String,
}
