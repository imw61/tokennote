import { Overview } from '../Overview'
import type { BalanceSnapshot, OverviewTotals, Station } from '../../types'

type OverviewPanelProps = {
  stations: Station[]
  snapshots: Record<string, BalanceSnapshot>
  totals: OverviewTotals
  loading: boolean
  onAddStation: () => void
  onOpenStation: (id: string) => void
  onReorderStations: (draggedId: string, targetId: string) => Promise<void>
  onRefreshStation: (id: string) => void
}

export function OverviewPanel({
  stations,
  snapshots,
  totals,
  loading,
  onAddStation,
  onOpenStation,
  onReorderStations,
  onRefreshStation
}: OverviewPanelProps) {
  return (
    <Overview
      stations={stations}
      snapshots={snapshots}
      totals={totals}
      loading={loading}
      onAdd={onAddStation}
      onOpen={onOpenStation}
      onReorder={onReorderStations}
      onRefresh={onRefreshStation}
    />
  )
}
