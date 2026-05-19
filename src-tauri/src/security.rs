use reqwest::Url;

fn build_origin(url: &Url) -> String {
    let mut origin = format!("{}://{}", url.scheme(), url.host_str().unwrap_or_default());
    if let Some(port) = url.port() {
        origin.push(':');
        origin.push_str(&port.to_string());
    }
    origin
}

pub(crate) fn validate_http_url(raw: &str, allow_http: bool) -> Result<Url, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("链接不能为空".to_string());
    }

    let url = Url::parse(trimmed).map_err(|_| "链接格式无效".to_string())?;
    if url.username().trim().is_empty() && url.password().is_none() {
        // No-op.
    } else {
        return Err("链接中不允许包含账号或密码".to_string());
    }

    match url.scheme() {
        "https" => {}
        "http" if allow_http => {}
        "http" => return Err("仅允许使用 HTTPS 链接".to_string()),
        _ => return Err("仅支持 http 或 https 链接".to_string()),
    }

    if url
        .host_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_none()
    {
        return Err("链接缺少合法域名".to_string());
    }

    Ok(url)
}

pub(crate) fn normalize_station_base_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("请输入站点地址".to_string());
    }

    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let url = validate_http_url(&candidate, true)?;
    Ok(build_origin(&url))
}
