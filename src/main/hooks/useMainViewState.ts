import { useMemo, useState } from 'react'
import { selectStationBalanceSeries } from '../../lib/balance-history'
import type { AppData, BalanceSnapshot } from '../types'
import { widgetOpacityMax, widgetTransparencyMaxPercent } from '../utils'

type UseMainViewStateOptions = {
  data: AppData
  snapshots: Record<string, BalanceSnapshot>
}

export function useMainViewState({ data, snapshots }: UseMainViewStateOptions) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activePanel, setActivePanel] = useState<'overview' | 'settings' | 'reviews'>('overview')

  const selectedStation = data.stations.find(station => station.id === selectedId) || null
  const selectedSnapshot = selectedStation ? snapshots[selectedStation.id] : undefined
  const selectedBalanceHistory = useMemo(() => {
    if (!selectedStation) return []
    return selectStationBalanceSeries(data.balanceHistory, selectedStation.id, data.settings.statsRangeHours)
  }, [data.balanceHistory, data.settings.statsRangeHours, selectedStation])

  const showSettings = activePanel === 'settings'
  const showReviews = activePanel === 'reviews'
  const currentView = showSettings ? 'settings' : showReviews ? 'reviews' : selectedStation ? 'detail' : 'overview'
  const contentKey = `${currentView}-${selectedId ?? 'overview'}`
  const contentAnimationClass = currentView === 'detail' ? 'animate-page-in-right' : 'animate-page-in-left'
  const title = showSettings ? '偏好设置' : showReviews ? '站点评价' : selectedStation ? selectedStation.name : 'TokenNote'

  const transparencyPercent = Math.max(
    0,
    Math.min(widgetTransparencyMaxPercent, Math.round((widgetOpacityMax - data.settings.opacity) * 100))
  )
  const transparencyFill = Math.max(
    0,
    Math.min(100, Math.round((transparencyPercent / widgetTransparencyMaxPercent) * 100))
  )

  const resetSelection = () => setSelectedId(null)
  const closeOverlays = () => {
    setSelectedId(null)
    setActivePanel('overview')
  }

  const openStation = (stationId: string) => {
    setActivePanel('overview')
    setSelectedId(stationId)
  }

  const openStationReviews = (stationId: string) => {
    setSelectedId(stationId)
    setActivePanel('reviews')
  }

  const backFromReviews = () => {
    setActivePanel('overview')
  }

  return {
    selectedId,
    setSelectedId,
    activePanel,
    setActivePanel,
    showSettings,
    showReviews,
    selectedStation,
    selectedSnapshot,
    selectedBalanceHistory,
    currentView,
    contentKey,
    contentAnimationClass,
    title,
    transparencyPercent,
    transparencyFill,
    resetSelection,
    closeOverlays,
    openStation,
    openStationReviews,
    backFromReviews
  }
}
