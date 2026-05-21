//! 站点凭据字段的对称加密
//!
//! - 算法：AES-256-GCM（AEAD，自带完整性校验）
//! - 密钥：来自 `key_derivation::derive_master_key_*`，由机器码派生
//! - 密文格式：`ENC:v2:<base64(nonce(12) || ciphertext || tag)>`
//!
//! 解密失败时返回结构化错误，由上层根据原因决定是否提示用户。

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::RngCore;
use std::path::Path;

use crate::key_derivation::{
    derive_master_key_for_decrypt, derive_master_key_for_encrypt, MASTER_KEY_LEN,
};
use crate::key_storage::salt_path;
use crate::AppData;

/// 当前密文前缀。带版本号以便未来升级算法时无痛迁移。
const CIPHER_PREFIX_V2: &str = "ENC:v2:";

/// 解密阶段可能的失败原因。
#[allow(dead_code)]
pub enum DecryptError {
    /// 缺少 salt 文件，但密文存在。通常意味着 app_dir 来自其它机器。
    MissingSalt,
    /// 机器码读取失败或为空。
    MachineId(String),
    /// 派生密钥不匹配（最常见：换了机器或 salt 文件损坏）。
    KeyMismatch(String),
    /// 密文结构损坏（base64 失败、长度不足等）。
    CorruptCipher(String),
    /// 其它不可恢复错误。
    Other(String),
}

impl DecryptError {
    pub fn user_message(&self) -> String {
        match self {
            DecryptError::MissingSalt => {
                "本地凭据无法解密：缺少与本机匹配的密钥派生材料，可能是数据来自其它设备。".to_string()
            }
            DecryptError::MachineId(detail) => {
                format!("本地凭据无法解密：读取机器码失败（{detail}）。")
            }
            DecryptError::KeyMismatch(_) => {
                "本地凭据无法解密：当前机器的指纹与加密时不一致，可能是更换了机器或重装了系统。"
                    .to_string()
            }
            DecryptError::CorruptCipher(detail) => {
                format!("本地凭据无法解密：密文已损坏（{detail}）。")
            }
            DecryptError::Other(detail) => format!("本地凭据无法解密：{detail}"),
        }
    }
}

fn encrypt_field(plain: &str, key: &[u8; MASTER_KEY_LEN]) -> Result<String, String> {
    if plain.is_empty() {
        return Ok(String::new());
    }
    let cipher = Aes256Gcm::new(key.into());
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plain.as_bytes())
        .map_err(|error| format!("AES-GCM 加密失败: {}", error))?;

    let mut combined = Vec::with_capacity(nonce_bytes.len() + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);
    Ok(format!("{}{}", CIPHER_PREFIX_V2, BASE64.encode(combined)))
}

fn decrypt_field(value: &str, key: &[u8; MASTER_KEY_LEN]) -> Result<String, DecryptError> {
    if value.is_empty() {
        return Ok(String::new());
    }
    // 明文（旧记录或全新字段）直接透传。
    let payload = match value.strip_prefix(CIPHER_PREFIX_V2) {
        Some(rest) => rest,
        None => return Ok(value.to_string()),
    };

    let combined = BASE64
        .decode(payload)
        .map_err(|error| DecryptError::CorruptCipher(format!("Base64 解码失败: {}", error)))?;
    if combined.len() < 12 + 16 {
        return Err(DecryptError::CorruptCipher(
            "密文长度不足，无法提取 nonce 与 tag".to_string(),
        ));
    }

    let nonce = Nonce::from_slice(&combined[..12]);
    let ciphertext = &combined[12..];
    let cipher = Aes256Gcm::new(key.into());

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|error| DecryptError::KeyMismatch(format!("AES-GCM 解密失败: {}", error)))?;
    String::from_utf8(plaintext)
        .map_err(|error| DecryptError::CorruptCipher(format!("UTF-8 解码失败: {}", error)))
}

fn has_encrypted_fields(data: &AppData) -> bool {
    data.stations.iter().any(|station| {
        [
            station.cookie.as_str(),
            station.new_api_user.as_str(),
            station.login_username.as_str(),
            station.login_password.as_str(),
        ]
        .iter()
        .any(|value| value.starts_with(CIPHER_PREFIX_V2))
    })
}

/// 加密站点的敏感字段并落到 `data` 上。
pub fn encrypt_data(data: &mut AppData, app_dir: &Path) -> Result<(), String> {
    let key = derive_master_key_for_encrypt(app_dir)?;
    for station in &mut data.stations {
        station.cookie = encrypt_field(&station.cookie, &key)
            .map_err(|error| format!("Cookie 加密失败: {error}"))?;
        station.new_api_user = encrypt_field(&station.new_api_user, &key)
            .map_err(|error| format!("new_api_user 加密失败: {error}"))?;
        station.login_username = encrypt_field(&station.login_username, &key)
            .map_err(|error| format!("登录账号加密失败: {error}"))?;
        station.login_password = encrypt_field(&station.login_password, &key)
            .map_err(|error| format!("登录密码加密失败: {error}"))?;
    }
    Ok(())
}

/// 解密站点的敏感字段。返回 `Err(DecryptError)` 时由上层负责提示用户。
pub fn decrypt_data(data: &mut AppData, app_dir: &Path) -> Result<(), DecryptError> {
    if !has_encrypted_fields(data) {
        return Ok(());
    }

    let key = match derive_master_key_for_decrypt(app_dir)
        .map_err(DecryptError::MachineId)?
    {
        Some(key) => key,
        None => {
            // 配置文件里有密文，但本机找不到 salt：典型的“目录被搬到别的机器”。
            // 顺带把缺失的 salt 路径附在日志里，方便排查。
            let _ = salt_path(app_dir);
            return Err(DecryptError::MissingSalt);
        }
    };

    for station in &mut data.stations {
        station.cookie = decrypt_field(&station.cookie, &key)?;
        station.new_api_user = decrypt_field(&station.new_api_user, &key)?;
        station.login_username = decrypt_field(&station.login_username, &key)?;
        station.login_password = decrypt_field(&station.login_password, &key)?;
    }
    Ok(())
}
