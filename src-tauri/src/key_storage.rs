//! 加密盐文件读写
//!
//! 仅负责在 `app_dir` 下持久化一份随机 salt（16 字节），
//! 配合机器码派生主密钥使用。salt 文件本身不敏感，
//! 即使被攻击者拿到，没有同机的 machine_uid 也无法还原密钥。

use rand::RngCore;
use std::fs;
use std::path::{Path, PathBuf};

/// 盐文件名。沿用以 `.` 开头的隐藏命名风格，与同目录的配置文件保持一致观感。
pub(crate) const SALT_FILE_NAME: &str = ".tokennote.salt";

/// 盐长度（字节）。16 字节足以让单机离线暴力破解的预计算表完全失效。
pub(crate) const SALT_LEN: usize = 16;

pub(crate) fn salt_path(app_dir: &Path) -> PathBuf {
    app_dir.join(SALT_FILE_NAME)
}

fn read_salt_from_disk(app_dir: &Path) -> Result<Option<[u8; SALT_LEN]>, String> {
    let path = salt_path(app_dir);
    if !path.exists() {
        return Ok(None);
    }

    let buf = fs::read(&path).map_err(|error| format!("读取盐文件失败: {}", error))?;
    if buf.len() != SALT_LEN {
        return Err(format!(
            "盐文件 `{}` 已损坏（期望 {} 字节，实际 {} 字节），无法继续使用。",
            path.display(),
            SALT_LEN,
            buf.len()
        ));
    }
    let mut salt = [0u8; SALT_LEN];
    salt.copy_from_slice(&buf);
    Ok(Some(salt))
}

fn write_salt_to_disk(app_dir: &Path, salt: &[u8; SALT_LEN]) -> Result<(), String> {
    let path = salt_path(app_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建盐目录失败: {}", error))?;
    }
    fs::write(&path, salt).map_err(|error| format!("保存盐文件失败: {}", error))
}

/// 读取已有 salt；不存在时返回 `None`，由调用方决定是否生成。
pub(crate) fn read_existing_salt(app_dir: &Path) -> Result<Option<[u8; SALT_LEN]>, String> {
    read_salt_from_disk(app_dir)
}

/// 读取已有 salt，没有则随机生成并落盘。
pub(crate) fn read_or_create_salt(app_dir: &Path) -> Result<[u8; SALT_LEN], String> {
    if let Some(salt) = read_salt_from_disk(app_dir)? {
        return Ok(salt);
    }
    let mut salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    write_salt_to_disk(app_dir, &salt)?;
    Ok(salt)
}
