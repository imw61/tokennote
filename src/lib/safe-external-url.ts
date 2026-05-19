import { openUrl } from '@tauri-apps/plugin-opener'

type ValidateExternalUrlOptions = {
  allowHttpLoopback?: boolean
  allowedHosts?: string[]
}

function isLoopbackHost(hostname: string) {
  const value = hostname.trim().toLowerCase()
  return value === 'localhost' || value === '127.0.0.1' || value === '::1'
}

export function validateExternalUrl(rawUrl: string, options: ValidateExternalUrlOptions = {}) {
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    throw new Error('链接为空。')
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('链接格式无效。')
  }

  if (url.username || url.password) {
    throw new Error('链接中不允许包含账号或密码。')
  }

  if (url.protocol === 'https:') {
    // Allow HTTPS by default.
  } else if (url.protocol === 'http:' && options.allowHttpLoopback && isLoopbackHost(url.hostname)) {
    // Allow local development endpoints over HTTP.
  } else {
    throw new Error('仅允许打开 HTTPS 链接；本机回环地址可例外使用 HTTP。')
  }

  if (options.allowedHosts?.length) {
    const hostname = url.hostname.toLowerCase()
    const allowed = options.allowedHosts.some(host => hostname === host.trim().toLowerCase())
    if (!allowed) {
      throw new Error(`当前仅允许打开以下域名：${options.allowedHosts.join('、')}`)
    }
  }

  url.hash = ''
  return url.toString()
}

export async function openExternalUrl(rawUrl: string, options: ValidateExternalUrlOptions = {}) {
  const safeUrl = validateExternalUrl(rawUrl, options)
  await openUrl(safeUrl)
}
