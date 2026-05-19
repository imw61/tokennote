import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { Activity, ChevronDown, ChevronUp, ExternalLink, WalletCards } from 'lucide-react'
import { BalanceOdometer } from './components/BalanceOdometer'
import { checkForUpdates } from './lib/update'
import { applyPlatformMotionPreference } from './lib/platform-motion'
import {
  buildUpdatePopupPayload,
  getIgnoredUpdateVersion,
  hideUpdatePopup,
  persistIgnoredUpdateVersion,
  showUpdatePopup
} from './lib/update-popup'
import './styles.css'

applyPlatformMotionPreference()

type Station = {
  id: string
  name: string
  baseUrl: string
  cookie: string
  newApiUser: string
  stationType: string
  enabled: boolean
  refreshIntervalSec: number
  lowBalanceThreshold: number
  changeThreshold: number
  createdAt: number
  updatedAt: number
}

type AppSettings = {
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

type ModelUsageSummary = {
  modelName: string
  tokenUsed: number
  count: number
  quota: number
  quotaUsd: number
  ratio: number
  lastUsedAt: number
}

type BalanceSnapshot = {
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
  quotaPerUnit: number
  currency: string
  models: ModelUsageSummary[]
  fetchedAt: number
  status: string
  errorMessage?: string
}

type BalanceHistoryPoint = {
  stationId: string
  currency: string
  balance: number
  fetchedAt: number
}

type AppData = {
  stations: Station[]
  settings: AppSettings
  snapshots: BalanceSnapshot[]
  balanceHistory: BalanceHistoryPoint[]
}

type WidgetVisualStyles = {
  shellBackground: string
  cardBackground: string
  cardBorder: string
  panelBackground: string
  panelBorder: string
  dividerBorder: string
}

const formatInt = (value: number) => Math.round(value).toLocaleString('en-US')
const capsuleStationLimit = 4
const expandedStationLimit = 6
const capsuleSize = { width: 148, height: 88 }
const expandedWidth = 210
const expandedChromeHeight = 158
const expandedSummaryRowHeight = 17
const expandedSummaryRowGap = 2
const expandedSummaryPanelExtraHeight = 31
const widgetSnapDelayMs = 300
const widgetAutoHideDelayMs = 520
const widgetProgrammaticMoveBufferMs = 520
const normCurrency = (raw?: string) => {
  if (!raw) return '$'
  const s = raw.trim()
  if (!s || s === '¤') return '$'
  if (s === 'USD') return '$'
  if (s === 'CNY' || s === 'RMB') return '¥'
  if (s === 'EUR') return '€'
  return s
}

const abbrName = (name: string, max = 5) => name.length <= max ? name : name.slice(0, max) + '..'
const currencySortRank = (symbol: string) => {
  if (symbol === '¥') return 0
  if (symbol === '$') return 1
  if (symbol === '€') return 2
  return 9
}
const buildWidgetVisualStyles = (opacity: number): WidgetVisualStyles => {
  const alpha = Math.max(0, Math.min(1, opacity))
  return {
    shellBackground: `rgba(255,255,255,${alpha})`,
    cardBackground: 'transparent',
    cardBorder: 'transparent',
    panelBackground: 'transparent',
    panelBorder: 'transparent',
    dividerBorder: `rgba(255,255,255,${Math.min(0.18, alpha * 0.2)})`
  }
}

function Widget() {
  const appWindow = getCurrentWindow()
  const [data, setData] = useState<AppData | null>(null)
  const [widgetOpacity, setWidgetOpacity] = useState(0.88)
  const [widgetAutoHideEnabled, setWidgetAutoHideEnabled] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const visualStyles = useMemo(() => buildWidgetVisualStyles(widgetOpacity), [widgetOpacity])
  const autoHiddenRef = useRef(false)
  const hideTimerRef = useRef<number | null>(null)
  const suppressMovedUntilRef = useRef(0)

  const syncAutoHiddenState = (hidden: boolean) => {
    autoHiddenRef.current = hidden
  }

  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  const moveWidgetToEdge = async (autoHide: boolean) => {
    suppressMovedUntilRef.current = Date.now() + widgetProgrammaticMoveBufferMs
    const shouldAutoHide = widgetAutoHideEnabled && autoHide
    await invoke('snap_to_edge', { autoHide: shouldAutoHide })
    syncAutoHiddenState(shouldAutoHide)
  }

  const revealWidget = () => {
    clearHideTimer()
    if (!autoHiddenRef.current) return
    moveWidgetToEdge(false).catch(() => {})
  }

  const handleHoverReveal = () => {
    revealWidget()
  }

  const scheduleAutoHide = () => {
    if (!widgetAutoHideEnabled) return
    clearHideTimer()
    hideTimerRef.current = window.setTimeout(() => {
      moveWidgetToEdge(true).catch(() => {})
    }, widgetAutoHideDelayMs)
  }

  const runUpdateCheck = async () => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 8000)
    try {
      const result = await checkForUpdates(controller.signal)
      if (result.status === 'none' || result.status === 'required') {
        persistIgnoredUpdateVersion(null)
      }
      const payload = buildUpdatePopupPayload(result)
      if (!payload) {
        await hideUpdatePopup().catch(console.error)
        return
      }
      if (payload.mode === 'available' && getIgnoredUpdateVersion() === payload.latestVersion) {
        await hideUpdatePopup().catch(console.error)
        return
      }
      await showUpdatePopup(payload).catch(console.error)
    } finally {
      window.clearTimeout(timer)
    }
  }

  useEffect(() => {
    document.documentElement.classList.add('widget-page')
    document.body.classList.add('widget-page')
    return () => {
      document.documentElement.classList.remove('widget-page')
      document.body.classList.remove('widget-page')
    }
  }, [])

  useEffect(() => {
    const refresh = () => {
      invoke<AppData>('get_app_data').then(d => {
        setData(d)
        setWidgetOpacity(d.settings.opacity)
        setWidgetAutoHideEnabled(d.settings.widgetAutoHideEnabled)
      }).catch(console.error)
    }
    refresh()
    void runUpdateCheck()

    const unlistenSnap = listen<BalanceSnapshot>('snapshot-updated', () => refresh())
    const unlistenStations = listen('stations-changed', () => refresh())
    const unlistenSettings = listen<AppSettings>('settings-updated', event => {
      setWidgetOpacity(event.payload.opacity)
      setWidgetAutoHideEnabled(event.payload.widgetAutoHideEnabled)
    })

    return () => {
      unlistenSnap.then(dispose => dispose())
      unlistenStations.then(dispose => dispose())
      unlistenSettings.then(dispose => dispose())
    }
  }, [])

  const { currencyGroups, stationSummaries, requests, failed, pending, low } = useMemo(() => {
    if (!data) return {
      currencyGroups: [] as { symbol: string; balance: number; stations: { id: string; name: string; balance: number; status: string; low: boolean }[] }[],
      stationSummaries: [] as { id: string; name: string; balance: number; symbol: string; status: string; low: boolean }[],
      requests: 0,
      failed: 0,
      pending: 0,
      low: 0
    }
    const snapshotMap = new Map(data.snapshots.map(snapshot => [snapshot.stationId, snapshot]))
    const groupMap = new Map<string, { balance: number; stations: { id: string; name: string; balance: number; status: string; low: boolean }[] }>()
    const stationSummaries: { id: string; name: string; balance: number; symbol: string; status: string; low: boolean }[] = []
    let reqSum = 0
    let failCount = 0
    let pendCount = 0
    let lowCount = 0
    for (const station of data.stations) {
      const snapshot = snapshotMap.get(station.id)
      const st = snapshot?.status === 'success' ? 'ok' : snapshot ? 'failed' : 'pending'
      const symbol = normCurrency(snapshot?.currency)
      const balance = st === 'ok' ? snapshot!.currentBalance : 0
      const low = st === 'ok' && balance <= station.lowBalanceThreshold
      if (st === 'pending') { pendCount++; }
      if (st === 'failed') { failCount++; }
      if (low) { lowCount++; }
      stationSummaries.push({ id: station.id, name: station.name, balance, symbol, status: st, low })
      if (st === 'ok') {
        reqSum += snapshot!.requestCount
        const group = groupMap.get(symbol) || { balance: 0, stations: [] }
        group.balance += balance
        group.stations.push({ id: station.id, name: station.name, balance, status: st, low })
        groupMap.set(symbol, group)
      } else {
        const group = groupMap.get(symbol) || { balance: 0, stations: [] }
        group.stations.push({ id: station.id, name: station.name, balance: 0, status: st, low: false })
        groupMap.set(symbol, group)
      }
    }
    const groups = Array.from(groupMap.entries())
      .map(([symbol, g]) => ({ symbol, balance: g.balance, stations: g.stations }))
      .sort((a, b) => {
        const rankDiff = currencySortRank(a.symbol) - currencySortRank(b.symbol)
        if (rankDiff !== 0) return rankDiff
        return a.symbol.localeCompare(b.symbol)
      })
    return { currencyGroups: groups, stationSummaries, requests: reqSum, failed: failCount, pending: pendCount, low: lowCount }
  }, [data])
  const capsuleStations = useMemo(
    () => Array.from({ length: capsuleStationLimit }, (_, index) => stationSummaries[index] ?? null),
    [stationSummaries]
  )
  const expandedVisibleCount = Math.min(stationSummaries.length, expandedStationLimit)
  const expandedRows = Math.max(1, Math.ceil(expandedVisibleCount / 2))
  const expandedSummaryBodyHeight = expandedRows * expandedSummaryRowHeight + Math.max(0, expandedRows - 1) * expandedSummaryRowGap
  const expandedSummaryPanelHeight = expandedSummaryBodyHeight + expandedSummaryPanelExtraHeight
  const expandedHeight = expandedChromeHeight + expandedSummaryBodyHeight

  useEffect(() => {
    return () => {
      clearHideTimer()
    }
  }, [])

  useEffect(() => {
    if (widgetAutoHideEnabled || !autoHiddenRef.current) return
    revealWidget()
  }, [widgetAutoHideEnabled])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unlistenPromise = appWindow.onMoved(() => {
      if (Date.now() < suppressMovedUntilRef.current) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        moveWidgetToEdge(widgetAutoHideEnabled).catch(() => {})
      }, widgetSnapDelayMs)
    })
    return () => {
      unlistenPromise.then(fn => fn())
      if (timer) clearTimeout(timer)
      clearHideTimer()
    }
  }, [appWindow, widgetAutoHideEnabled])

  useEffect(() => {
    const nextSize = isExpanded
      ? { width: expandedWidth, height: expandedHeight }
      : capsuleSize
    const syncWindowSize = async () => {
      try {
        const size = new LogicalSize(nextSize.width, nextSize.height)
        await appWindow.setMinSize(size)
        await appWindow.setMaxSize(size)
        await appWindow.setSize(size)
        await moveWidgetToEdge(widgetAutoHideEnabled && autoHiddenRef.current)
      } catch (error) {
        console.error(error)
      }
    }
    syncWindowSize()
  }, [appWindow, expandedHeight, isExpanded, widgetAutoHideEnabled])

  const dragWidget = (event: React.MouseEvent) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('button')) return
    clearHideTimer()
    if (autoHiddenRef.current) {
      revealWidget()
    }
    appWindow.startDragging().catch(() => {})
  }

  const toggleWidgetMode = () => {
    setIsExpanded(current => !current)
  }

  const handleWidgetDoubleClick = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('button')) return
    toggleWidgetMode()
  }

  const openMainWindow = () => {
    invoke('show_main_window').catch(console.error)
  }

  return (
    <main
      className="widget-shell h-full w-full overflow-hidden box-border widget-hover-scale"
      onMouseEnter={handleHoverReveal}
      onMouseMove={handleHoverReveal}
      onPointerMove={handleHoverReveal}
    >
      <div
        className="h-full w-full overflow-hidden flex flex-col rounded-[18px] animate-float-soft"
        style={{ background: visualStyles.shellBackground }}
        onMouseDown={dragWidget}
        onMouseEnter={handleHoverReveal}
        onMouseMove={handleHoverReveal}
        onPointerMove={handleHoverReveal}
        onMouseLeave={scheduleAutoHide}
        onDoubleClick={handleWidgetDoubleClick}
        data-tauri-drag-region
      >
        {isExpanded ? (
          <ExpandedWidget
            currencyGroups={currencyGroups}
            stationSummaries={stationSummaries}
            requests={requests}
            failed={failed}
            pending={pending}
            low={low}
            summaryPanelHeight={expandedSummaryPanelHeight}
            stationCount={data?.stations.length ?? 0}
            onOpenMainWindow={openMainWindow}
            onCollapse={toggleWidgetMode}
            visualStyles={visualStyles}
          />
        ) : (
          <CapsuleWidget
            stations={capsuleStations}
            stationCount={data?.stations.length ?? 0}
            onOpenMainWindow={openMainWindow}
            onExpand={toggleWidgetMode}
          />
        )}
      </div>
    </main>
  )
}

function CapsuleWidget({
  stations,
  stationCount,
  onOpenMainWindow,
  onExpand
}: {
  stations: ({ id: string; name: string; balance: number; symbol: string; status: string; low: boolean } | null)[]
  stationCount: number
  onOpenMainWindow: () => void
  onExpand: () => void
}) {
  return (
    <>
      <div className="flex items-center gap-1 px-1.5 pt-1 pb-0.5 flex-shrink-0 animate-fade-up">
        <WalletCards size={11} className="text-primary-500 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-extrabold text-gray-500 uppercase leading-none">TokenNote</div>
          <div className="mt-px text-[8px] font-bold text-gray-400 leading-none">{stationCount} 站</div>
        </div>
        <button
          className="flex items-center justify-center w-4.5 h-4.5 rounded-md text-gray-500 hover:text-primary-600 hover:bg-primary-50 transition-colors duration-150 interactive-bounce"
          onClick={onOpenMainWindow}
          title="打开主面板"
        >
          <ExternalLink size={10} />
        </button>
        <button
          className="flex items-center justify-center w-4.5 h-4.5 rounded-md text-gray-500 hover:text-primary-600 hover:bg-primary-50 transition-colors duration-150 interactive-bounce"
          onClick={onExpand}
          title="展开悬浮窗"
        >
          <ChevronDown size={10} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-0.5 px-1.5 pb-1 flex-1 content-start stagger-children">
        {stations.map((station, index) => (
          <div
            key={station?.id ?? `empty-${index}`}
            className="min-w-0 px-1 py-0.5 animate-pop-in"
          >
            {station ? (
              <>
                <div className="flex items-center gap-0.5">
                  <span className={`w-1 h-1 rounded-full flex-shrink-0 ${station.status === 'failed' ? 'bg-red-500' : station.low || station.status === 'pending' ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                  <span className="min-w-0 truncate text-[8px] font-extrabold text-gray-500 leading-none">
                    {abbrName(station.name, 4)}
                  </span>
                </div>
                <div className={`mt-0.5 text-[10px] font-black tracking-[-0.05em] leading-none truncate ${station.status === 'failed' ? 'text-red-500' : station.low || station.status === 'pending' ? 'text-amber-500' : 'text-gray-900'}`}>
                  {station.status === 'ok' ? <BalanceOdometer value={station.balance} symbol={station.symbol} /> : station.status === 'failed' ? '异常' : '--'}
                </div>
              </>
            ) : (
              <div className="h-[18px] flex flex-col justify-center">
                <span className="text-[8px] font-extrabold text-gray-300 leading-none">待添加</span>
                <span className="mt-0.5 text-[9px] font-black text-gray-300 leading-none">--</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

function ExpandedWidget({
  currencyGroups,
  stationSummaries,
  requests,
  failed,
  pending,
  low,
  summaryPanelHeight,
  stationCount,
  onOpenMainWindow,
  onCollapse,
  visualStyles
}: {
  currencyGroups: { symbol: string; balance: number; stations: { id: string; name: string; balance: number; status: string; low: boolean }[] }[]
  stationSummaries: { id: string; name: string; balance: number; symbol: string; status: string; low: boolean }[]
  requests: number
  failed: number
  pending: number
  low: number
  summaryPanelHeight: number
  stationCount: number
  onOpenMainWindow: () => void
  onCollapse: () => void
  visualStyles: WidgetVisualStyles
}) {
  return (
    <>
      <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1.5 flex-shrink-0 animate-fade-up">
        <WalletCards size={12} className="text-primary-500 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-extrabold text-gray-500 uppercase leading-none">TokenNote</div>
          <div className="mt-0.5 text-[9px] font-bold text-gray-400 leading-none">{stationCount} 个中转站</div>
        </div>
        <button
          className="flex items-center justify-center w-5 h-5 rounded-lg text-gray-400 hover:text-primary-500 hover:bg-primary-50 transition-colors duration-150 interactive-bounce"
          onClick={onOpenMainWindow}
          title="打开主面板"
        >
          <ExternalLink size={12} />
        </button>
        <button
          className="flex items-center justify-center w-5 h-5 rounded-lg text-gray-400 hover:text-primary-500 hover:bg-primary-50 transition-colors duration-150 interactive-bounce"
          onClick={onCollapse}
          title="收起为胶囊"
        >
          <ChevronUp size={12} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5 px-2.5 flex-shrink-0 stagger-children">
        {currencyGroups.length > 0 ? currencyGroups.slice(0, 2).map(group => (
          <div
            key={group.symbol}
            className="min-w-0 px-1 py-1 animate-pop-in"
          >
            <div className="text-[8px] font-extrabold text-gray-400 tracking-[0.1em] uppercase leading-none">{group.symbol === '¥' ? 'CNY' : group.symbol === '$' ? 'USD' : group.symbol}</div>
            <div className="mt-0.5 text-[23px] font-black text-gray-950 tracking-[-0.06em] leading-none truncate">
              <BalanceOdometer value={group.balance} symbol={group.symbol} />
            </div>
          </div>
        )) : (
          <div
            className="col-span-2 px-1 py-1 animate-pop-in"
          >
            <div className="text-[8px] font-extrabold text-gray-400 tracking-[0.1em] uppercase leading-none">余额</div>
            <div className="mt-0.5 text-[23px] font-black text-gray-950 tracking-[-0.06em] leading-none">
              <BalanceOdometer value={0} />
            </div>
          </div>
        )}
      </div>

      <div className="px-2.5 pt-1.5" style={{ height: summaryPanelHeight + 6 }}>
        <div
          className="h-full overflow-hidden flex flex-col animate-fade-up"
          style={{ background: visualStyles.panelBackground, borderColor: visualStyles.panelBorder }}
        >
          <div
            className="flex items-center justify-between px-2 py-1 flex-shrink-0"
            style={{ borderColor: visualStyles.dividerBorder }}
          >
            <span className="text-[9px] font-extrabold text-gray-500 tracking-[0.06em] uppercase">摘要</span>
            <span className="text-[9px] font-bold text-gray-400">{stationSummaries.length}</span>
          </div>
          <div className="overflow-hidden px-2 py-1 grid grid-cols-2 gap-x-1 gap-y-0.5 auto-rows-[17px] content-start stagger-children">
            {stationSummaries.length > 0 ? stationSummaries.slice(0, expandedStationLimit).map(st => (
              <div key={st.id} className="flex items-center gap-0.5 min-w-0 animate-fade-up">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.status === 'failed' ? 'bg-red-500' : st.low || st.status === 'pending' ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                <span className="min-w-0 truncate text-[10px] font-bold text-gray-600 leading-none">{abbrName(st.name, 6)}</span>
                <span className={`text-[9px] font-black tracking-[-0.04em] leading-none flex-shrink-0 ${st.status === 'failed' ? 'text-red-400' : st.low || st.status === 'pending' ? 'text-amber-500' : 'text-gray-700'}`}>
                  {st.status === 'ok' ? <BalanceOdometer value={st.balance} symbol={st.symbol} /> : st.status === 'failed' ? '!' : '·'}
                </span>
              </div>
            )) : (
              <div className="col-span-2 h-full flex items-center justify-center text-[10px] font-bold text-gray-400">暂无站点</div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-2.5 py-1.5 flex-shrink-0 overflow-hidden animate-fade-up">
        <div className="flex items-center gap-1 min-w-0">
          <Activity size={10} className="text-gray-400 flex-shrink-0" />
          <span className="text-[10px] font-bold text-gray-500 truncate">{formatInt(requests)}</span>
        </div>
        {failed > 0 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="w-1 h-1 rounded-full bg-red-500" />
            <span className="text-[10px] font-bold text-red-500">{failed}</span>
          </div>
        )}
        {low > 0 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="w-1 h-1 rounded-full bg-amber-400" />
            <span className="text-[10px] font-bold text-amber-500">{low}</span>
          </div>
        )}
        {pending > 0 && failed === 0 && low === 0 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] font-bold text-amber-500">同步中</span>
          </div>
        )}
      </div>
    </>
  )
}

createRoot(document.getElementById('widget-root')!).render(<Widget />)
