import type { CSSProperties } from 'react'
import { AlertTriangle, Download, Layers3, Upload } from 'lucide-react'
import { ConfigTransferDialog } from './ConfigTransferDialog'
import { SecurityStatusCard } from './SecurityStatusCard'
import type { AppSettings, PersistenceNotice } from '../types'
import type { ConfigTransferDialogState } from '../component-props'
import {
  widgetOpacityMax,
  widgetOpacityMin,
  widgetTransparencyMaxPercent
} from '../utils'

type SettingsViewProps = {
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

type SettingsSectionProps = {
  title: string
  description?: string
  children: React.ReactNode
}

function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section className="space-y-2">
      <div className="px-1">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-gray-400">{title}</div>
        {description ? (
          <div className="mt-0.5 text-[10px] font-semibold text-gray-400">{description}</div>
        ) : null}
      </div>
      {children}
    </section>
  )
}

export function SettingsView({
  settings,
  transparencyPercent,
  transparencyFill,
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
  persistenceNotice,
  onChangeSettings,
  onOpenPrimaryUpdateLink,
  onOpenFallbackUpdateLink,
  onRestoreUpdateReminder,
  onCheckUpdate,
  onImportConfig,
  onExportConfig,
  onConfigTransferDialogChange,
  onConfigTransferDialogConfirm,
  onConfigTransferDialogCancel
}: SettingsViewProps) {
  return (
    <>
      <div className="flex-1 overflow-auto px-4 pb-4 space-y-3 scrollbar-hide stagger-children">
        <SettingsSection title="刷新与统计" description="控制数据刷新频率、并发和图表统计范围">
          <div className="grid grid-cols-3 gap-2">
            <label className="min-w-0 flex flex-col gap-1.5 rounded-2xl border border-gray-100 bg-white p-3 text-[11px] font-bold text-gray-500 shadow-sm">
              刷新间隔（秒）
              <input
                type="number"
                min="15"
                value={settings.globalRefreshIntervalSec}
                onChange={event => onChangeSettings({ ...settings, globalRefreshIntervalSec: Number(event.target.value) })}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-all duration-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
            </label>
            <label className="min-w-0 flex flex-col gap-1.5 rounded-2xl border border-gray-100 bg-white p-3 text-[11px] font-bold text-gray-500 shadow-sm">
              刷新并发数
              <input
                type="number"
                min="1"
                max="10"
                value={settings.refreshConcurrency}
                onChange={event => onChangeSettings({
                  ...settings,
                  refreshConcurrency: Math.min(10, Math.max(1, Number(event.target.value) || 1))
                })}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-all duration-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
            </label>
            <label className="min-w-0 flex flex-col gap-1.5 rounded-2xl border border-gray-100 bg-white p-3 text-[11px] font-bold text-gray-500 shadow-sm">
              统计范围
              <input
                type="number"
                min="1"
                value={settings.statsRangeHours}
                onChange={event => onChangeSettings({ ...settings, statsRangeHours: Number(event.target.value) })}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-all duration-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
            </label>
          </div>
        </SettingsSection>

        <SettingsSection title="窗口与提醒" description="控制悬浮窗显示方式和常用提醒行为">
          <div className="space-y-3">
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <label className="flex flex-col gap-1.5">
                <span className="flex items-center justify-between text-[11px] font-bold text-gray-500">
                  <span>悬浮窗透明度</span>
                  <span className="tabular-nums text-[10px] font-extrabold text-gray-400">{transparencyPercent}%</span>
                </span>
                <input
                  type="range"
                  min="0"
                  max={String(widgetTransparencyMaxPercent)}
                  step="1"
                  value={transparencyPercent}
                  onChange={event => onChangeSettings({
                    ...settings,
                    opacity: Math.max(
                      widgetOpacityMin,
                      Math.min(widgetOpacityMax, widgetOpacityMax - Number(event.target.value) / 100)
                    )
                  })}
                  style={{ ['--fill' as string]: `${transparencyFill}%` } as CSSProperties}
                  className="w-full premium-range"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm transition-all duration-200 hover:bg-gray-50">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-gray-600">开机自启动</span>
                    <span className="text-[10px] font-semibold text-gray-400">默认开启，登录系统后自动启动 TokenNote，支持在这里关闭</span>
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.autoLaunchEnabled}
                      onChange={event => onChangeSettings({ ...settings, autoLaunchEnabled: event.target.checked })}
                      className="sr-only peer"
                    />
                    <span className="h-6 w-10 rounded-full bg-gray-200 transition-colors duration-200 peer-checked:bg-primary-500 peer-focus:ring-2 peer-focus:ring-primary-500/25 peer-focus:ring-offset-2 peer-focus:ring-offset-white" />
                    <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-4" />
                  </label>
                </div>
              </div>

              <label className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm transition-all duration-200 hover:bg-gray-50 cursor-pointer select-none">
                <span className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
                  <Layers3 size={14} />悬浮窗
                </span>
                <span className="relative inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.widgetEnabled}
                    onChange={event => onChangeSettings({ ...settings, widgetEnabled: event.target.checked })}
                    className="sr-only peer"
                  />
                  <span className="h-6 w-10 rounded-full bg-gray-200 transition-colors duration-200 peer-checked:bg-primary-500 peer-focus:ring-2 peer-focus:ring-primary-500/25 peer-focus:ring-offset-2 peer-focus:ring-offset-white" />
                  <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-4" />
                </span>
              </label>

              <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm transition-all duration-200 hover:bg-gray-50">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-gray-600">贴边自动隐藏</span>
                    <span className="text-[10px] font-semibold text-gray-400">默认关闭，开启后悬浮窗贴到屏幕边缘会自动缩进隐藏</span>
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.widgetAutoHideEnabled}
                      onChange={event => onChangeSettings({ ...settings, widgetAutoHideEnabled: event.target.checked })}
                      className="sr-only peer"
                    />
                    <span className="h-6 w-10 rounded-full bg-gray-200 transition-colors duration-200 peer-checked:bg-primary-500 peer-focus:ring-2 peer-focus:ring-primary-500/25 peer-focus:ring-offset-2 peer-focus:ring-offset-white" />
                    <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-4" />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm transition-all duration-200 hover:bg-gray-50">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-gray-600">低余额弹窗</span>
                    <span className="text-[10px] font-semibold text-gray-400">默认关闭，余额首次低于阈值时弹窗提醒</span>
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.lowBalancePopupEnabled}
                      onChange={event => onChangeSettings({ ...settings, lowBalancePopupEnabled: event.target.checked })}
                      className="sr-only peer"
                    />
                    <span className="h-6 w-10 rounded-full bg-gray-200 transition-colors duration-200 peer-checked:bg-primary-500 peer-focus:ring-2 peer-focus:ring-primary-500/25 peer-focus:ring-offset-2 peer-focus:ring-offset-white" />
                    <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-4" />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="数据与安全" description="查看本地状态并导入导出加密配置">
          <div className="space-y-3">
            {persistenceNotice ? (
              <div className={`rounded-2xl border p-4 shadow-sm ${
                persistenceNotice.level === 'error'
                  ? 'border-rose-200 bg-rose-50/90'
                  : 'border-amber-200 bg-amber-50/90'
              }`}>
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                    persistenceNotice.level === 'error'
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    <AlertTriangle size={15} />
                  </span>
                  <div className="min-w-0">
                    <strong className={`text-xs font-bold ${
                      persistenceNotice.level === 'error' ? 'text-rose-900' : 'text-amber-900'
                    }`}>
                      本地数据状态
                    </strong>
                    <div className={`mt-1 text-[11px] leading-relaxed break-words ${
                      persistenceNotice.level === 'error' ? 'text-rose-800' : 'text-amber-800'
                    }`}>
                      {persistenceNotice.message}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <SecurityStatusCard />

            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
              <div className="flex flex-col gap-3">
                <div className="min-w-0">
                  <strong className="text-xs font-bold text-amber-900">配置导入 / 导出</strong>
                  <div className="mt-1 text-[11px] leading-relaxed text-amber-800">
                    导出和导入都需要输入 6 位英文数字混合密钥。输入内容会自动转成大写，配置文件会先加密，再写入站点地址、账号、密码、Cookie、API Key 和本机评价记录等内容，请务必牢记密钥，勿随意分享文件。
                  </div>
                  <div className="mt-1 text-[11px] text-amber-700">
                    当前可导出 {stationCount} 个站点配置、全部偏好设置和本机评价记录；导入时需使用相同的 6 位密钥解密。
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-[11px] font-extrabold text-amber-900 transition-all duration-200 hover:bg-amber-100 interactive-bounce disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={onImportConfig}
                    disabled={importingConfig || exportingConfig}
                  >
                    <Upload size={13} />
                    {importingConfig ? '导入中...' : '导入配置'}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-[11px] font-extrabold text-white transition-all duration-200 hover:bg-amber-600 interactive-bounce disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={onExportConfig}
                    disabled={importingConfig || exportingConfig || stationCount === 0}
                  >
                    <Download size={13} />
                    {exportingConfig ? '导出中...' : '导出配置'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="应用更新" description="查看当前版本并手动检查更新">
          <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4 shadow-sm">
            <div className="flex flex-col gap-3">
              <div className="min-w-0">
                <strong className="text-xs font-bold text-gray-700">应用更新</strong>
                <div className="mt-1 text-[11px] font-semibold text-gray-500">
                  当前版本：{updateCurrentVersionText}
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-gray-500 break-words">
                  {updateStatusText}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {primaryUpdateLink && updateStatus !== 'none' ? (
                  <>
                    <button
                      type="button"
                      className="shrink-0 rounded-[10px] bg-primary-500 px-2.5 py-1 text-[10px] font-bold text-white transition-all duration-200 hover:bg-primary-600 interactive-bounce"
                      onClick={onOpenPrimaryUpdateLink}
                    >
                      前往更新
                    </button>
                    {onOpenFallbackUpdateLink ? (
                      <button
                        type="button"
                        className="shrink-0 rounded-[10px] border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-bold text-gray-600 transition-all duration-200 hover:bg-gray-100 interactive-bounce"
                        onClick={onOpenFallbackUpdateLink}
                      >
                        备用链接
                      </button>
                    ) : null}
                  </>
                ) : null}
                {isLatestVersionIgnored ? (
                  <button
                    type="button"
                    className="shrink-0 rounded-[10px] border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-bold text-gray-600 transition-all duration-200 hover:bg-gray-100 interactive-bounce"
                    onClick={onRestoreUpdateReminder}
                  >
                    恢复提醒
                  </button>
                ) : null}
                <button
                  type="button"
                  className="shrink-0 rounded-[10px] border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-bold text-gray-600 transition-all duration-200 hover:bg-gray-100 interactive-bounce"
                  onClick={onCheckUpdate}
                  disabled={checkingUpdates}
                >
                  {checkingUpdates ? '检查中...' : '检查更新'}
                </button>
              </div>
            </div>
          </div>
        </SettingsSection>
      </div>
      {configTransferDialog ? (
        <ConfigTransferDialog
          dialog={configTransferDialog}
          onChange={onConfigTransferDialogChange}
          onConfirm={onConfigTransferDialogConfirm}
          onCancel={onConfigTransferDialogCancel}
        />
      ) : null}
    </>
  )
}
