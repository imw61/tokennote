import { useCallback, useMemo } from 'react'
import type { MainPanelsProps } from '../component-props'
import { openExternalUrl } from '../../lib/safe-external-url'
import type { AppData, BalanceSnapshot, PersistenceNotice } from '../types'
import type { useConfigTransfer } from './useConfigTransfer'
import type { useMainViewState } from './useMainViewState'
import type { useStationActions } from './useStationActions'
import type { useStationForm } from './useStationForm'
import type { useStationReviews } from './useStationReviews'
import type { useUpdateManager } from './useUpdateManager'

type UpdateState = ReturnType<typeof useUpdateManager>
type ViewState = ReturnType<typeof useMainViewState>
type StationActionsState = ReturnType<typeof useStationActions>
type StationFormState = ReturnType<typeof useStationForm>
type ConfigTransferState = ReturnType<typeof useConfigTransfer>
type StationReviewsState = ReturnType<typeof useStationReviews>

type UsePanelPropsOptions = {
  data: AppData
  persistenceNotice: PersistenceNotice | null
  snapshots: Record<string, BalanceSnapshot>
  initialLoaded: boolean
  view: ViewState
  update: UpdateState
  stationActions: StationActionsState
  stationForm: StationFormState
  configTransfer: ConfigTransferState
  stationReviews: StationReviewsState
}

export function usePanelProps({
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
}: UsePanelPropsOptions): MainPanelsProps {
  const onRestoreUpdateReminder = useCallback(() => {
    void update.restoreUpdateReminder()
  }, [update.restoreUpdateReminder])

  const onCheckUpdate = useCallback(() => {
    void update.runUpdateCheck(false)
  }, [update.runUpdateCheck])

  const onImportConfig = useCallback(() => {
    void configTransfer.importConfig()
  }, [configTransfer.importConfig])

  const onExportConfig = useCallback(() => {
    void configTransfer.exportConfig()
  }, [configTransfer.exportConfig])

  // 二维码导出（电脑端）：把当前配置加密后切成多张二维码循环展示
  const onExportConfigQr = useCallback(() => {
    void configTransfer.exportConfigQr()
  }, [configTransfer.exportConfigQr])

  // 二维码导入（手机端）：开启相机扫描电脑端展示的二维码
  const onImportConfigQr = useCallback(() => {
    void configTransfer.importConfigQr()
  }, [configTransfer.importConfigQr])

  const onRefreshStation = useCallback((id: string) => {
    void stationActions.refreshOne(id)
  }, [stationActions.refreshOne])

  const onOpenConsole = useCallback((id: string) => {
    void stationActions.openStationConsole(id)
  }, [stationActions.openStationConsole])

  const onDeleteStation = useCallback((id: string) => {
    void stationActions.removeStation(id)
  }, [stationActions.removeStation])

  const onOpenStationReview = useCallback((station: AppData['stations'][number]) => {
    view.openStationReviews(station.id)
  }, [view])

  const onOpenPrimaryUpdateLink = useCallback(() => {
    openExternalUrl(update.primaryUpdateLink, { allowHttpLoopback: true }).catch(console.error)
  }, [update.primaryUpdateLink])

  const onOpenFallbackUpdateLink = useCallback(() => {
    if (!update.fallbackUpdateLink) return
    openExternalUrl(update.fallbackUpdateLink, { allowHttpLoopback: true }).catch(console.error)
  }, [update.fallbackUpdateLink])

  return useMemo(() => ({
    showSettings: view.showSettings,
    showReviews: view.showReviews,
    stations: data.stations,
    selectedStation: view.selectedStation,
    selectedSnapshot: view.selectedSnapshot,
    selectedBalanceHistory: view.selectedBalanceHistory,
    settings: data.settings,
    snapshots,
    totals: stationActions.totals,
    loading: stationActions.loading,
    initialLoaded,
    updateCurrentVersionText: `v${update.updateInfo?.currentVersion ?? '读取中'}`,
    updateStatusText: update.updateStatusText,
    primaryUpdateLink: update.primaryUpdateLink,
    updateStatus: update.updateInfo?.status,
    isLatestVersionIgnored: update.isLatestVersionIgnored,
    checkingUpdates: update.checkingUpdates,
    importingConfig: configTransfer.importingConfig,
    exportingConfig: configTransfer.exportingConfig,
    configTransferDialog: configTransfer.configTransferDialog,
    stationCount: data.stations.length,
    transparencyPercent: view.transparencyPercent,
    transparencyFill: view.transparencyFill,
    reviewSubmitting: stationReviews.submitting,
    reviewSubmitError: stationReviews.submitError,
    reviewDraft: stationReviews.draft,
    reviewHasSubmitted: stationReviews.hasSubmitted,
    reviewLocalRecord: stationReviews.localReview,
    persistenceNotice,
    openingConsoleId: stationActions.openingConsoleId,
    onChangeSettings: stationActions.saveSettings,
    onRestoreUpdateReminder,
    onCheckUpdate,
    onImportConfig,
    onExportConfig,
    onExportConfigQr,
    onImportConfigQr,
    onConfigTransferDialogChange: configTransfer.onConfigTransferDialogChange,
    onConfigTransferDialogConfirm: configTransfer.onConfigTransferDialogConfirm,
    onConfigTransferDialogCancel: configTransfer.onConfigTransferDialogCancel,
    onBackToOverview: view.resetSelection,
    onRefreshStation,
    onOpenConsole,
    onEditStation: stationForm.editStation,
    onDeleteStation,
    onOpenStationReview,
    onAddStation: stationForm.addStation,
    onOpenStation: view.openStation,
    onReorderStations: stationActions.reorderStations,
    onRefreshAll: stationActions.refreshAll,
    onOpenPrimaryUpdateLink,
    onOpenFallbackUpdateLink: update.fallbackUpdateLink ? onOpenFallbackUpdateLink : undefined,
    onReviewDraftChange: stationReviews.setDraft,
    onSubmitReview: () => {
      void stationReviews.submitReview().then(success => {
        if (success) {
          view.backFromReviews()
        }
      })
    },
    onBackFromReviews: view.backFromReviews
  }), [
    configTransfer.exportConfig,
    configTransfer.exportConfigQr,
    configTransfer.exportingConfig,
    configTransfer.configTransferDialog,
    configTransfer.importConfig,
    configTransfer.importConfigQr,
    configTransfer.importingConfig,
    configTransfer.onConfigTransferDialogCancel,
    configTransfer.onConfigTransferDialogChange,
    configTransfer.onConfigTransferDialogConfirm,
    data.settings,
    data.stations,
    persistenceNotice,
    initialLoaded,
    onCheckUpdate,
    onDeleteStation,
    onExportConfig,
    onExportConfigQr,
    onImportConfig,
    onImportConfigQr,
    onOpenConsole,
    onOpenFallbackUpdateLink,
    onOpenPrimaryUpdateLink,
    onOpenStationReview,
    onRefreshStation,
    onRestoreUpdateReminder,
    snapshots,
    stationReviews.draft,
    stationReviews.hasSubmitted,
    stationReviews.localReview,
    stationReviews.setDraft,
    stationReviews.submitError,
    stationReviews.submitReview,
    stationReviews.submitting,
    stationActions.loading,
    stationActions.openingConsoleId,
    stationActions.refreshAll,
    stationActions.reorderStations,
    stationActions.saveSettings,
    stationActions.totals,
    stationForm.addStation,
    stationForm.editStation,
    update.checkingUpdates,
    update.fallbackUpdateLink,
    update.isLatestVersionIgnored,
    update.primaryUpdateLink,
    update.updateInfo,
    update.updateStatusText,
    view.openStation,
    view.openStationReviews,
    view.backFromReviews,
    view.resetSelection,
    view.showReviews,
    view.selectedBalanceHistory,
    view.selectedSnapshot,
    view.selectedStation,
    view.showSettings,
    view.transparencyFill,
    view.transparencyPercent
  ])
}
