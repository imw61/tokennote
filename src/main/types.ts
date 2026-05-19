import type { BalanceHistoryPoint } from '../lib/balance-history'

export type Station = {
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

export type AppSettings = {
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

export type ModelUsageSummary = {
  modelName: string
  tokenUsed: number
  count: number
  quota: number
  quotaUsd: number
  ratio: number
  lastUsedAt: number
}

export type BalanceSnapshot = {
  stationId: string
  stationName: string
  username: string
  currentBalance: number
  historicalConsumption: number
  requestCount: number
  statsCount: number
  totalQuota: number
  totalTokens: number
  averageRpm: number
  averageTpm: number
  todayRequestCount: number
  todayTokens: number
  todayInputTokens: number
  todayOutputTokens: number
  todayActualCost: number
  todayCost: number
  averageResponseMs: number
  quotaPerUnit: number
  currency: string
  models: ModelUsageSummary[]
  fetchedAt: number
  status: string
  errorMessage?: string
}

export type LocalStationReviewRecord = {
  stationId: string
  stationName: string
  baseUrl: string
  stationType: string
  rating: number
  content: string
  submittedAt: number
}

export type PersistenceNotice = {
  level: 'warning' | 'error'
  message: string
}

export type AppData = {
  stations: Station[]
  settings: AppSettings
  snapshots: BalanceSnapshot[]
  balanceHistory: BalanceHistoryPoint[]
  localStationReviews: LocalStationReviewRecord[]
}

export type StationTypeDetectionState = 'idle' | 'newapi' | 'sub2api' | 'unknown'

export type StationFormTab = 'relay' | 'provider'

export type OverviewTotals = {
  currencyBalances: Record<string, number>
  historicalConsumptions: Record<string, number>
  quota: number
  requests: number
  failed: number
  warning: number
  pending: number
}
