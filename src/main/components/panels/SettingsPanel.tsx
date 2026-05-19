import { SettingsView } from '../SettingsView'
import type { AppSettings, PersistenceNotice } from '../../types'
import type { ConfigTransferDialogState } from '../../component-props'

type SettingsPanelProps = {
  settings: AppSettings
  transparencyPercent: number
  transparencyFill: number
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
  persistenceNotice: PersistenceNotice | null
  onChangeSettings: (settings: AppSettings) => void
  onOpenPrimaryUpdateLink: () => void
  onOpenFallbackUpdateLink?: () => void
  onRestoreUpdateReminder: () => void
  onCheckUpdate: () => void
  onImportConfig: () => void
  onExportConfig: () => void
  onConfigTransferDialogChange: (value: string) => void
  onConfigTransferDialogConfirm: () => void
  onConfigTransferDialogCancel: () => void
}

export function SettingsPanel(props: SettingsPanelProps) {
  return <SettingsView {...props} />
}
