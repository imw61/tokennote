import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { ArrowUpCircle, BellRing, ShieldAlert } from 'lucide-react'
import {
  buildNoticeSecondaryButtonClass,
  GlassNoticeCard,
  resolveNoticeTheme,
  type NoticeThemeName
} from '../../components/GlassNoticeCard'
import { isAndroid } from '../../lib/platform'
import {
  acknowledgeForceReminder,
  getForceReminderPayload,
  type ForceReminderPayload
} from '../../lib/force-reminder'
import { openExternalUrl } from '../../lib/safe-external-url'
import {
  getActiveUpdatePopupPayload,
  hideUpdatePopup,
  persistIgnoredUpdateVersion,
  type UpdatePopupPayload
} from '../../lib/update-popup'

/**
 * 移动端应用内弹层：
 * 桌面端这三类提示都各有独立窗口（update / force-reminder / security-notice），
 * Android 不支持多窗口，统一改用全屏覆盖层呈现，同时保持桌面端行为不变。
 *
 * 方案文档 3.1 / 3.3 明确要求：
 * - 版本更新检查 → 应用内提示
 * - 强制提醒 → 系统通知 + 应用内弹层
 * - 数据安全提示 → 应用内弹层
 *
 * 该组件只在 `isAndroid()` 命中时挂载，桌面端没有任何副作用。
 */
export function MobileOverlays() {
  if (!isAndroid()) return null
  return (
    <>
      <UpdateOverlay />
      <ForceReminderOverlay />
      <SecurityNoticeOverlay />
    </>
  )
}

const overlayShellClass =
  'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/35 backdrop-blur-sm p-3 sm:p-6'

function buildUpdateMessage(payload: UpdatePopupPayload | null) {
  if (!payload) {
    return '暂无需要展示的更新提醒。'
  }
  if (payload.mode === 'required') {
    return `当前版本 ${payload.currentVersion} 已低于最低支持版本 ${payload.minSupportedVersion}，需要先升级到 ${payload.latestVersion} 或更高版本。`
  }
  return `TokenNote ${payload.latestVersion} 现已可用，你当前是 ${payload.currentVersion}。是否现在下载？`
}

function UpdateOverlay() {
  const [payload, setPayload] = useState<UpdatePopupPayload | null>(null)

  useEffect(() => {
    void getActiveUpdatePopupPayload().then(value => setPayload(current => current ?? value))
    const unlisten = listen<UpdatePopupPayload>('update-popup-data', event => {
      setPayload(event.payload)
    })
    const unlistenHide = listen('update-popup-hide', () => setPayload(null))
    return () => {
      unlisten.then(dispose => dispose()).catch(() => {})
      unlistenHide.then(dispose => dispose()).catch(() => {})
    }
  }, [])

  if (!payload) return null

  const themeName: NoticeThemeName = payload.mode === 'required' ? 'warning' : 'info'
  const theme = resolveNoticeTheme(themeName)
  const secondaryButtonClass = buildNoticeSecondaryButtonClass()

  const closeOverlay = () => {
    if (payload.mode === 'required') return
    void hideUpdatePopup()
    setPayload(null)
  }

  const dismissAndIgnore = () => {
    persistIgnoredUpdateVersion(payload.latestVersion)
    void hideUpdatePopup()
    setPayload(null)
  }

  const footer = payload.mode === 'required' ? (
    <div className="flex flex-wrap justify-end gap-2">
      {payload.fallbackUpdateLink ? (
        <button
          type="button"
          className={`inline-flex h-9 items-center rounded-xl px-3.5 text-[12px] font-medium transition-all duration-200 ${secondaryButtonClass}`}
          onClick={() => openExternalUrl(payload.fallbackUpdateLink!, { allowHttpLoopback: true }).catch(console.error)}
        >
          备用链接
        </button>
      ) : null}
      <button
        type="button"
        className={`inline-flex h-9 items-center rounded-xl px-4 text-[12px] font-medium text-white transition-all duration-200 ${theme.button}`}
        onClick={() => openExternalUrl(payload.primaryUpdateLink, { allowHttpLoopback: true }).catch(console.error)}
      >
        立即更新
      </button>
    </div>
  ) : (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        className={`inline-flex h-9 items-center rounded-xl px-3.5 text-[12px] font-medium transition-all duration-200 ${secondaryButtonClass}`}
        onClick={dismissAndIgnore}
      >
        忽略本次
      </button>
      <button
        type="button"
        className={`inline-flex h-9 items-center rounded-xl px-3.5 text-[12px] font-medium transition-all duration-200 ${secondaryButtonClass}`}
        onClick={closeOverlay}
      >
        稍后提醒
      </button>
      {payload.fallbackUpdateLink ? (
        <button
          type="button"
          className={`inline-flex h-9 items-center rounded-xl px-3.5 text-[12px] font-medium transition-all duration-200 ${secondaryButtonClass}`}
          onClick={() => openExternalUrl(payload.fallbackUpdateLink!, { allowHttpLoopback: true }).catch(console.error)}
        >
          备用链接
        </button>
      ) : null}
      <button
        type="button"
        className={`inline-flex h-9 items-center rounded-xl px-4 text-[12px] font-medium text-white transition-all duration-200 ${theme.button}`}
        onClick={() => openExternalUrl(payload.primaryUpdateLink, { allowHttpLoopback: true }).catch(console.error)}
      >
        立即更新
      </button>
    </div>
  )

  const title = payload.mode === 'required' ? 'TokenNote 必须更新' : 'TokenNote 有可用更新'
  const icon = payload.mode === 'required'
    ? <ShieldAlert size={17} className={theme.icon} />
    : <ArrowUpCircle size={17} className={theme.icon} />

  return (
    <div className={overlayShellClass} role="dialog" aria-modal="true">
      <div className="w-full max-w-[460px]">
        <GlassNoticeCard
          maxWidthClass="max-w-[460px]"
          eyebrow="Update"
          title={title}
          themeName={themeName}
          icon={icon}
          onDrag={() => undefined}
          footer={footer}
        >
          <div className="space-y-3">
            <div className="text-[12px] leading-6 break-words">{buildUpdateMessage(payload)}</div>
            {payload.notes?.length ? (
              <div className="space-y-2">
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                  {payload.mode === 'required' ? '升级说明' : '更新内容'}
                </div>
                <div className="max-h-[40vh] space-y-2 overflow-auto pr-1">
                  {payload.notes.map(note => (
                    <div
                      key={note}
                      className="flex items-start gap-2 rounded-[16px] border border-white/50 bg-white/44 px-3 py-2 text-[12px] leading-6 text-slate-700"
                    >
                      <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400/70" />
                      <span className="min-w-0 break-words">{note}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {payload.errorMessage ? (
              <div className="rounded-[16px] border border-amber-200/80 bg-amber-50/88 px-3 py-2 text-[12px] leading-6 text-amber-800">
                最近一次检查提示：{payload.errorMessage}
              </div>
            ) : null}
          </div>
        </GlassNoticeCard>
      </div>
    </div>
  )
}

function ForceReminderOverlay() {
  const [payload, setPayload] = useState<ForceReminderPayload | null>(null)
  const theme = resolveNoticeTheme(payload?.type)

  useEffect(() => {
    getForceReminderPayload().then(value => setPayload(current => current ?? value)).catch(() => {})
    const unlisten = listen<ForceReminderPayload>('force-reminder-data', event => {
      setPayload(event.payload)
    })
    const unlistenHide = listen('force-reminder-hide', () => setPayload(null))
    return () => {
      unlisten.then(dispose => dispose()).catch(() => {})
      unlistenHide.then(dispose => dispose()).catch(() => {})
    }
  }, [])

  if (!payload) return null

  const acknowledge = () => {
    void acknowledgeForceReminder().catch(console.error)
    setPayload(null)
  }

  return (
    <div className={overlayShellClass} role="dialog" aria-modal="true">
      <div className="w-full max-w-[420px]">
        <GlassNoticeCard
          maxWidthClass="max-w-[420px]"
          eyebrow="Reminder"
          title="启动提醒"
          themeName={payload.type}
          icon={<BellRing size={17} className={theme.icon} />}
          onDrag={() => undefined}
          footer={(
            <button
              type="button"
              className={`inline-flex h-9 items-center rounded-xl px-4 text-[12px] font-medium text-white transition-all duration-200 ${theme.button}`}
              onClick={acknowledge}
            >
              知道了
            </button>
          )}
        >
          <div className="text-[12px] leading-6 whitespace-pre-wrap break-words select-text">
            {payload.content || '暂无提醒内容'}
          </div>
        </GlassNoticeCard>
      </div>
    </div>
  )
}

function SecurityNoticeOverlay() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const unlistenShow = listen('security-notice-show', () => setVisible(true))
    const unlistenHide = listen('security-notice-hide', () => setVisible(false))
    return () => {
      unlistenShow.then(dispose => dispose()).catch(() => {})
      unlistenHide.then(dispose => dispose()).catch(() => {})
    }
  }, [])

  if (!visible) return null

  const acknowledge = () => {
    void invoke('acknowledge_security_notice').catch(console.error)
    setVisible(false)
  }

  return (
    <div className={overlayShellClass} role="dialog" aria-modal="true">
      <div className="w-full max-w-[400px]">
        <div className="animate-pop-in flex w-full max-w-[388px] flex-col rounded-[24px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(245,250,255,0.96)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md">
          <div className="flex-1 px-3.5 pb-3.5 pt-3.5">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] border border-blue-100/70 bg-[linear-gradient(180deg,#eff6ff_0%,#dbeafe_100%)] text-blue-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
                <ShieldAlert size={16} className="text-blue-400" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-400/90">
                  Security Notice
                </div>
                <div className="mt-0.5 text-[15px] font-extrabold text-gray-900">
                  数据安全提示
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-1.5">
              {[
                '本应用会在本地存储站点配置、API Key、Cookie 等敏感信息，请勿将配置文件分享给他人。',
                '数据使用当前设备的机器指纹加密，更换硬件设备后将无法解密原有数据。',
                '建议定期通过「导出配置」功能备份数据，并妥善保管导出文件及密钥。',
              ].map((text, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 rounded-[18px] border border-gray-200/85 bg-white/78 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]"
                >
                  <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[9px] font-bold text-blue-400">
                    {index + 1}
                  </div>
                  <div className="text-[11px] leading-[1.55] text-gray-600">{text}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-end">
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-xl bg-[linear-gradient(180deg,#60a5fa_0%,#3b82f6_100%)] px-3.5 text-[11px] font-bold text-white shadow-[0_6px_14px_rgba(59,130,246,0.24)]"
                onClick={acknowledge}
              >
                我已知晓
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
