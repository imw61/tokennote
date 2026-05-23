import { useCallback, useEffect, useState, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { isAndroid } from '../../lib/platform'
import {
  pushAndroidLowBalanceNotification,
  setAndroidBackgroundRefresh,
  updateAndroidPersistentNotification,
  updateAndroidWidgets,
  type AndroidWidgetPayload,
  type AndroidWidgetStation,
  type AndroidWidgetStatus
} from '../../lib/android-bridge'
import type { LowBalanceAlertPayload } from '../../lib/low-balance-alert'
import { useAppData } from './useAppData'
import { useAndroidBackGesture } from './useAndroidBackGesture'
import { useConfigTransfer } from './useConfigTransfer'
import { useFormLayerProps } from './useFormLayerProps'
import { useHeaderProps } from './useHeaderProps'
import { useMainViewState } from './useMainViewState'
import { usePanelProps } from './usePanelProps'
import { normCurrency } from '../utils'
import { useStationActions } from './useStationActions'
import { useStationForm } from './useStationForm'
import { useStationReviews } from './useStationReviews'
import { useUpdateManager } from './useUpdateManager'

export function useAppShell() {
  const { data, setData, snapshots, persistenceNotice, initialLoaded, suppressStationsChangedRefresh } = useAppData()
  const update = useUpdateManager()

  useEffect(() => {
    void update.runUpdateCheck(true)
  }, [update.runUpdateCheck])

  const view = useMainViewState({
    data,
    snapshots
  })

  const stationActions = useStationActions({
    data,
    setData,
    snapshots,
    onStationRemoved: view.resetSelection,
    suppressStationsChangedRefresh
  })

  const stationForm = useStationForm({
    setData,
    onRefreshStation: stationActions.refreshOne
  })

  const configTransfer = useConfigTransfer({
    data,
    setData,
    onRefreshAll: stationActions.refreshAll,
    resetViewState: () => {
      view.closeOverlays()
      stationForm.resetFormView()
    }
  })

  const stationReviews = useStationReviews({
    station: view.selectedStation,
    localStationReviews: data.localStationReviews,
    onLocalReviewSaved: setData
  })

  const onToggleSettingsView = useCallback(() => {
    view.setSelectedId(null)
    view.setActivePanel(current => current === 'settings' ? 'overview' : 'settings')
  }, [view.setActivePanel, view.setSelectedId])

  const headerProps = useHeaderProps({
    title: view.title,
    showSettings: view.showSettings,
    data,
    loading: stationActions.loading,
    onSaveSettings: stationActions.saveSettings,
    onRefreshAll: stationActions.refreshAll,
    onToggleSettingsView
  })

  const panelProps = usePanelProps({
    data,
    persistenceNotice,
    snapshots,
    initialLoaded,
    view,
    update,
    stationActions,
    stationForm,
    configTransfer,
    stationReviews
  })

  const formLayerProps = useFormLayerProps({
    stationForm
  })

  // Android 系统返回手势统一拦截：按层级"出栈"，最底层（Overview 且无叠层）才放行系统返回。
  // 在 isAndroid()=false 的桌面/Windows 端为 no-op，无副作用。
  useAndroidBackGesture(() => {
    // 1) 二维码导出对话框（电脑端用，安卓正常不会出现，但保留兜底）
    if (configTransfer.qrExportPlan) {
      configTransfer.closeQrExport()
      return true
    }
    // 2) 二维码扫码导入对话框（手机端的核心叠层）
    if (configTransfer.qrImportOpen) {
      configTransfer.closeQrImport()
      return true
    }
    // 3) 配置导入 / 导出确认 / 输入密钥对话框
    if (configTransfer.configTransferDialog) {
      configTransfer.onConfigTransferDialogCancel()
      return true
    }
    // 4) 添加 / 编辑站点表单 overlay
    if (stationForm.showForm) {
      stationForm.resetFormView()
      return true
    }
    // 5) 评测页 → 退回上一级
    if (view.showReviews) {
      view.backFromReviews()
      return true
    }
    // 6) 设置页 → 退回 Overview
    if (view.showSettings) {
      view.setActivePanel('overview')
      view.setSelectedId(null)
      return true
    }
    // 7) 站点详情页 → 退回 Overview
    if (view.selectedStation) {
      view.resetSelection()
      return true
    }
    // 已经是 Overview 且无叠层：放行，让系统返回真正生效（回到桌面）。
    return false
  })

  // 入场动画重放：从悬浮窗、托盘等位置再次唤起主窗口时，重新播放主页面入场动画。
  // 后端 `show_main_window_internal` 在显示主窗口后会向本窗口 emit `main-window-shown`，
  // 这里通过递增 key 触发 React 对动画容器的重挂载来重放动画。
  const [entranceKey, setEntranceKey] = useState(0)
  useEffect(() => {
    const unlistenPromise = listen('main-window-shown', () => {
      setEntranceKey(value => value + 1)
    })
    return () => {
      void unlistenPromise.then(unlisten => unlisten()).catch(() => {})
    }
  }, [])

  // Android 后台刷新开关：跟随 settings 同步前台 Service 启停。
  const previousBackgroundEnabledRef = useRef<boolean | null>(null)
  useEffect(() => {
    if (!isAndroid()) return
    const enabled = data.settings.androidBackgroundRefreshEnabled !== false
    if (previousBackgroundEnabledRef.current === enabled) return
    previousBackgroundEnabledRef.current = enabled
    void setAndroidBackgroundRefresh(enabled)
  }, [data.settings.androidBackgroundRefreshEnabled])

  // Android 常驻通知：每次 snapshots / 站点列表更新时，把"前 N 个站点 + 余额"投递到通知。
  useEffect(() => {
    if (!isAndroid()) return
    const enabled = data.settings.androidBackgroundRefreshEnabled !== false
    if (!enabled) return

    const stations = data.stations.filter(item => item.enabled)
    const total = stations.length
    if (total === 0) {
      void updateAndroidPersistentNotification('TokenNote', '尚未添加任何站点')
      return
    }
    const summaries = stations.slice(0, 4).map(station => {
      const snapshot = snapshots[station.id]
      const balance = snapshot ? snapshot.currentBalance : null
      // 通知栏摘要里的币种符号统一走 normCurrency,与小组件、主界面保持一致。
      const symbol = normCurrency(snapshot?.currency)
      const displayBalance = balance !== null && Number.isFinite(balance)
        ? `${symbol}${balance.toFixed(2)}`
        : '--'
      return `${station.name || '未命名'}: ${displayBalance}`
    })
    const ellipsis = total > summaries.length ? ' ...' : ''
    const summaryText = `${summaries.join('  ')}${ellipsis}`
    void updateAndroidPersistentNotification(
      `TokenNote 正在监控（${total} 个站点）`,
      summaryText
    )
  }, [data.settings.androidBackgroundRefreshEnabled, data.stations, snapshots])

  // Android 桌面小组件：和常驻通知共用一份数据源，把当前快照推送给 WidgetBridge。
  useEffect(() => {
    if (!isAndroid()) return

    const stations = data.stations.filter(item => item.enabled)
    const total = stations.length

    const widgetStations: AndroidWidgetStation[] = stations.slice(0, 6).map(station => {
      const snapshot = snapshots[station.id]
      const balance = snapshot && Number.isFinite(snapshot.currentBalance)
        ? snapshot.currentBalance
        : null
      const status: AndroidWidgetStatus = (() => {
        if (!snapshot) return 'pending'
        if (snapshot.status === 'error') return 'error'
        if (balance !== null && balance < station.lowBalanceThreshold) return 'low'
        if (snapshot.status === 'ok') return 'ok'
        return 'pending'
      })()
      return {
        id: station.id,
        name: station.name || '未命名',
        // 走 normCurrency 归一,把 'USD' / '' 统一成 '$',把 'CNY' / 'RMB' 统一成 '¥'。
        // 否则同一币种因为后端 provider 填法不同(字母 vs 符号),会在小组件上变成
        // 多行不同符号但金额拆开的"伪多币"。
        currencySymbol: normCurrency(snapshot?.currency),
        balance,
        status
      }
    })

    const totalsMap = new Map<string, number>()
    for (const station of stations) {
      const snapshot = snapshots[station.id]
      if (!snapshot) continue
      if (!Number.isFinite(snapshot.currentBalance)) continue
      // 同 normCurrency 归一,避免 'USD' 与 '$'、'CNY' 与 '¥' 被拆成两个聚合桶。
      const symbol = normCurrency(snapshot.currency)
      totalsMap.set(symbol, (totalsMap.get(symbol) ?? 0) + snapshot.currentBalance)
    }
    const currencyTotals = Array.from(totalsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([currencySymbol, totalBalance]) => ({ currencySymbol, totalBalance }))

    let totalRequests = 0
    let errorCount = 0
    let lowBalanceCount = 0
    for (const station of stations) {
      const snapshot = snapshots[station.id]
      if (!snapshot) continue
      totalRequests += snapshot.todayRequestCount || 0
      if (snapshot.status === 'error') errorCount += 1
      if (Number.isFinite(snapshot.currentBalance) && snapshot.currentBalance < station.lowBalanceThreshold) {
        lowBalanceCount += 1
      }
    }

    const lastUpdatedTs = stations.reduce((max, station) => {
      const snapshot = snapshots[station.id]
      if (!snapshot || !snapshot.fetchedAt) return max
      return Math.max(max, snapshot.fetchedAt)
    }, 0)
    const lastUpdatedLabel = lastUpdatedTs > 0
      ? new Date(lastUpdatedTs * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      : ''

    const payload: AndroidWidgetPayload = {
      stations: widgetStations,
      currencyTotals,
      summary: {
        totalStations: total,
        totalRequests,
        errorCount,
        lowBalanceCount
      },
      lastUpdatedLabel
    }
    void updateAndroidWidgets(payload)
  }, [data.stations, snapshots])

  // Android 低余额通知：监听后端 emit 出来的 alert payload，转发到系统通知。
  useEffect(() => {
    if (!isAndroid()) return
    const unlistenPromise = listen<LowBalanceAlertPayload>('low-balance-alert-data', event => {
      const payload = event.payload
      const visible = payload.items.slice(0, 3)
      const lines = visible.map(item => {
        // 低余额通知里的币种同样归一,避免一个站显示 USD 一个站显示 $。
        const symbol = normCurrency(item.currency)
        return `${item.stationName || '未命名'}: ${symbol}${item.currentBalance.toFixed(2)}`
      })
      const more = payload.totalCount > visible.length
        ? `（还有 ${payload.totalCount - visible.length} 个）`
        : ''
      void pushAndroidLowBalanceNotification(
        `${payload.totalCount} 个站点余额不足`,
        `${lines.join('；')}${more}`
      )
    })
    return () => {
      void unlistenPromise.then(unlisten => unlisten()).catch(() => {})
    }
  }, [])

  return {
    entranceKey,
    contentKey: view.contentKey,
    contentAnimationClass: view.contentAnimationClass,
    headerProps,
    panelProps,
    formLayerProps,
    // 二维码迁移相关：在 App.tsx 顶层叠层渲染对应对话框
    qrExportPlan: configTransfer.qrExportPlan,
    qrImportOpen: configTransfer.qrImportOpen,
    onCloseQrExport: configTransfer.closeQrExport,
    onCloseQrImport: configTransfer.closeQrImport,
    onQrPayloadAssembled: configTransfer.onQrPayloadAssembled
  }
}
