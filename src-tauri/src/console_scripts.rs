//! 站点控制台注入脚本与外部链接守卫脚本
//!
//! 这些函数都是纯字符串构造，不直接操作 Tauri 窗口；
//! 桌面端在打开内嵌 WebView 控制台时使用，Android 端目前不打开嵌入式 WebView，
//! 但相关字符串生成逻辑保留在共享模块里，方便后续若引入应用内 WebView 时复用。

use crate::data::{normalize_bearer_token, normalize_url};

fn json_string_literal(value: &str) -> Result<String, String> {
    serde_json::to_string(value).map_err(|error| error.to_string())
}

pub(crate) fn station_console_label(station_id: &str) -> String {
    format!("console-{}", station_id)
}

pub(crate) fn newapi_console_script(
    base_url: &str,
    cookie: &str,
    new_api_user: &str,
    user_json: &str,
    status_json: &str,
    quota_display_type: &str,
    quota_per_unit: &str,
    system_name: &str,
) -> Result<String, String> {
    let origin = json_string_literal(&normalize_url(base_url))?;
    let cookie = json_string_literal(cookie)?;
    let new_api_user = json_string_literal(new_api_user)?;
    let user_json = json_string_literal(user_json)?;
    let status_json = json_string_literal(status_json)?;
    let quota_display_type = json_string_literal(quota_display_type)?;
    let quota_per_unit = json_string_literal(quota_per_unit)?;
    let system_name = json_string_literal(system_name)?;
    let target = json_string_literal(&format!("{}/console", normalize_url(base_url)))?;
    Ok(format!(
        r#"
(() => {{
  const expectedOrigin = {origin};
  if (window.location.origin !== expectedOrigin) return;
  const sessionCookie = {cookie};
  const targetUrl = {target};
  try {{
    document.cookie = `${{sessionCookie}}; path=/; SameSite=Lax`;
    if ({new_api_user}.trim()) {{
      localStorage.setItem('new-api-user', {new_api_user});
    }}
    if ({user_json}.trim()) {{
      localStorage.setItem('user', {user_json});
    }}
    if ({status_json}.trim()) {{
      localStorage.setItem('status', {status_json});
    }}
    if ({quota_display_type}.trim()) {{
      localStorage.setItem('quota_display_type', {quota_display_type});
    }}
    if ({quota_per_unit}.trim()) {{
      localStorage.setItem('quota_per_unit', {quota_per_unit});
    }}
    if ({system_name}.trim()) {{
      localStorage.setItem('system_name', {system_name});
    }}
  }} catch (error) {{
    console.error('TokenNote NewAPI init failed', error);
  }}
  if (window.location.href !== targetUrl) {{
    window.location.replace(targetUrl);
  }}
}})();
"#
    ))
}

pub(crate) fn sub2api_console_script(
    base_url: &str,
    auth_token: &str,
    auth_user_json: &str,
    refresh_token: &str,
    token_expires_at: i64,
) -> Result<String, String> {
    let origin = json_string_literal(&normalize_url(base_url))?;
    let auth_token = json_string_literal(auth_token)?;
    let auth_user_json = json_string_literal(auth_user_json)?;
    let refresh_token = json_string_literal(refresh_token)?;
    let token_expires_at = token_expires_at.to_string();
    let target = json_string_literal(&format!("{}/dashboard", normalize_url(base_url)))?;
    Ok(format!(
        r#"
(() => {{
  const expectedOrigin = {origin};
  if (window.location.origin !== expectedOrigin) return;
  const targetUrl = {target};
  try {{
    localStorage.setItem('auth_token', {auth_token});
    localStorage.setItem('auth_user', {auth_user_json});
    if ({refresh_token}.trim()) {{
      localStorage.setItem('refresh_token', {refresh_token});
    }}
    localStorage.setItem('token_expires_at', String({token_expires_at}));
  }} catch (error) {{
    console.error('TokenNote Sub2API init failed', error);
  }}
  if (window.location.href !== targetUrl) {{
    window.location.replace(targetUrl);
  }}
}})();
"#
    ))
}

pub(crate) fn deepseek_console_base_url() -> &'static str {
    "https://platform.deepseek.com"
}

pub(crate) fn deepseek_console_script(base_url: &str, user_token: &str) -> Result<String, String> {
    let origin = json_string_literal(&normalize_url(base_url))?;
    let normalized_token = normalize_bearer_token(user_token);
    let user_token_payload = serde_json::json!({
        "value": normalized_token,
        "__version": "0"
    })
    .to_string();
    let user_token_payload = json_string_literal(&user_token_payload)?;
    let target = json_string_literal(&format!("{}/usage", normalize_url(base_url)))?;
    Ok(format!(
        r#"
(() => {{
  const expectedOrigin = {origin};
  if (window.location.origin !== expectedOrigin) return;
  const targetUrl = {target};
  try {{
    localStorage.setItem('userToken', {user_token_payload});
    sessionStorage.setItem('userToken', {user_token_payload});
  }} catch (error) {{
    console.error('TokenNote DeepSeek init failed', error);
  }}
  if (window.location.href !== targetUrl) {{
    window.location.replace(targetUrl);
  }}
}})();
"#
    ))
}

pub(crate) fn external_link_guard_script(
    station_origin: &str,
    station_name: &str,
) -> Result<String, String> {
    let origin = json_string_literal(station_origin)?;
    let name = json_string_literal(station_name)?;
    Ok(format!(
        r#"
(() => {{
  const __TN_ORIGIN = {origin};
  const __TN_NAME = {name};
  let __TN_FORM_NAV = false;

  function isSameOrigin(url) {{
    try {{
      return new URL(url, window.location.href).origin === __TN_ORIGIN;
    }} catch {{ return false; }}
  }}

  function isNavigable(url) {{
    try {{
      const u = new URL(url, window.location.href);
      return u.protocol === 'https:' || u.protocol === 'http:';
    }} catch {{ return false; }}
  }}

  function requestOpen(url, reason) {{
    if (!isNavigable(url)) return;
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {{
      window.__TAURI_INTERNALS__.invoke('confirm_open_external_url', {{
        url: url,
        stationName: __TN_NAME,
        reason: reason
      }}).catch(function() {{}});
    }}
  }}

  window.open = function(url, target) {{
    if (url && !isSameOrigin(url)) {{
      __TN_FORM_NAV = true;
      setTimeout(function() {{ __TN_FORM_NAV = false; }}, 1000);
      window.location.href = url;
    }} else if (url && isSameOrigin(url)) {{
      window.location.href = url;
    }}
    return null;
  }};

  const origSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function() {{
    const action = this.getAttribute('action') || '';
    if (action && !isSameOrigin(action)) {{
      __TN_FORM_NAV = true;
      if (this.target === '_blank') {{
        this.target = '_self';
      }}
      setTimeout(function() {{ __TN_FORM_NAV = false; }}, 1000);
    }}
    return origSubmit.call(this);
  }};

  document.addEventListener('submit', function(e) {{
    const form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    const action = form.getAttribute('action') || '';
    if (action && !isSameOrigin(action)) {{
      __TN_FORM_NAV = true;
      if (form.target === '_blank') {{
        form.target = '_self';
      }}
      setTimeout(function() {{ __TN_FORM_NAV = false; }}, 1000);
    }}
  }}, true);

  document.addEventListener('click', function(e) {{
    const a = e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    if (a.target === '_blank' || !isSameOrigin(href)) {{
      e.preventDefault();
      e.stopPropagation();
      requestOpen(new URL(href, window.location.href).href,
        a.target === '_blank' ? 'target_blank' : 'cross_origin');
    }}
  }}, true);

  document.addEventListener('auxclick', function(e) {{
    if (e.button !== 1) return;
    const a = e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    if (a.target === '_blank' || !isSameOrigin(href)) {{
      e.preventDefault();
      e.stopPropagation();
      requestOpen(new URL(href, window.location.href).href,
        a.target === '_blank' ? 'target_blank' : 'cross_origin');
    }}
  }}, true);

  const origAssign = window.location.assign.bind(window.location);
  const origReplace = window.location.replace.bind(window.location);

  window.location.assign = function(url) {{
    if (__TN_FORM_NAV || isSameOrigin(url)) {{
      origAssign(url);
    }} else {{
      requestOpen(new URL(url, window.location.href).href, 'cross_origin');
    }}
  }};

  window.location.replace = function(url) {{
    if (__TN_FORM_NAV || isSameOrigin(url)) {{
      origReplace(url);
    }} else {{
      requestOpen(new URL(url, window.location.href).href, 'cross_origin');
    }}
  }};

  try {{
    const locProto = Object.getPrototypeOf(window.location);
    const hrefDesc = Object.getOwnPropertyDescriptor(locProto, 'href') ||
                     Object.getOwnPropertyDescriptor(window.location, 'href');
    if (hrefDesc && hrefDesc.set) {{
      const origSet = hrefDesc.set;
      Object.defineProperty(window.location, 'href', {{
        get: hrefDesc.get ? hrefDesc.get.bind(window.location) : function() {{ return window.location.href; }},
        set: function(url) {{
          if (__TN_FORM_NAV || isSameOrigin(url)) {{
            origSet.call(window.location, url);
          }} else {{
            requestOpen(new URL(url, window.location.href).href, 'cross_origin');
          }}
        }},
        configurable: true
      }});
    }}
  }} catch (e) {{}}
}})();
"#
    ))
}
