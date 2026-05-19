const encoder = new TextEncoder()
const decoder = new TextDecoder()

const ENCRYPTION_ITERATIONS = 250000

type EncryptedConfigFile = {
  schemaVersion: 2
  app: 'TokenNote'
  exportedAt: string
  warning: string
  salt: string
  iv: string
  ciphertext: string
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

function cloneBytes(bytes: Uint8Array) {
  return Uint8Array.from(bytes)
}

async function deriveKey(key: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', cloneBytes(encoder.encode(key)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: cloneBytes(salt),
      iterations: ENCRYPTION_ITERATIONS,
      hash: 'SHA-256'
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export function validateTransferKey(input: string) {
  const key = input.trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(key)) {
    throw new Error('请输入 6 位英文数字密钥。')
  }
  if (!/[A-Z]/.test(key) || !/\d/.test(key)) {
    throw new Error('密钥需同时包含英文和数字。')
  }
  return key
}

export async function encryptConfigPayload(plainText: string, key: string) {
  const normalizedKey = validateTransferKey(key)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cryptoKey = await deriveKey(normalizedKey, salt)
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: cloneBytes(iv) },
    cryptoKey,
    cloneBytes(encoder.encode(plainText))
  )
  const payload: EncryptedConfigFile = {
    schemaVersion: 2,
    app: 'TokenNote',
    exportedAt: new Date().toISOString(),
    warning: '该文件内容已使用 6 位英文数字混合密钥加密，密钥会统一按大写处理；文件包含站点地址、账号、密码、Cookie、API Key 和本机评价记录等敏感信息。',
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipherBuffer))
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

export async function decryptConfigPayload(raw: string, key: string) {
  const normalizedKey = validateTransferKey(key)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('导入文件不是有效的加密配置 JSON。')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('导入文件格式不正确。')
  }

  const candidate = parsed as Partial<EncryptedConfigFile>
  if (candidate.app !== 'TokenNote' || candidate.schemaVersion !== 2) {
    throw new Error('导入文件不是受支持的加密配置文件。')
  }
  if (
    typeof candidate.salt !== 'string' ||
    typeof candidate.iv !== 'string' ||
    typeof candidate.ciphertext !== 'string'
  ) {
    throw new Error('导入文件缺少加密信息。')
  }

  try {
    const salt = base64ToBytes(candidate.salt)
    const iv = base64ToBytes(candidate.iv)
    const ciphertext = base64ToBytes(candidate.ciphertext)
    const cryptoKey = await deriveKey(normalizedKey, salt)
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: cloneBytes(iv) },
      cryptoKey,
      cloneBytes(ciphertext)
    )
    return decoder.decode(plainBuffer)
  } catch {
    throw new Error('解密失败，请确认输入的 key 是否正确。')
  }
}
