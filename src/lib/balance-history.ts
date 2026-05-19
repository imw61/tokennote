export type BalanceHistoryPoint = {
  stationId: string
  currency: string
  balance: number
  fetchedAt: number
}

const historyRetentionSec = 7 * 24 * 3600
const maxPointsPerStation = 3000

export function appendBalanceHistory(current: BalanceHistoryPoint[], point: BalanceHistoryPoint) {
  const now = Math.floor(Date.now() / 1000)
  const cutoff = now - historyRetentionSec
  const next = [...current, point].filter(p => p.fetchedAt >= cutoff)

  let count = 0
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i].stationId !== point.stationId) continue
    count++
    if (count > maxPointsPerStation) {
      next.splice(i, 1)
    }
  }
  return next
}

export function selectStationBalanceSeries(history: BalanceHistoryPoint[], stationId: string, rangeHours: number) {
  const now = Math.floor(Date.now() / 1000)
  const cutoff = now - Math.max(1, rangeHours) * 3600
  const points = history
    .filter(p => p.stationId === stationId && p.fetchedAt >= cutoff && Number.isFinite(p.balance))
    .sort((a, b) => a.fetchedAt - b.fetchedAt)

  return points
}

