export type LowBalanceAlertItem = {
  stationId: string
  stationName: string
  currentBalance: number
  threshold: number
  currency: string
}

export type LowBalanceAlertPayload = {
  items: LowBalanceAlertItem[]
  totalCount: number
}
