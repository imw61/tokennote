/**
 * 运行时平台判断。
 *
 * 桌面端（Windows / macOS / Linux）与安卓端共享同一份前端代码。该文件统一暴露
 * "我现在跑在哪种平台上" 的判断接口，避免在业务组件里散落 UA / Tauri OS API 调用。
 *
 * - 通过 Tauri 2 的 metadata.currentPlatform 优先判定（最准确）
 * - 退化用 navigator.userAgentData / userAgent 区分 Windows / macOS / Linux / Android / iOS
 * - 业务侧用得最多的是布尔判断 `isAndroid()`，仍按 'desktop' / 'android' 二分回退
 */

export type RuntimePlatform = 'desktop' | 'android'

/**
 * 上报到 update_server 的来源标识。后端按这个字段做版本分布统计与下发策略，
 * 字段值落库,不做枚举校验,直接展示给后台运营。
 *
 * - 'windows' / 'macos' / 'linux' :桌面端三家
 * - 'android' / 'ios' :移动端
 * - 'unknown' :检测失败的兜底,服务端会归到"未知来源"
 */
export type SourceLabel = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown'

let cachedPlatform: RuntimePlatform | null = null
let cachedSourceLabel: SourceLabel | null = null

type TauriMetadata = {
  currentPlatform?: string
}

function readTauriCurrentPlatform(): string {
  if (typeof window === 'undefined') return ''
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { metadata?: TauriMetadata } }).__TAURI_INTERNALS__
  const value = internals?.metadata?.currentPlatform
  return typeof value === 'string' ? value.toLowerCase() : ''
}

function detectSourceLabel(): SourceLabel {
  // 1. 优先信任 Tauri 自己注入的 currentPlatform。Tauri 2 在以下取值上比较稳定:
  //    'windows' / 'macos' / 'linux' / 'android' / 'ios'。
  const tauriPlatform = readTauriCurrentPlatform()
  switch (tauriPlatform) {
    case 'windows':
    case 'win32':
      return 'windows'
    case 'macos':
    case 'darwin':
      return 'macos'
    case 'linux':
      return 'linux'
    case 'android':
      return 'android'
    case 'ios':
      return 'ios'
  }

  // 2. 退化:用 UA / userAgentData 来识别。Android WebView 在 UA 中含有 "Android",
  //    桌面 Tauri WebView 也会带 OS 名(macOS 上是 "Mac OS X"、Windows 上是 "Windows NT"、
  //    Linux 上是 "Linux x86_64" 等)。
  if (typeof navigator !== 'undefined') {
    const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
    const fromUaData = uaData?.platform?.toLowerCase() ?? ''
    if (fromUaData.includes('windows')) return 'windows'
    if (fromUaData.includes('mac')) return 'macos'
    if (fromUaData.includes('linux')) return 'linux'
    if (fromUaData.includes('android')) return 'android'

    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes('android')) return 'android'
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) return 'ios'
    if (ua.includes('windows')) return 'windows'
    if (ua.includes('mac os x') || ua.includes('macintosh')) return 'macos'
    if (ua.includes('linux')) return 'linux'
  }

  return 'unknown'
}

function detectPlatform(): RuntimePlatform {
  // 业务侧的 'desktop' / 'android' 二分:对所有非 android 一律归 desktop,
  // 兼容现有调用点(它们关心的是"是不是手机"而不是具体桌面 OS)。
  return getSourceLabel() === 'android' ? 'android' : 'desktop'
}

/**
 * 上报给后端的来源标识(对应 ?source=xxx 查询参数 / 请求体 source 字段)。
 *
 * 缓存一次,避免重复读取 navigator / Tauri 内部对象。
 */
export function getSourceLabel(): SourceLabel {
  if (cachedSourceLabel) return cachedSourceLabel
  cachedSourceLabel = detectSourceLabel()
  return cachedSourceLabel
}

export function getRuntimePlatform(): RuntimePlatform {
  if (cachedPlatform) return cachedPlatform
  cachedPlatform = detectPlatform()
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.classList.add(`platform-${cachedPlatform}`)
  }
  return cachedPlatform
}

export function isAndroid(): boolean {
  return getRuntimePlatform() === 'android'
}

export function isDesktop(): boolean {
  return getRuntimePlatform() === 'desktop'
}
