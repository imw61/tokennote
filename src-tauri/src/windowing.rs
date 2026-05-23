use tauri::{
    image::Image, path::BaseDirectory, AppHandle, Emitter, Manager, WebviewUrl,
    WebviewWindowBuilder,
};

use crate::{
    data::{normalize_bearer_token, normalize_url},
    models::{ForceReminderPayload, LowBalanceAlertPayload, UpdateWindowPayload},
    security::validate_http_url,
};

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

pub(crate) fn open_console_webview(
    app: &AppHandle,
    label: &str,
    title: &str,
    start_url: &str,
    init_script: &str,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.close();
    }
    let url = validate_http_url(start_url, true)?;
    WebviewWindowBuilder::new(app, label, WebviewUrl::External(url))
        .title(title)
        .inner_size(1280.0, 860.0)
        .min_inner_size(900.0, 640.0)
        .visible(true)
        .resizable(true)
        .initialization_script(init_script)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub(crate) fn apply_always_on_top(app: &AppHandle, value: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_always_on_top(value)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn apply_widget_visibility(app: &AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("widget") {
        if enabled {
            window.show().map_err(|error| error.to_string())?;
            window
                .set_always_on_top(true)
                .map_err(|error| error.to_string())?;
        } else {
            window.hide().map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn window_is_visible(app: &AppHandle, label: &str) -> bool {
    app.get_webview_window(label)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn main_window_is_visible(app: &AppHandle) -> bool {
    window_is_visible(app, "main")
}

#[cfg(target_os = "macos")]
fn should_keep_macos_dock_visible(app: &AppHandle) -> bool {
    [
        "main",
        "update",
        "low-balance-alert",
        "security-notice",
        "force-reminder",
    ]
        .iter()
        .any(|label| window_is_visible(app, label))
}

#[cfg(target_os = "macos")]
pub(crate) fn ensure_macos_app_icon() -> Result<(), String> {
    use objc::{class, msg_send, sel, sel_impl};

    const APP_ICON_BYTES: &[u8] = include_bytes!("../icons/icon.icns");

    unsafe {
        let ns_app: *mut objc::runtime::Object =
            msg_send![class!(NSApplication), sharedApplication];
        let data: *mut objc::runtime::Object = msg_send![
            class!(NSData),
            dataWithBytes: APP_ICON_BYTES.as_ptr()
            length: APP_ICON_BYTES.len()
        ];
        if data.is_null() {
            return Err("加载 macOS 应用图标数据失败".to_string());
        }

        let image: *mut objc::runtime::Object = msg_send![class!(NSImage), alloc];
        let image: *mut objc::runtime::Object = msg_send![image, initWithData: data];
        if image.is_null() {
            return Err("创建 macOS 应用图标失败".to_string());
        }

        let _: () = msg_send![ns_app, setApplicationIconImage: image];
        let _: *mut objc::runtime::Object = msg_send![image, autorelease];
        Ok(())
    }
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn ensure_macos_app_icon() -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn set_macos_dock_visible(visible: bool) -> Result<(), String> {
    use objc::{class, msg_send, sel, sel_impl};

    unsafe {
        let ns_app: *mut objc::runtime::Object =
            msg_send![class!(NSApplication), sharedApplication];
        let policy: isize = if visible { 0 } else { 1 };
        let _: bool = msg_send![ns_app, setActivationPolicy: policy];
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn set_macos_dock_visible(_visible: bool) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn activate_macos_app() -> Result<(), String> {
    use objc::{class, msg_send, sel, sel_impl};

    unsafe {
        let ns_app: *mut objc::runtime::Object =
            msg_send![class!(NSApplication), sharedApplication];
        let _: () = msg_send![ns_app, activateIgnoringOtherApps: true];
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn activate_macos_app() -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn restore_macos_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    use objc::{msg_send, sel, sel_impl};

    if let Ok(ns_window) = window.ns_window() {
        unsafe {
            let ns_window = ns_window as *mut objc::runtime::Object;
            let nil: *mut objc::runtime::Object = std::ptr::null_mut();
            let _: () = msg_send![ns_window, deminiaturize: nil];
            let _: () = msg_send![ns_window, makeKeyAndOrderFront: nil];
        }
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn restore_macos_window(_window: &tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) fn sync_macos_dock_visibility(app: &AppHandle) -> Result<(), String> {
    set_macos_dock_visible(main_window_is_visible(app))
}

pub(crate) fn hide_main_window_internal(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    if !should_keep_macos_dock_visible(app) {
        set_macos_dock_visible(false)?;
    }
    Ok(())
}

pub(crate) fn minimize_main_window_internal(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.minimize().map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn show_main_window_internal(app: &AppHandle) -> Result<(), String> {
    ensure_macos_app_icon()?;
    set_macos_dock_visible(true)?;
    if let Some(window) = app.get_webview_window("main") {
        // 仅在窗口当前不可见时触发"重放入场动画"流程：
        // 1) 先 emit 事件，让前端重挂载动画容器、回到 0% 帧；
        // 2) 短暂等待让 React commit 完成；
        // 3) 再让窗口可见。
        // 这样能避免出现"先看到完成态再闪回初始态"的视觉抖动。
        let was_hidden = !window.is_visible().unwrap_or(true);
        if was_hidden {
            let _ = window.emit("main-window-shown", ());
            std::thread::sleep(std::time::Duration::from_millis(60));
        }
        activate_macos_app()?;
        let _ = window.show();
        let _ = window.unminimize();
        let _ = restore_macos_window(&window);
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    } else {
        activate_macos_app()?;
    }
    Ok(())
}

pub(crate) fn show_update_window_internal(
    app: &AppHandle,
    payload: UpdateWindowPayload,
) -> Result<(), String> {
    ensure_macos_app_icon()?;
    set_macos_dock_visible(true)?;
    let _ = app.emit("update-popup-data", payload);
    if let Some(window) = app.get_webview_window("update") {
        activate_macos_app()?;
        let _ = window.unminimize();
        let _ = window.center();
        let _ = restore_macos_window(&window);
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    } else {
        activate_macos_app()?;
    }
    Ok(())
}

pub(crate) fn hide_update_window_internal(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("update") {
        window.hide().map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    if !should_keep_macos_dock_visible(app) {
        set_macos_dock_visible(false)?;
    }
    Ok(())
}

pub(crate) fn show_low_balance_alert_window_internal(
    app: &AppHandle,
    payload: LowBalanceAlertPayload,
) -> Result<(), String> {
    ensure_macos_app_icon()?;
    set_macos_dock_visible(true)?;
    let _ = app.emit("low-balance-alert-data", payload);
    if let Some(window) = app.get_webview_window("low-balance-alert") {
        let _ = window.unminimize();
        let _ = window.center();
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn hide_low_balance_alert_window_internal(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("low-balance-alert") {
        window.hide().map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    if !should_keep_macos_dock_visible(app) {
        set_macos_dock_visible(false)?;
    }
    Ok(())
}

pub(crate) fn show_security_notice_window_internal(app: &AppHandle) -> Result<(), String> {
    ensure_macos_app_icon()?;
    set_macos_dock_visible(true)?;
    if let Some(window) = app.get_webview_window("security-notice") {
        let _ = window.unminimize();
        let _ = window.center();
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn hide_security_notice_window_internal(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("security-notice") {
        window.hide().map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    if !should_keep_macos_dock_visible(app) {
        set_macos_dock_visible(false)?;
    }
    Ok(())
}

pub(crate) fn show_force_reminder_window_internal(
    app: &AppHandle,
    payload: ForceReminderPayload,
) -> Result<(), String> {
    ensure_macos_app_icon()?;
    set_macos_dock_visible(true)?;
    let _ = app.emit("force-reminder-data", payload);
    if let Some(window) = app.get_webview_window("force-reminder") {
        let _ = window.unminimize();
        let _ = window.center();
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn hide_force_reminder_window_internal(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("force-reminder") {
        window.hide().map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    if !should_keep_macos_dock_visible(app) {
        set_macos_dock_visible(false)?;
    }
    Ok(())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub(crate) fn load_tray_icon(app: &AppHandle) -> Result<Image<'static>, String> {
    #[cfg(target_os = "macos")]
    let resource_path = "icons/tray-macos.png";

    #[cfg(target_os = "windows")]
    let resource_path = "icons/tray-windows.png";

    let path = app
        .path()
        .resolve(resource_path, BaseDirectory::Resource)
        .map_err(|error| error.to_string())?;
    Image::from_path(&path).map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
#[allow(unexpected_cfgs)]
pub(crate) fn clear_ns_window_background(window: &tauri::WebviewWindow) {
    use objc::{class, msg_send, sel, sel_impl};
    use std::ffi::CStr;
    if let Ok(ns_window) = window.ns_window() {
        unsafe {
            let ns_window = ns_window as *mut objc::runtime::Object;
            let clear: *mut objc::runtime::Object = msg_send![class!(NSColor), clearColor];

            let _: () = msg_send![ns_window, setOpaque: false];
            let _: () = msg_send![ns_window, setBackgroundColor: clear];
            let _: () = msg_send![ns_window, setHasShadow: false];

            let content: *mut objc::runtime::Object = msg_send![ns_window, contentView];
            let _: () = msg_send![content, setWantsLayer: true];
            let _: () = msg_send![content, setLayerContentsRedrawPolicy: 3i32];

            let key_cstr = CStr::from_bytes_with_nul(b"drawsBackground\0").unwrap();
            let key: *mut objc::runtime::Object =
                msg_send![class!(NSString), stringWithUTF8String: key_cstr.as_ptr()];
            let no: *mut objc::runtime::Object = msg_send![class!(NSNumber), numberWithBool: false];

            let subviews: *mut objc::runtime::Object = msg_send![content, subviews];
            let count: usize = msg_send![subviews, count];
            for i in 0..count {
                let view: *mut objc::runtime::Object = msg_send![subviews, objectAtIndex: i];
                let _: () = msg_send![view, setValue: no forKey: key];
            }
        }
    }
}
