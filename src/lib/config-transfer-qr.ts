/**
 * 配置二维码传输协议（电脑 → 手机 单向）
 *
 * 设计目标：
 * - 把已经被 6 位密钥 AES-GCM 加密过的密文（来自 `config-transfer-crypto.ts`）切成多个二维码帧。
 *   电脑端循环播放，手机端用摄像头持续解码，集齐所有分片后再合并解密。
 * - 不暴露明文：分片本身仍是加密后密文的 base64 切片，截屏 / 拍照泄露分片需要 6 位密钥才能解。
 * - 每个分片自带会话 ID 与序号，防止与上一次未关闭的会话串台、且乱序到达可重排。
 *
 * 帧格式（纯文本，分隔符 `|`）：
 *   TN1|<sessionId>|<index>|<total>|<dataLen>|<sha256Hex>|<chunkBase64>
 *
 * 字段含义：
 *   - TN1：协议头 + 版本号
 *   - sessionId：8 位 base32（仅 A-Z2-7），用于过滤上一次未关闭的会话
 *   - index：当前分片序号，0-based
 *   - total：分片总数
 *   - dataLen：原始密文 base64 字符串总长（接收侧拼接后做长度校验）
 *   - sha256Hex：原始密文 SHA-256 摘要（前 16 字节 hex），接收侧合并后做完整性校验
 *   - chunkBase64：当前分片的 base64 子串
 *
 * 注：dataLen / sha256Hex 在每一帧里都会重复一份，便于手机端任意先扫到一帧就能验证之后是否凑齐。
 */

const PROTOCOL_TAG = 'TN1'
const SEPARATOR = '|'

/** 单帧 chunk 字段最长字节数。
 *
 *  二维码版本 ~25-30、纠错率 M 时 alphanumeric 模式约 1850-2200 字符，byte 模式约 1300-1500。
 *  我们走 byte 模式（base64 含 `+/`），保守取 800 让一帧 QR 在中等屏幕上能稳定识别。
 *  实测 800 字节 + 协议头大约对应 V20-V22 ECC-M 的二维码，5cm 屏幕距 30cm 以上能稳定识别。
 */
export const QR_CHUNK_BYTES = 800

const SESSION_ID_LENGTH = 8
const SESSION_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

const encoder = new TextEncoder()

function bytesToHex(bytes: Uint8Array): string {
  let result = ''
  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, '0')
  }
  return result
}

/** 生成一个 base32 风格的会话 ID。 */
export function generateSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SESSION_ID_LENGTH))
  let result = ''
  for (let index = 0; index < SESSION_ID_LENGTH; index += 1) {
    result += SESSION_ID_ALPHABET[bytes[index] % SESSION_ID_ALPHABET.length]
  }
  return result
}

async function sha256Short(payload: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(payload))
  const bytes = new Uint8Array(buffer).slice(0, 16)
  return bytesToHex(bytes)
}

export type QrFramePlan = {
  sessionId: string
  total: number
  dataLen: number
  digest: string
  frames: string[]
}

/**
 * 把一份完整的密文（建议是已 AES-GCM 加密过的 base64 / JSON 字符串）切成二维码帧。
 *
 * 注：不在这里再额外加密，加密由 `config-transfer-crypto.ts` 的 `encryptConfigPayload` 负责。
 * 这层只关心"如何把一段文本切成可被相机重组的多个二维码帧"。
 */
export async function buildQrFrames(payload: string): Promise<QrFramePlan> {
  const sessionId = generateSessionId()
  const digest = await sha256Short(payload)
  const dataLen = payload.length
  const total = Math.max(1, Math.ceil(payload.length / QR_CHUNK_BYTES))
  const frames: string[] = []
  for (let index = 0; index < total; index += 1) {
    const start = index * QR_CHUNK_BYTES
    const chunk = payload.slice(start, start + QR_CHUNK_BYTES)
    frames.push(
      [PROTOCOL_TAG, sessionId, String(index), String(total), String(dataLen), digest, chunk].join(SEPARATOR)
    )
  }
  return { sessionId, total, dataLen, digest, frames }
}

export type ParsedQrFrame = {
  sessionId: string
  index: number
  total: number
  dataLen: number
  digest: string
  chunk: string
}

/** 解析单帧二维码原始字符串。如果不是协议帧或字段不齐，返回 null。 */
export function parseQrFrame(raw: string): ParsedQrFrame | null {
  if (!raw || typeof raw !== 'string') return null
  if (!raw.startsWith(`${PROTOCOL_TAG}${SEPARATOR}`)) return null
  // 直接按分隔符分 7 段；最后一段（chunk）可能含 base64 的 `+ /`，所以用 splitN 思路。
  const parts = raw.split(SEPARATOR)
  if (parts.length < 7) return null
  const [tag, sessionId, indexRaw, totalRaw, dataLenRaw, digest, ...rest] = parts
  if (tag !== PROTOCOL_TAG) return null
  const index = Number(indexRaw)
  const total = Number(totalRaw)
  const dataLen = Number(dataLenRaw)
  if (!Number.isInteger(index) || !Number.isInteger(total) || !Number.isInteger(dataLen)) return null
  if (index < 0 || total <= 0 || index >= total) return null
  if (!sessionId || !digest) return null
  // base64 切片在中间不会有 `|`，但我们仍然用 join 兜底，便于以后协议演进。
  const chunk = rest.join(SEPARATOR)
  return { sessionId, index, total, dataLen, digest, chunk }
}

/** 接收侧：根据 sessionId 维护一个收件箱。 */
export class QrFrameInbox {
  private sessionId: string | null = null
  private total = 0
  private dataLen = 0
  private digest = ''
  private chunks = new Map<number, string>()

  reset() {
    this.sessionId = null
    this.total = 0
    this.dataLen = 0
    this.digest = ''
    this.chunks.clear()
  }

  /** 喂入一帧。返回是否被接受（拒绝则可能是异会话或重复帧）。 */
  ingest(frame: ParsedQrFrame): { accepted: boolean; isNewSession: boolean } {
    // 第一次或会话切换时，丢弃之前的状态：用户重新开始扫一份新的导出。
    if (this.sessionId !== frame.sessionId) {
      const isNewSession = this.sessionId !== null
      this.sessionId = frame.sessionId
      this.total = frame.total
      this.dataLen = frame.dataLen
      this.digest = frame.digest
      this.chunks.clear()
      this.chunks.set(frame.index, frame.chunk)
      return { accepted: true, isNewSession }
    }
    if (this.chunks.has(frame.index)) {
      return { accepted: false, isNewSession: false }
    }
    this.chunks.set(frame.index, frame.chunk)
    return { accepted: true, isNewSession: false }
  }

  get sessionInfo() {
    return {
      sessionId: this.sessionId,
      total: this.total,
      received: this.chunks.size,
      digest: this.digest
    }
  }

  /** 是否所有分片都已收齐。 */
  isComplete(): boolean {
    return this.sessionId !== null && this.total > 0 && this.chunks.size === this.total
  }

  /** 列出尚未收到的分片序号，便于 UI 显示进度。 */
  missingIndices(): number[] {
    if (!this.sessionId || this.total === 0) return []
    const missing: number[] = []
    for (let index = 0; index < this.total; index += 1) {
      if (!this.chunks.has(index)) missing.push(index)
    }
    return missing
  }

  /**
   * 合并并校验。集齐前调用会抛错。
   * 返回原始 payload（即编码端的 `payload`）。
   */
  async assemble(): Promise<string> {
    if (!this.isComplete()) {
      throw new Error('分片尚未收齐，无法合并。')
    }
    const ordered: string[] = []
    for (let index = 0; index < this.total; index += 1) {
      const chunk = this.chunks.get(index)
      if (chunk === undefined) {
        throw new Error(`第 ${index + 1} 个分片缺失。`)
      }
      ordered.push(chunk)
    }
    const merged = ordered.join('')
    if (merged.length !== this.dataLen) {
      throw new Error(`分片长度异常：期望 ${this.dataLen} 字符，实际 ${merged.length}。`)
    }
    const digest = await sha256Short(merged)
    if (digest !== this.digest) {
      throw new Error('数据完整性校验失败，请重新扫描整段二维码。')
    }
    return merged
  }
}
