import type { AppData, AppSettings, Station } from './types'

export const defaultSettings: AppSettings = {
  globalRefreshIntervalSec: 180,
  alwaysOnTop: true,
  autoLaunchEnabled: true,
  widgetEnabled: true,
  widgetAutoHideEnabled: false,
  lowBalancePopupEnabled: false,
  opacity: 0.82,
  statsRangeHours: 25,
  defaultTime: 'hour',
  refreshConcurrency: 3,
  androidBackgroundRefreshEnabled: true,
  androidLowBalanceNotificationEnabled: true,
  androidForceReminderNotificationEnabled: true
}

export const emptyData: AppData = {
  stations: [],
  settings: defaultSettings,
  snapshots: [],
  balanceHistory: [],
  localStationReviews: []
}

export const officialWebsiteUrl = 'https://www.tokennote.dev'
export const widgetOpacityMin = 0
export const widgetOpacityMax = 1
export const widgetTransparencyMaxPercent = Math.round((widgetOpacityMax - widgetOpacityMin) * 100)

export const formatCurrency = (value: number, symbol = '$') => `${symbol}${value.toFixed(2)}`

export const normCurrency = (raw?: string) => {
  if (!raw) return '$'
  const value = raw.trim()
  if (!value || value === '¤') return '$'
  if (value === 'USD') return '$'
  if (value === 'CNY' || value === 'RMB') return '¥'
  if (value === 'EUR') return '€'
  return value
}

export const formatInt = (value: number) => Math.round(value).toLocaleString('en-US')
export const formatMetric = (value: number) => value.toFixed(3)

export const formatResponseTime = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '--'
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`
}

export const formatTime = (timestamp: number) => timestamp
  ? new Date(timestamp * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  : '未刷新'

export const formatDateTime = (timestamp: number) => timestamp
  ? new Date(timestamp * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '未刷新'

export const stationTypeLabel = (stationType?: string) => {
  if (stationType === 'sub2api') return 'Sub2API'
  if (stationType === 'deepseek') return 'DeepSeek'
  return 'NewAPI'
}

export const stationCredentialLabel = (stationType?: string) => {
  if (stationType === 'sub2api') return 'Bearer Token'
  if (stationType === 'deepseek') return 'API Key'
  return 'new-api-user'
}

export const stationUserFallback = (stationType?: string) => {
  if (stationType === 'sub2api') return 'Sub2API'
  if (stationType === 'deepseek') return 'DeepSeek'
  return 'NewAPI'
}

export const isSub2ApiStation = (stationType?: string) => stationType === 'sub2api'
export const isDeepSeekStation = (stationType?: string) => stationType === 'deepseek'

export const normalizeBaseUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`
  try {
    const parsed = new URL(candidate)
    if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      return ''
    }
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return ''
  }
}

export function moveStation<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

export function createDraft(): Station {
  const now = Math.floor(Date.now() / 1000)
  return {
    id: '',
    name: '',
    baseUrl: '',
    cookie: '',
    newApiUser: '',
    authMode: 'login',
    loginUsername: '',
    loginPassword: '',
    stationType: '',
    enabled: true,
    refreshIntervalSec: 180,
    lowBalanceThreshold: 5,
    changeThreshold: 2,
    createdAt: now,
    updatedAt: now
  }
}
