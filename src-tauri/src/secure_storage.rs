use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::RngCore;
use std::fs;
use std::path::PathBuf;

use crate::AppData;

const KEY_FILE_NAME: &str = ".tokennote.key";

fn key_path(app_dir: &PathBuf) -> PathBuf {
    app_dir.join(KEY_FILE_NAME)
}

fn read_file_key(app_dir: &PathBuf) -> Result<Option<[u8; 32]>, String> {
    let key_path = key_path(app_dir);
    if !key_path.exists() {
        return Ok(None);
    }

    let key_data = fs::read(&key_path).map_err(|e| format!("读取密钥文件失败: {}", e))?;
    if key_data.len() != 32 {
        return Err(format!(
            "密钥文件 `{}` 已损坏（期望 32 字节，实际 {} 字节），无法继续使用。",
            key_path.display(),
            key_data.len()
        ));
    }

    let mut key = [0u8; 32];
    key.copy_from_slice(&key_data);
    Ok(Some(key))
}

fn persist_file_key(app_dir: &PathBuf, key: &[u8; 32]) -> Result<(), String> {
    let key_path = key_path(app_dir);
    if let Some(parent) = key_path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建密钥目录失败: {}", error))?;
    }
    fs::write(&key_path, key).map_err(|error| format!("保存密钥文件失败: {}", error))
}

fn create_encryption_key() -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    Ok(key)
}

fn get_or_create_encryption_key(app_dir: &PathBuf) -> Result<[u8; 32], String> {
    if let Some(key) = read_file_key(app_dir)? {
        return Ok(key);
    }
    let key = create_encryption_key()?;
    persist_file_key(app_dir, &key)?;
    Ok(key)
}

fn read_existing_encryption_key(app_dir: &PathBuf) -> Result<Option<[u8; 32]>, String> {
    read_file_key(app_dir)
}

fn encrypt(data: &str, key: &[u8; 32]) -> Result<String, String> {
    if data.is_empty() {
        return Ok(String::new());
    }
    let cipher = Aes256Gcm::new(key.into());
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, data.as_bytes())
        .map_err(|error| format!("AES-GCM 加密失败: {}", error))?;
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(format!("ENC:{}", BASE64.encode(combined)))
}

fn decrypt(encrypted: &str, key: &[u8; 32]) -> Result<String, String> {
    if !encrypted.starts_with("ENC:") {
        return Ok(encrypted.to_string());
    }
    let payload = &encrypted[4..];
    let combined = BASE64
        .decode(payload)
        .map_err(|error| format!("Base64 解码失败: {}", error))?;
    if combined.len() < 12 {
        return Err("密文长度不足，无法提取随机 nonce".to_string());
    }

    let nonce = Nonce::from_slice(&combined[..12]);
    let ciphertext = &combined[12..];
    let cipher = Aes256Gcm::new(key.into());

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|error| format!("AES-GCM 解密失败: {}", error))?;
    String::from_utf8(plaintext).map_err(|error| format!("UTF-8 解码失败: {}", error))
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
        .any(|value| value.starts_with("ENC:"))
    })
}

pub fn encrypt_data(data: &mut AppData, app_dir: &PathBuf) -> Result<(), String> {
    let key = get_or_create_encryption_key(app_dir)?;
    for station in &mut data.stations {
        station.cookie =
            encrypt(&station.cookie, &key).map_err(|error| format!("Cookie 加密失败: {error}"))?;
        station.new_api_user = encrypt(&station.new_api_user, &key)
            .map_err(|error| format!("new_api_user 加密失败: {error}"))?;
        station.login_username = encrypt(&station.login_username, &key)
            .map_err(|error| format!("登录账号加密失败: {error}"))?;
        station.login_password = encrypt(&station.login_password, &key)
            .map_err(|error| format!("登录密码加密失败: {error}"))?;
    }
    Ok(())
}

pub fn decrypt_data(data: &mut AppData, app_dir: &PathBuf) -> Result<(), String> {
    if !has_encrypted_fields(data) {
        return Ok(());
    }

    let key = read_existing_encryption_key(app_dir)?.ok_or_else(|| {
        format!(
            "检测到已加密的本地凭据，但密钥文件 `{}` 不存在，无法解密。",
            key_path(app_dir).display()
        )
    })?;

    for station in &mut data.stations {
        station.cookie = decrypt(&station.cookie, &key).map_err(|error| {
            format!("Cookie 解密失败，可能是密钥文件不匹配或数据已损坏: {error}")
        })?;
        station.new_api_user = decrypt(&station.new_api_user, &key).map_err(|error| {
            format!("new_api_user 解密失败，可能是密钥文件不匹配或数据已损坏: {error}")
        })?;
        station.login_username = decrypt(&station.login_username, &key).map_err(|error| {
            format!("登录账号解密失败，可能是密钥文件不匹配或数据已损坏: {error}")
        })?;
        station.login_password = decrypt(&station.login_password, &key).map_err(|error| {
            format!("登录密码解密失败，可能是密钥文件不匹配或数据已损坏: {error}")
        })?;
    }
    Ok(())
}
