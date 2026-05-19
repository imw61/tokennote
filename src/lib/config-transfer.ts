export type ExportableStation = {
  id: string
  name: string
  baseUrl: string
  cookie: string
  newApiUser: string
  authMode: 'login' | 'manual'
  loginUsername: string
  loginPassword: string
  stationType: string
  enabled: boolean
  refreshIntervalSec: number
  lowBalanceThreshold: number
  changeThreshold: number
  createdAt: number
  updatedAt: number
}

export type ExportableSettings = {
  globalRefreshIntervalSec: number
  alwaysOnTop: boolean
  widgetEnabled: boolean
  widgetAutoHideEnabled: boolean
  lowBalancePopupEnabled: boolean
  opacity: number
  statsRangeHours: number
  defaultTime: string
  refreshConcurrency: number
}

export type ExportableLocalStationReviewRecord = {
  stationId: string
  stationName: string
  baseUrl: string
  stationType: string
  rating: number
  content: string
  submittedAt: number
}

export type AppConfigExport = {
  schemaVersion: 1
  app: 'TokenNote'
  exportedAt: string
  warning: string
  settings: ExportableSettings
  stations: ExportableStation[]
  localStationReviews: ExportableLocalStationReviewRecord[]
}

export function buildConfigExport(data: {
  settings: ExportableSettings
  stations: ExportableStation[]
  localStationReviews: ExportableLocalStationReviewRecord[]
}): AppConfigExport {
  return {
    schemaVersion: 1,
    app: 'TokenNote',
    exportedAt: new Date().toISOString(),
    warning: '该文件包含站点地址、账号、密码、Cookie、API Key 等敏感信息，请务必安全保存，勿随意分享。',
    settings: data.settings,
    stations: data.stations,
    localStationReviews: data.localStationReviews
  }
}

export function parseConfigImport(raw: string): Pick<AppConfigExport, 'settings' | 'stations' | 'localStationReviews'> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('导入文件不是有效的 JSON。')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('导入文件格式不正确。')
  }

  const candidate = parsed as Partial<AppConfigExport>
  if (!candidate.settings || typeof candidate.settings !== 'object') {
    throw new Error('导入文件缺少 settings。')
  }
  if (!Array.isArray(candidate.stations)) {
    throw new Error('导入文件缺少 stations。')
  }

  return {
    settings: candidate.settings as ExportableSettings,
    stations: candidate.stations as ExportableStation[],
    localStationReviews: Array.isArray(candidate.localStationReviews)
      ? (candidate.localStationReviews as ExportableLocalStationReviewRecord[])
      : []
  }
}
