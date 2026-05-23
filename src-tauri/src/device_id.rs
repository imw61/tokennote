//! 跨平台机器码读取
//!
//! - 桌面端（macOS / Windows / Linux）使用 `machine-uid` crate 读取硬件指纹。
//! - Android 端通过 `android` 桥接模块调用 Kotlin 侧 `Settings.Secure.ANDROID_ID`。
//!   `ANDROID_ID` 在 Android 8 起与「应用签名 + 用户」绑定，卸载重装会变更，
//!   是产品文档里已经接受的限制。
//!
//! 这里有意把读取逻辑收敛在一个文件，避免散落在多个模块中各自 `cfg`。

#[cfg(not(target_os = "android"))]
pub fn machine_id() -> Result<String, String> {
    machine_uid::get().map_err(|error| format!("读取机器码失败: {}", error))
}

#[cfg(target_os = "android")]
pub fn machine_id() -> Result<String, String> {
    crate::android::device_id::android_id()
}

/// 与 `machine_id` 相同，但不会冒泡错误，方便上层在出错时直接降级为空字符串使用。
#[cfg(not(target_os = "android"))]
pub fn machine_id_or_default() -> String {
    machine_id().unwrap_or_default()
}

#[cfg(target_os = "android")]
pub fn machine_id_or_default() -> String {
    crate::android::android_id_or_default()
}
