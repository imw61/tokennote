import { OverviewPanel } from './panels/OverviewPanel'
import { ReviewsPanel } from './panels/ReviewsPanel'
import { SettingsPanel } from './panels/SettingsPanel'
import { StationDetailPanel } from './panels/StationDetailPanel'
import type { MainPanelsProps } from '../component-props'

export function MainPanels({
  showSettings,
  showReviews,
  stations,
  selectedStation,
  selectedSnapshot,
  selectedBalanceHistory,
  settings,
  snapshots,
  totals,
  loading,
  updateCurrentVersionText,
  updateStatusText,
  primaryUpdateLink,
  updateStatus,
  isLatestVersionIgnored,
  checkingUpdates,
  importingConfig,
  exportingConfig,
  configTransferDialog,
  stationCount,
  transparencyPercent,
  transparencyFill,
  reviewSubmitting,
  reviewSubmitError,
  reviewDraft,
  reviewHasSubmitted,
  reviewLocalRecord,
  persistenceNotice,
  onChangeSettings,
  onRestoreUpdateReminder,
  onCheckUpdate,
  onImportConfig,
  onExportConfig,
  onConfigTransferDialogChange,
  onConfigTransferDialogConfirm,
  onConfigTransferDialogCancel,
  onBackToOverview,
  onRefreshStation,
  onOpenConsole,
  onEditStation,
  onDeleteStation,
  onOpenStationReview,
  onAddStation,
  onOpenStation,
  onReorderStations,
  onOpenPrimaryUpdateLink,
  onOpenFallbackUpdateLink,
  onReviewDraftChange,
  onSubmitReview,
  onBackFromReviews
}: MainPanelsProps) {
  if (showSettings) {
    return (
      <SettingsPanel
        settings={settings}
        transparencyPercent={transparencyPercent}
        transparencyFill={transparencyFill}
        updateCurrentVersionText={updateCurrentVersionText}
        updateStatusText={updateStatusText}
        primaryUpdateLink={primaryUpdateLink}
        updateStatus={updateStatus}
        isLatestVersionIgnored={isLatestVersionIgnored}
        checkingUpdates={checkingUpdates}
        importingConfig={importingConfig}
        exportingConfig={exportingConfig}
        configTransferDialog={configTransferDialog}
        stationCount={stationCount}
        persistenceNotice={persistenceNotice}
        onChangeSettings={onChangeSettings}
        onOpenPrimaryUpdateLink={onOpenPrimaryUpdateLink}
        onOpenFallbackUpdateLink={onOpenFallbackUpdateLink}
        onRestoreUpdateReminder={onRestoreUpdateReminder}
        onCheckUpdate={onCheckUpdate}
        onImportConfig={onImportConfig}
        onExportConfig={onExportConfig}
        onConfigTransferDialogChange={onConfigTransferDialogChange}
        onConfigTransferDialogConfirm={onConfigTransferDialogConfirm}
        onConfigTransferDialogCancel={onConfigTransferDialogCancel}
      />
    )
  }

  if (showReviews) {
    return (
      <ReviewsPanel
        station={selectedStation}
        submitting={reviewSubmitting}
        submitError={reviewSubmitError}
        draft={reviewDraft}
        hasSubmitted={reviewHasSubmitted}
        localReview={reviewLocalRecord}
        onDraftChange={onReviewDraftChange}
        onSubmit={onSubmitReview}
        onBack={onBackFromReviews}
      />
    )
  }

  if (selectedStation) {
    return (
      <StationDetailPanel
        station={selectedStation}
        snapshot={selectedSnapshot}
        balanceHistory={selectedBalanceHistory}
        trendHours={settings.statsRangeHours}
        hasSubmittedReview={reviewHasSubmitted}
        onBackToOverview={onBackToOverview}
        onRefreshStation={onRefreshStation}
        onOpenConsole={onOpenConsole}
        onEditStation={onEditStation}
        onDeleteStation={onDeleteStation}
        onOpenStationReview={onOpenStationReview}
      />
    )
  }

  return (
    <OverviewPanel
      stations={stations}
      snapshots={snapshots}
      totals={totals}
      loading={loading}
      onAddStation={onAddStation}
      onOpenStation={onOpenStation}
      onReorderStations={onReorderStations}
      onRefreshStation={onRefreshStation}
    />
  )
}
