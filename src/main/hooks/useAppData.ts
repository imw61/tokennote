import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { appendBalanceHistory, type BalanceHistoryPoint } from '../../lib/balance-history'
import type { AppData, AppSettings, BalanceSnapshot, PersistenceNotice } from '../types'
import { emptyData } from '../utils'

export function useAppData() {
  const [data, setData] = useState<AppData>(emptyData)
  const [persistenceNotice, setPersistenceNotice] = useState<PersistenceNotice | null>(null)
  // 首次拿到 `get_app_data` 返回值之前保持 false。安卓 WebView 冷启动 + Tauri IPC
  // 第一次往返较慢（桌面端通常无感知），如果不区分"加载未完成"和"真的没有站点"，
  // Overview 会立刻按 `stations.length === 0` 渲染"还没有监控站点"，让用户误以为
  // 配置丢失。下游靠这个标记把空态守在数据真正回来之后。
  const [initialLoaded, setInitialLoaded] = useState(false)

  // 在拖拽排序刚完成的一小段时间窗口内,忽略后端 `stations-changed` 事件触发的
  // 全量重拉。原因:reorder 命令本身已经把最新 AppData 直接通过 invoke 返回给前端,
  // 前端也已经做了乐观换序;后端再 emit 一次 stations-changed 是给"其它 webview 实例"
  // 用的(这里只有一个),冗余的 refreshAppData 在边缘时序下会让 stations 数组引用
  // 短暂跳变,引起卡片视觉上的"先回原位、再换到新位置"抖动。
  const suppressStationsChangedUntilRef = useRef<number>(0)
  const suppressStationsChangedRefresh = useCallback((durationMs: number = 800) => {
    suppressStationsChangedUntilRef.current = Date.now() + durationMs
  }, [])

  useEffect(() => {
    let cancelled = false
    let retryTimer: number | null = null

    const refreshAppData = (): Promise<void> => Promise.all([
      invoke<AppData>('get_app_data'),
      invoke<PersistenceNotice | null>('get_persistence_notice')
    ]).then(([nextData, nextNotice]) => {
      if (cancelled) return
      setData(nextData)
      setPersistenceNotice(nextNotice)
      setInitialLoaded(true)
    }).catch(error => {
      // 安卓端 setup 与 webview 创建并发，极少数情况下首个 IPC 早于 `app.manage`
      // 完成，会被 Tauri 以 "state not managed" 直接 reject。这里做一次延时重试，
      // 让用户不必依赖手动刷新就能看到真实数据。
      console.error('[useAppData] get_app_data failed, will retry:', error)
      if (cancelled) return
      retryTimer = window.setTimeout(() => {
        retryTimer = null
        void refreshAppData()
      }, 400)
    })

    void refreshAppData()

    const unlistenSnapshot = listen<BalanceSnapshot>('snapshot-updated', event => {
      setData(current => ({
        ...current,
        snapshots: [...current.snapshots.filter(item => item.stationId !== event.payload.stationId), event.payload]
      }))
    })
    const unlistenHistory = listen<BalanceHistoryPoint>('balance-history-updated', event => {
      setData(current => ({
        ...current,
        balanceHistory: appendBalanceHistory(current.balanceHistory, event.payload)
      }))
    })
    const unlistenStations = listen('stations-changed', () => {
      // 拖拽排序窗口期内忽略,避免冗余重拉触发的视觉抖动。详见 ref 定义处的注释。
      if (Date.now() < suppressStationsChangedUntilRef.current) return
      refreshAppData()
    })
    const unlistenSettings = listen<AppSettings>('settings-updated', () => { refreshAppData() })

    return () => {
      cancelled = true
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
        retryTimer = null
      }
      unlistenSnapshot.then(dispose => dispose())
      unlistenHistory.then(dispose => dispose())
      unlistenStations.then(dispose => dispose())
      unlistenSettings.then(dispose => dispose())
    }
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--panel-alpha', String(data.settings.opacity))
  }, [data.settings.opacity])

  const snapshots = useMemo(() => (
    Object.fromEntries(data.snapshots.map(snapshot => [snapshot.stationId, snapshot]))
  ), [data.snapshots])

  return {
    data,
    setData,
    snapshots,
    persistenceNotice,
    initialLoaded,
    suppressStationsChangedRefresh
  }
}
