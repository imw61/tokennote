import type { Dispatch, SetStateAction } from 'react'
import type { BalanceHistoryPoint } from '../lib/balance-history'
import type {
  AppSettings,
  BalanceSnapshot,
  LocalStationReviewRecord,
  OverviewTotals,
  PersistenceNotice,
  Station,
  StationFormTab,
  StationTypeDetectionState
} from './types'
type ReviewDraft = {
  rating: number
  content: string
}

export type ConfigTransferDialogState = {
  mode: 'confirm' | 'key'
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  keyValue: string
  placeholder?: string
  hint?: string
  error?: string
}

export type MainHeaderProps = {
  title: string
  alwaysOnTop: boolean
  loading: boolean
  showSettings: boolean
  onDragWindow: (event: React.MouseEvent<HTMLElement>) => void
  onOpenWebsite: () => void
  onMinimize: () => void
  onToggleAlwaysOnTop: () => void
  onRefreshAll: () => void
  onToggleSettings: () => void
  onClose: () => void
}

export type MainPanelsProps = {
  showSettings: boolean
  showReviews: boolean
  stations: Station[]
  selectedStation: Station | null
  selectedSnapshot?: BalanceSnapshot
  selectedBalanceHistory: BalanceHistoryPoint[]
  settings: AppSettings
  snapshots: Record<string, BalanceSnapshot>
  totals: OverviewTotals
  loading: boolean
  updateCurrentVersionText: string
  updateStatusText: string
  primaryUpdateLink: string
  updateStatus?: string
  isLatestVersionIgnored: boolean
  checkingUpdates: boolean
  importingConfig: boolean
  exportingConfig: boolean
  configTransferDialog: ConfigTransferDialogState | null
  stationCount: number
  transparencyPercent: number
  transparencyFill: number
  reviewSubmitting: boolean
  reviewSubmitError: string
  reviewDraft: ReviewDraft
  reviewHasSubmitted: boolean
  reviewLocalRecord: LocalStationReviewRecord | null
  persistenceNotice: PersistenceNotice | null
  onChangeSettings: (settings: AppSettings) => void
  onRestoreUpdateReminder: () => void
  onCheckUpdate: () => void
  onImportConfig: () => void
  onExportConfig: () => void
  onConfigTransferDialogChange: (value: string) => void
  onConfigTransferDialogConfirm: () => void
  onConfigTransferDialogCancel: () => void
  openingConsoleId: string | null
  onBackToOverview: () => void
  onRefreshStation: (id: string) => void
  onOpenConsole: (id: string) => void
  onEditStation: (station: Station) => void
  onDeleteStation: (id: string) => void
  onOpenStationReview: (station: Station) => void
  onAddStation: () => void
  onOpenStation: (id: string) => void
  onReorderStations: (draggedId: string, targetId: string) => Promise<void>
  onOpenPrimaryUpdateLink: () => void
  onOpenFallbackUpdateLink?: () => void
  onReviewDraftChange: (updater: (current: ReviewDraft) => ReviewDraft) => void
  onSubmitReview: () => void
  onBackFromReviews: () => void
}

export type StationFormLayerProps = {
  showForm: boolean
  draft: Station
  editingId: string | null
  formTab: StationFormTab
  setFormTab: Dispatch<SetStateAction<StationFormTab>>
  detectingType: boolean
  detectedType: StationTypeDetectionState
  unsupportedDetectedType: string
  setDetectedType: Dispatch<SetStateAction<StationTypeDetectionState>>
  setDraft: Dispatch<SetStateAction<Station>>
  formError: string
  formSaving: boolean
  onClose: () => void
  onSave: () => void
  onDetectStationType: (baseUrl: string) => void
}

export type StationFormModalProps = Omit<StationFormLayerProps, 'showForm'>
