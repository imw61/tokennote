//! 币种符号归一。
//!
//! 各 provider 在 `BalanceSnapshot.currency` 字段填的不一致(有些填 ISO 码 `USD` / `CNY`,
//! 有些填符号 `$` / `¥`),如果直接用作小组件 / 通知 / 聚合的 key,同一种币会被拆成
//! 多个桶(例如 `USD` 与 `$` 各算一份)。
//!
//! 这里提供与前端 `src/main/utils.ts::normCurrency` 完全一致的归一逻辑,确保桌面端、
//! 移动端 WebView、Android 后台 Service 三条路径生成的视图保持一致。
//!
//! 对应表:
//! - 空 / `¤`             -> `$`
//! - `USD`                -> `$`
//! - `CNY` / `RMB` / `¥`  -> `¥`
//! - `EUR` / `€`          -> `€`
//! - 其它原样返回(去除两端空白)

/// 把任意来源的 currency 字符串归一成展示用符号。
#[allow(dead_code)]
pub fn normalize_currency_symbol(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "¤" {
        return "$".to_string();
    }
    match trimmed {
        "USD" => "$".to_string(),
        "CNY" | "RMB" | "¥" => "¥".to_string(),
        "EUR" | "€" => "€".to_string(),
        other => other.to_string(),
    }
}
