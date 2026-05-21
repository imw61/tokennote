//! 主密钥派生
//!
//! 通过 `PBKDF2-HMAC-SHA256(machine_uid, salt || pepper, 100_000)` 派生 32 字节主密钥。
//! - `machine_uid` 来自 `machine_uid` crate，跨平台获取本机硬件指纹
//! - `salt` 由 `key_storage` 落盘，每台机器随机生成、互不相同
//! - `pepper` 为编译期常量，混入应用身份，提升离线攻击成本
//!
//! 派生结果只在内存中使用，不落盘。machine_uid 也不写入日志。

use std::path::Path;

use hmac::Hmac;
use pbkdf2::pbkdf2;
use sha2::Sha256;

use crate::key_storage::{read_existing_salt, read_or_create_salt, SALT_LEN};

/// 派生轮数。10 万轮在桌面端单次启动毫秒级即可完成，
/// 但显著抬高离线暴力破解的成本。
const PBKDF2_ITERATIONS: u32 = 100_000;

/// 应用级 pepper，混入派生输入，避免攻击者用通用 PBKDF2 字典直接命中。
/// 注意：pepper 是公开的（在二进制里），它的作用是把通用攻击转成定向攻击，
/// 主要安全性仍依赖于 machine_uid 的不可获取性。
const APP_PEPPER: &[u8] = b"TokenNote/v2/credential-key";

/// 主密钥长度（AES-256 要求 32 字节）。
pub(crate) const MASTER_KEY_LEN: usize = 32;

/// 机器码缺失或为空时返回的固定错误。
fn fetch_machine_id() -> Result<String, String> {
    let raw = machine_uid::get().map_err(|error| format!("读取机器码失败: {}", error))?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("机器码为空，无法派生加密密钥。".to_string());
    }
    Ok(trimmed.to_string())
}

fn derive_key_with_salt(
    machine_id: &str,
    salt: &[u8; SALT_LEN],
) -> Result<[u8; MASTER_KEY_LEN], String> {
    // 把 salt 与 pepper 拼起来作为 PBKDF2 的 salt 输入，避免再额外存第二份。
    let mut salted_input = Vec::with_capacity(SALT_LEN + APP_PEPPER.len());
    salted_input.extend_from_slice(salt);
    salted_input.extend_from_slice(APP_PEPPER);

    let mut key = [0u8; MASTER_KEY_LEN];
    pbkdf2::<Hmac<Sha256>>(
        machine_id.as_bytes(),
        &salted_input,
        PBKDF2_ITERATIONS,
        &mut key,
    )
    .map_err(|error| format!("PBKDF2 派生主密钥失败: {}", error))?;
    Ok(key)
}

/// 用于加密路径：salt 不存在则生成；机器码异常则报错。
pub(crate) fn derive_master_key_for_encrypt(
    app_dir: &Path,
) -> Result<[u8; MASTER_KEY_LEN], String> {
    let machine_id = fetch_machine_id()?;
    let salt = read_or_create_salt(app_dir)?;
    derive_key_with_salt(&machine_id, &salt)
}

/// 用于解密路径：salt 必须已存在，否则不应改写它（避免覆盖原密文对应的盐）。
pub(crate) fn derive_master_key_for_decrypt(
    app_dir: &Path,
) -> Result<Option<[u8; MASTER_KEY_LEN]>, String> {
    let salt = match read_existing_salt(app_dir)? {
        Some(value) => value,
        None => return Ok(None),
    };
    let machine_id = fetch_machine_id()?;
    let key = derive_key_with_salt(&machine_id, &salt)?;
    Ok(Some(key))
}
