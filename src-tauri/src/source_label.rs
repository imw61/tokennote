//! 上报到 update_server 的客户端来源标识。
//!
//! 通过编译期 `target_os` 区分平台:
//! - Windows -> "windows"
//! - macOS   -> "macos"
//! - Linux   -> "linux"
//! - Android -> "android"
//! - iOS     -> "ios"
//! - 其它    -> "unknown"
//!
//! 后端按这个字段做版本分布统计、来源分布展示与下发策略,字段值落库不做白名单校验,
//! 因此扩展新平台只要在这里增加分支即可,无需改服务端。

#[cfg(target_os = "windows")]
pub(crate) fn source_label() -> &'static str {
    "windows"
}

#[cfg(target_os = "macos")]
pub(crate) fn source_label() -> &'static str {
    "macos"
}

#[cfg(target_os = "linux")]
pub(crate) fn source_label() -> &'static str {
    "linux"
}

#[cfg(target_os = "android")]
pub(crate) fn source_label() -> &'static str {
    "android"
}

#[cfg(target_os = "ios")]
pub(crate) fn source_label() -> &'static str {
    "ios"
}

#[cfg(not(any(
    target_os = "windows",
    target_os = "macos",
    target_os = "linux",
    target_os = "android",
    target_os = "ios"
)))]
pub(crate) fn source_label() -> &'static str {
    "unknown"
}
