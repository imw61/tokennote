import type { Dispatch, SetStateAction } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ask } from '@tauri-apps/plugin-dialog'
import { useMemo, useState } from 'react'
import type { AppData, AppSettings, BalanceSnapshot, OverviewTotals } from '../types'
import { isTrustedConsoleOrigin, trustConsoleOrigin } from '../../lib/station-console-trust'
import { moveStation, normCurrency, normalizeBaseUrl } from '../utils'

type UseStationActionsOptions = {
  data: AppData
  setData: Dispatch<SetStateAction<AppData>>
  snapshots: Record<string, BalanceSnapshot>
  onStationRemoved?: () => void
  /**
   * 拖拽排序专用:在 reorder_stations 命令前后短暂屏蔽
   * `stations-changed` 事件触发的全量重拉,避免冗余刷新引起视觉回弹。
   */
  suppressStationsChangedRefresh?: (durationMs?: number) => void
}

export function useStationActions({
  data,
  setData,
  snapshots,
  onStationRemoved,
  suppressStationsChangedRefresh
}: UseStationActionsOptions) {
  const [loading, setLoading] = useState(false)
  const [openingConsoleId, setOpeningConsoleId] = useState<string | null>(null)

  const totals = useMemo<OverviewTotals>(() => {
    let requests = 0
    let failed = 0
    let pending = 0
    let warning = 0
    let quota = 0
    const currencyBalances: Record<string, number> = {}
    const historicalConsumptions: Record<string, number> = {}

    for (const station of data.stations) {
      const snapshot = snapshots[station.id]
      if (!snapshot) {
        pending++
        continue
      }
      if (snapshot.status === 'failed') {
        failed++
        continue
      }
      if (snapshot.currentBalance <= station.lowBalanceThreshold) warning++
      const symbol = normCurrency(snapshot.currency)
      currencyBalances[symbol] = (currencyBalances[symbol] || 0) + snapshot.currentBalance
      historicalConsumptions[symbol] = (historicalConsumptions[symbol] || 0) + snapshot.historicalConsumption
      quota += snapshot.totalQuota
      requests += snapshot.requestCount
    }

    return { requests, failed, pending, warning, quota, currencyBalances, historicalConsumptions }
  }, [data.stations, snapshots])

  const refreshAll = async () => {
    setLoading(true)
    try {
      setData(await invoke<AppData>('refresh_all'))
    } finally {
      setLoading(false)
    }
  }

  const refreshOne = async (id: string) => {
    setLoading(true)
    try {
      setData(await invoke<AppData>('refresh_station', { id }))
    } finally {
      setLoading(false)
    }
  }

  const removeStation = async (id: string) => {
    setData(await invoke<AppData>('delete_station', { id }))
    onStationRemoved?.()
  }

  const openStationConsole = async (id: string) => {
    const station = data.stations.find(item => item.id === id)
    const origin = station ? normalizeBaseUrl(station.baseUrl) : ''
    if (!station || !origin) {
      throw new Error('当前站点地址无效，无法打开控制台。')
    }
    if (!isTrustedConsoleOrigin(origin)) {
      const confirmed = await ask(
        `即将打开外部控制台：${origin}\n\nTokenNote 会把当前站点的登录态写入这个域名对应的网页会话中，以便你直接进入控制台。请确认该域名可信且由你本人维护。`,
        {
          title: station.name?.trim() ? `${station.name} · 控制台确认` : '控制台确认',
          kind: 'warning',
          okLabel: '信任并继续',
          cancelLabel: '取消'
        }
      )
      if (!confirmed) return
      trustConsoleOrigin(origin)
    }
    setOpeningConsoleId(id)
    try {
      await invoke('open_station_console', { id })
    } finally {
      setOpeningConsoleId(null)
    }
  }

  const saveSettings = async (settings: AppSettings) => {
    setData(current => ({ ...current, settings }))
    try {
      setData(await invoke<AppData>('save_settings', { settings }))
    } catch (error) {
      console.error(error)
      setData(await invoke<AppData>('get_app_data'))
    }
  }

  const reorderStations = async (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return
    const fromIndex = data.stations.findIndex(station => station.id === draggedId)
    const toIndex = data.stations.findIndex(station => station.id === targetId)
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return

    const nextStations = moveStation(data.stations, fromIndex, toIndex)
    // 调用 IPC 之前就开启屏蔽窗口:reorder_stations 完成后后端会 emit
    // `stations-changed`,如果不屏蔽,前端会再发一次 `get_app_data`,
    // 在边缘时序下覆盖掉刚刚乐观换序的 stations 数组引用,引起卡片视觉抖动。
    suppressStationsChangedRefresh?.(800)
    setData(current => ({ ...current, stations: nextStations }))

    try {
      setData(await invoke<AppData>('reorder_stations', {
        stationIds: nextStations.map(station => station.id)
      }))
    } catch (error) {
      console.error(error)
      setData(await invoke<AppData>('get_app_data'))
    }
  }

  return {
    loading,
    openingConsoleId,
    totals,
    refreshAll,
    refreshOne,
    removeStation,
    openStationConsole,
    saveSettings,
    reorderStations
  }
}
