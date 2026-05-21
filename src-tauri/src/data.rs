use std::{
    collections::HashMap,
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
};

use uuid::Uuid;

use crate::{
    models::{
        normalize_refresh_concurrency, AppData, AppDataImport, BalanceHistoryPoint,
        LocalStationReviewRecord, PersistenceNotice, Station,
    },
    secure_storage,
    security::normalize_station_base_url,
};

const BACKUP_FILE_COUNT: usize = 3;

pub(crate) struct LoadDataResult {
    pub(crate) data: AppData,
    pub(crate) should_persist: bool,
    pub(crate) warning: Option<PersistenceNotice>,
}

enum ParseDataError {
    Read(String),
    Parse(String),
    Decrypt(String),
}

pub fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

pub fn normalize_url(url: &str) -> String {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };

    if let Ok(parsed) = reqwest::Url::parse(&candidate) {
        if let Some(host) = parsed.host_str() {
            let mut normalized = format!("{}://{}", parsed.scheme(), host);
            if let Some(port) = parsed.port() {
                normalized.push(':');
                normalized.push_str(&port.to_string());
            }
            return normalized;
        }
    }

    trimmed.trim_end_matches('/').to_string()
}

pub fn endpoint(base_url: &str, path: &str) -> String {
    format!("{}{}", normalize_url(base_url), path)
}

pub fn sanitize_cookie(input: &str) -> String {
    let mut value = input.trim().to_string();
    if let Some(start) = value.find("session=") {
        value = value[start..].to_string();
    }
    value = value
        .trim_start_matches("-b")
        .trim()
        .trim_matches('\\')
        .trim()
        .trim_matches('\'')
        .trim_matches('"')
        .trim()
        .to_string();
    if let Some(end) = value.find("' \\") {
        value.truncate(end);
    }
    if let Some(end) = value.find("\" \\") {
        value.truncate(end);
    }
    if let Some(end) = value.find(';') {
        value.truncate(end);
    }
    value.trim().to_string()
}

pub fn normalize_bearer_token(input: &str) -> String {
    let value = input
        .trim()
        .trim_matches('\\')
        .trim()
        .trim_matches('\'')
        .trim_matches('"')
        .trim();
    value
        .strip_prefix("Bearer ")
        .or_else(|| value.strip_prefix("bearer "))
        .unwrap_or(value)
        .trim()
        .to_string()
}

pub fn auth_headers(
    builder: reqwest::RequestBuilder,
    station: &Station,
) -> reqwest::RequestBuilder {
    let base_url = normalize_url(&station.base_url);
    let mut builder = builder
        .header("accept", "application/json, text/plain, */*")
        .header("accept-language", "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6")
        .header("cache-control", "no-store")
        .header("pragma", "no-cache")
        .header("origin", base_url.clone())
        .header("referer", format!("{}/console", base_url))
        .header("priority", "u=1, i")
        .header(
            "sec-ch-ua",
            "\"Chromium\";v=\"148\", \"Microsoft Edge\";v=\"148\", \"Not/A)Brand\";v=\"99\"",
        )
        .header("sec-ch-ua-mobile", "?0")
        .header("sec-ch-ua-platform", "\"macOS\"")
        .header("sec-fetch-dest", "empty")
        .header("sec-fetch-mode", "cors")
        .header("sec-fetch-site", "same-origin")
        .header(
            "user-agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0",
        );
    let new_api_user = station.new_api_user.trim();
    if !new_api_user.is_empty() {
        builder = builder.header("new-api-user", new_api_user);
    }
    let cookie = sanitize_cookie(&station.cookie);
    if !cookie.is_empty() {
        builder = builder.header("cookie", cookie);
    }
    builder
}

pub async fn fetch_json<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    url: &str,
    station: &Station,
) -> Result<T, String> {
    let resp = auth_headers(client.get(url), station)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = resp.status();
    let body = resp.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {status} {url}\n{body}"));
    }
    serde_json::from_str::<T>(&body)
        .map_err(|error| format!("解析 {url} 失败: {error}\n响应前200字符: {:.200}", body))
}

pub(crate) fn normalize_station_type(value: &str) -> Result<String, String> {
    let station_type = value.trim();
    if station_type.is_empty() {
        return Ok("newapi".to_string());
    }
    match station_type {
        "newapi" | "sub2api" | "deepseek" => Ok(station_type.to_string()),
        _ => Err("站点类型不支持（仅支持 NewAPI / Sub2API / DeepSeek）".to_string()),
    }
}

fn normalize_station(station: &mut Station) -> Result<(), String> {
    station.station_type = normalize_station_type(&station.station_type)?;
    station.base_url = normalize_station_base_url(&station.base_url)?;
    station.cookie = if station.station_type == "deepseek" {
        normalize_bearer_token(&station.cookie)
    } else {
        sanitize_cookie(&station.cookie)
    };
    station.new_api_user = station.new_api_user.trim().to_string();
    station.name = station.name.trim().to_string();
    station.auth_mode = match station.auth_mode.trim() {
        "manual" => "manual".to_string(),
        _ => "login".to_string(),
    };
    station.login_username = station.login_username.trim().to_string();
    station.login_password = station.login_password.trim().to_string();
    station.refresh_interval_sec = station.refresh_interval_sec.max(15);
    if !station.low_balance_threshold.is_finite() {
        station.low_balance_threshold = 0.0;
    }
    if !station.change_threshold.is_finite() {
        station.change_threshold = 0.0;
    }
    let now = now_ts();
    if station.id.trim().is_empty() {
        station.id = Uuid::new_v4().to_string();
    }
    if station.created_at <= 0 {
        station.created_at = now;
    }
    station.updated_at = now;
    Ok(())
}

fn normalize_local_station_review(review: &mut LocalStationReviewRecord) {
    review.station_id = review.station_id.trim().to_string();
    review.station_name = review.station_name.trim().to_string();
    review.base_url = normalize_url(&review.base_url);
    review.station_type = review.station_type.trim().to_string();
    review.content = review.content.trim().to_string();
    review.rating = review.rating.clamp(1, 5);
    if review.submitted_at <= 0 {
        review.submitted_at = now_ts();
    }
}

pub(crate) fn normalize_imported_data(input: AppDataImport) -> Result<AppData, String> {
    let mut settings = input.settings;
    settings.global_refresh_interval_sec = settings.global_refresh_interval_sec.max(15);
    settings.refresh_concurrency =
        normalize_refresh_concurrency(settings.refresh_concurrency) as u64;
    settings.stats_range_hours = settings.stats_range_hours.max(1);
    settings.opacity = settings.opacity.clamp(0.58, 1.0);
    if settings.default_time.trim().is_empty() {
        settings.default_time = "hour".to_string();
    }

    let mut stations = input.stations;
    for station in &mut stations {
        normalize_station(station)?;
    }
    let mut local_station_reviews = input.local_station_reviews;
    for review in &mut local_station_reviews {
        normalize_local_station_review(review);
    }
    local_station_reviews.retain(|review| {
        !review.station_id.is_empty() && !review.base_url.is_empty() && !review.content.is_empty()
    });

    Ok(AppData {
        settings,
        stations,
        snapshots: Vec::new(),
        balance_history: Vec::new(),
        local_station_reviews,
    })
}

pub(crate) fn trim_balance_history(
    history: &mut Vec<BalanceHistoryPoint>,
    cutoff_ts: i64,
    max_points_per_station: usize,
) {
    history.retain(|point| point.fetched_at >= cutoff_ts);

    let mut keep_counts: HashMap<&str, usize> = HashMap::new();
    let mut remove_flags = vec![false; history.len()];
    for (index, point) in history.iter().enumerate().rev() {
        let counter = keep_counts.entry(point.station_id.as_str()).or_insert(0);
        *counter += 1;
        if *counter > max_points_per_station {
            remove_flags[index] = true;
        }
    }

    let mut cursor = 0usize;
    history.retain(|_| {
        let keep = !remove_flags[cursor];
        cursor += 1;
        keep
    });
}

fn path_with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let file_name = path
        .file_name()
        .map(|name| name.to_os_string())
        .unwrap_or_else(|| "tokennote.json".into());
    let mut next_name = file_name;
    next_name.push(format!(".{suffix}"));
    path.with_file_name(next_name)
}

fn backup_path(path: &Path, index: usize) -> PathBuf {
    path_with_suffix(path, &format!("bak{index}"))
}

fn rotate_backups(path: &Path) -> Result<(), String> {
    for index in (1..=BACKUP_FILE_COUNT).rev() {
        let current = backup_path(path, index);
        if index == BACKUP_FILE_COUNT {
            if current.exists() {
                fs::remove_file(&current).map_err(|error| error.to_string())?;
            }
            continue;
        }

        let next = backup_path(path, index + 1);
        if current.exists() {
            if next.exists() {
                fs::remove_file(&next).map_err(|error| error.to_string())?;
            }
            fs::rename(&current, &next).map_err(|error| error.to_string())?;
        }
    }

    if path.exists() {
        let primary_backup = backup_path(path, 1);
        if primary_backup.exists() {
            fs::remove_file(&primary_backup).map_err(|error| error.to_string())?;
        }
        fs::copy(path, &primary_backup).map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn write_file_atomically(path: &Path, content: &str) -> Result<(), String> {
    let tmp_path = path_with_suffix(path, &format!("tmp-{}", Uuid::new_v4()));
    let write_result = (|| -> Result<(), String> {
        let mut file = File::create(&tmp_path).map_err(|error| error.to_string())?;
        file.write_all(content.as_bytes())
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;

        if path.exists() {
            rotate_backups(path)?;
            #[cfg(target_os = "windows")]
            {
                fs::remove_file(path).map_err(|error| error.to_string())?;
            }
        }
        fs::rename(&tmp_path, path).map_err(|error| error.to_string())
    })();

    if write_result.is_err() && tmp_path.exists() {
        let _ = fs::remove_file(&tmp_path);
    }

    write_result
}

fn normalize_loaded_data(mut data: AppData) -> AppData {
    for station in &mut data.stations {
        if station.station_type.is_empty() {
            station.station_type = "newapi".to_string();
        }
        if station.auth_mode.is_empty() {
            station.auth_mode = if !station.login_username.trim().is_empty() {
                "login".to_string()
            } else {
                "manual".to_string()
            };
        }
    }
    data.settings.refresh_concurrency =
        normalize_refresh_concurrency(data.settings.refresh_concurrency) as u64;
    trim_balance_history(&mut data.balance_history, now_ts() - 7 * 24 * 3600, 3000);
    data
}

fn parse_data_file(path: &Path) -> Result<AppData, ParseDataError> {
    let content =
        fs::read_to_string(path).map_err(|error| ParseDataError::Read(error.to_string()))?;
    let mut data: AppData = serde_json::from_str(&content)
        .map_err(|error| ParseDataError::Parse(format!("解析配置文件失败: {error}")))?;
    if let Some(app_dir) = path.parent() {
        secure_storage::decrypt_data(&mut data, app_dir)
            .map_err(|error| ParseDataError::Decrypt(error.user_message()))?;
    }
    Ok(normalize_loaded_data(data))
}

/// 解密失败时使用：保留站点的元数据用于展示，但清掉敏感字段并禁用刷新，
/// 避免把密文当作 cookie / 密码送给后端接口。原磁盘文件不会被改写。
fn scaffold_after_decrypt_failure(path: &Path) -> AppData {
    let raw = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(_) => return AppData::default(),
    };
    let mut data: AppData = match serde_json::from_str(&raw) {
        Ok(value) => value,
        Err(_) => return AppData::default(),
    };
    for station in &mut data.stations {
        station.cookie.clear();
        station.new_api_user.clear();
        station.login_username.clear();
        station.login_password.clear();
        station.enabled = false;
    }
    // 历史数据可读，但和无法刷新的站点配套展示意义不大，保留为空更直观。
    data.snapshots.clear();
    normalize_loaded_data(data)
}

fn preserve_corrupt_file(path: &Path, reason: &str) -> Result<Option<PathBuf>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let corrupt_path = path_with_suffix(path, &format!("corrupt-{timestamp}"));
    fs::rename(path, &corrupt_path)
        .map_err(|error| format!("保留损坏配置文件失败: {error}；原始原因: {reason}"))?;
    Ok(Some(corrupt_path))
}

fn find_latest_backup(path: &Path) -> Option<PathBuf> {
    (1..=BACKUP_FILE_COUNT)
        .map(|index| backup_path(path, index))
        .find(|candidate| candidate.exists())
}

pub(crate) fn persist_data(path: &PathBuf, data: &AppData) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut encrypted_data = data.clone();
    if let Some(app_dir) = path.parent() {
        secure_storage::encrypt_data(&mut encrypted_data, app_dir)
            .map_err(|error| format!("加密配置文件失败: {error}"))?;
    }
    let content =
        serde_json::to_string_pretty(&encrypted_data).map_err(|error| error.to_string())?;
    write_file_atomically(path, &content)
}

pub(crate) fn load_data(path: &PathBuf) -> Result<LoadDataResult, String> {
    if !path.exists() {
        return Ok(LoadDataResult {
            data: AppData::default(),
            should_persist: false,
            warning: None,
        });
    }

    match parse_data_file(path) {
        Ok(data) => Ok(LoadDataResult {
            data,
            should_persist: false,
            warning: None,
        }),
        Err(ParseDataError::Decrypt(primary_error)) => {
            // 解密失败：不清空磁盘文件，保留原密文等待用户自助修复（重新登录或导入备份）。
            // 内存中仅保留站点元数据并把敏感字段清空，避免前端把密文当成 cookie 请求接口。
            let scaffold = scaffold_after_decrypt_failure(path);
            Ok(LoadDataResult {
                data: scaffold,
                should_persist: false,
                warning: Some(PersistenceNotice {
                    level: "error".to_string(),
                    message: format!(
                        "{} 已自动停用所有中转站；可在设置中“配置文件转移”导入备份恢复，或删除站点后重新登录。原文件未被修改。",
                        primary_error
                    ),
                }),
            })
        }
        Err(ParseDataError::Read(_primary_error)) => Ok(LoadDataResult {
            data: AppData::default(),
            should_persist: false,
            warning: Some(PersistenceNotice {
                level: "error".to_string(),
                message: "读取本地数据失败，请重启应用后重试。".to_string(),
            }),
        }),
        Err(ParseDataError::Parse(primary_error)) => {
            let preserved_path = preserve_corrupt_file(path, &primary_error)?;
            if let Some(backup) = find_latest_backup(path) {
                match parse_data_file(&backup) {
                    Ok(data) => {
                        let warning = PersistenceNotice {
                            level: "warning".to_string(),
                            message: format!(
                                "主配置文件读取失败，已保留为 `{}`，并从备份 `{}` 恢复。",
                                preserved_path
                                    .as_ref()
                                    .map(|value| value.display().to_string())
                                    .unwrap_or_else(|| "未知路径".to_string()),
                                backup.display()
                            ),
                        };
                        return Ok(LoadDataResult {
                            data,
                            should_persist: true,
                            warning: Some(warning),
                        });
                    }
                    Err(backup_error) => {
                        let backup_error = match backup_error {
                            ParseDataError::Read(error)
                            | ParseDataError::Parse(error)
                            | ParseDataError::Decrypt(error) => error,
                        };
                        let warning = PersistenceNotice {
                            level: "error".to_string(),
                            message: format!(
                                "主配置文件和备份均读取失败。主文件已保留为 `{}`。主文件错误：{}；备份错误：{}",
                                preserved_path
                                    .as_ref()
                                    .map(|value| value.display().to_string())
                                    .unwrap_or_else(|| "未知路径".to_string()),
                                primary_error,
                                backup_error
                            ),
                        };
                        return Ok(LoadDataResult {
                            data: AppData::default(),
                            should_persist: false,
                            warning: Some(warning),
                        });
                    }
                }
            }

            Ok(LoadDataResult {
                data: AppData::default(),
                should_persist: false,
                warning: Some(PersistenceNotice {
                    level: "error".to_string(),
                    message: format!(
                        "主配置文件读取失败，且没有可用备份。原文件已保留为 `{}`。错误：{}",
                        preserved_path
                            .as_ref()
                            .map(|value| value.display().to_string())
                            .unwrap_or_else(|| "未知路径".to_string()),
                        primary_error
                    ),
                }),
            })
        }
    }
}
