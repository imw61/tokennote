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
  /**
   * 首次 `get_app_data` 是否已经返回。安卓冷启动 + IPC 第一次往返较慢，
   * 在这之前 stations 还是初始空数组，必须靠这个标记把"还没有监控站点"的空态守住，
   * 否则用户会看到一闪而过的"没有站点"导致以为配置丢失。
   */
  initialLoaded: boolean
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
  /** 电脑端：把当前配置加密后展示为二维码 */
  onExportConfigQr: () => void
  /** 手机端：开启相机扫描电脑端展示的二维码 */
  onImportConfigQr: () => void
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
  /**
   * 安卓端首页下拉刷新触发的"全量刷新"。复用 header 上原有的 `refreshAll`，
   * 桌面端目前未启用下拉手势，因此不会真正调用。
   */
  onRefreshAll: () => void
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
