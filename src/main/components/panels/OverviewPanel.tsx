import { Overview } from '../Overview'
import type { BalanceSnapshot, OverviewTotals, Station } from '../../types'

type OverviewPanelProps = {
  stations: Station[]
  snapshots: Record<string, BalanceSnapshot>
  totals: OverviewTotals
  loading: boolean
  initialLoaded: boolean
  onAddStation: () => void
  onOpenStation: (id: string) => void
  onReorderStations: (draggedId: string, targetId: string) => Promise<void>
  onRefreshStation: (id: string) => void
  /** 安卓端首页下拉刷新触发的"全量刷新" */
  onRefreshAll: () => void
}

export function OverviewPanel({
  stations,
  snapshots,
  totals,
  loading,
  initialLoaded,
  onAddStation,
  onOpenStation,
  onReorderStations,
  onRefreshStation,
  onRefreshAll
}: OverviewPanelProps) {
  return (
    <Overview
      stations={stations}
      snapshots={snapshots}
      totals={totals}
      loading={loading}
      initialLoaded={initialLoaded}
      onAdd={onAddStation}
      onOpen={onOpenStation}
      onReorder={onReorderStations}
      onRefresh={onRefreshStation}
      onRefreshAll={onRefreshAll}
    />
  )
}
