import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { appendBalanceHistory, type BalanceHistoryPoint } from '../../lib/balance-history'
import type { AppData, AppSettings, BalanceSnapshot, PersistenceNotice } from '../types'
import { emptyData } from '../utils'

export function useAppData() {
  const [data, setData] = useState<AppData>(emptyData)
  const [persistenceNotice, setPersistenceNotice] = useState<PersistenceNotice | null>(null)

  useEffect(() => {
    const refreshAppData = () => Promise.all([
      invoke<AppData>('get_app_data'),
      invoke<PersistenceNotice | null>('get_persistence_notice')
    ]).then(([nextData, nextNotice]) => {
      setData(nextData)
      setPersistenceNotice(nextNotice)
    }).catch(console.error)

    refreshAppData()

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
    const unlistenStations = listen('stations-changed', () => { refreshAppData() })
    const unlistenSettings = listen<AppSettings>('settings-updated', () => { refreshAppData() })

    return () => {
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
    persistenceNotice
  }
}
