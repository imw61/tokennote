import { StationDetail } from '../StationDetail'
import type { BalanceSnapshot, Station } from '../../types'
import type { BalanceHistoryPoint } from '../../../lib/balance-history'

type StationDetailPanelProps = {
  station: Station
  snapshot?: BalanceSnapshot
  balanceHistory: BalanceHistoryPoint[]
  trendHours: number
  hasSubmittedReview: boolean
  onBackToOverview: () => void
  onRefreshStation: (id: string) => void
  onOpenConsole: (id: string) => void
  onEditStation: (station: Station) => void
  onDeleteStation: (id: string) => void
  onOpenStationReview: (station: Station) => void
}

export function StationDetailPanel({
  station,
  snapshot,
  balanceHistory,
  trendHours,
  hasSubmittedReview,
  onBackToOverview,
  onRefreshStation,
  onOpenConsole,
  onEditStation,
  onDeleteStation,
  onOpenStationReview
}: StationDetailPanelProps) {
  return (
    <StationDetail
      station={station}
      snapshot={snapshot}
      balanceHistory={balanceHistory}
      trendHours={trendHours}
      hasSubmittedReview={hasSubmittedReview}
      onBack={onBackToOverview}
      onRefresh={() => onRefreshStation(station.id)}
      onOpenConsole={() => onOpenConsole(station.id)}
      onEdit={() => onEditStation(station)}
      onDelete={() => onDeleteStation(station.id)}
      onOpenReview={() => onOpenStationReview(station)}
    />
  )
}
