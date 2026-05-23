import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { ArrowUpCircle, RefreshCw, ShieldAlert } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  buildNoticeSecondaryButtonClass,
  GlassNoticeCard,
  resolveNoticeTheme,
  type NoticeThemeName
} from './components/GlassNoticeCard'
import { openExternalUrl } from './lib/safe-external-url'
import { checkForUpdates } from './lib/update'
import { applyPlatformMotionPreference } from './lib/platform-motion'
import {
  buildUpdatePopupPayload,
  getActiveUpdatePopupPayload,
  hideUpdatePopup,
  persistIgnoredUpdateVersion,
  type UpdatePopupPayload
} from './lib/update-popup'
import './styles.css'

applyPlatformMotionPreference()

const updateWindowWidth = 520
const minUpdateWindowHeight = 248
const maxUpdateWindowHeight = 560
const outerPaddingHeight = 16

function buildUpdateMessage(payload: UpdatePopupPayload | null) {
  if (!payload) {
    return '暂无需要展示的更新提醒。'
  }
  if (payload.mode === 'required') {
    return `当前版本 ${payload.currentVersion} 已低于最低支持版本 ${payload.minSupportedVersion}，需要先升级到 ${payload.latestVersion} 或更高版本。`
  }
  return `TokenNote ${payload.latestVersion} 现已可用，你当前是 ${payload.currentVersion}。是否现在下载？`
}

function UpdateApp() {
  const appWindow = getCurrentWindow()
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [payload, setPayload] = useState<UpdatePopupPayload | null>(null)
  const [checking, setChecking] = useState(false)
  const themeName: NoticeThemeName = payload?.mode === 'required' ? 'warning' : 'info'
  const theme = resolveNoticeTheme(themeName)
  const secondaryButtonClass = buildNoticeSecondaryButtonClass()

  useEffect(() => {
    document.documentElement.classList.add('update-page')
    document.body.classList.add('update-page')
    void getActiveUpdatePopupPayload().then(activePayload => {
      setPayload(current => current ?? activePayload)
    })
    const unlisten = listen<UpdatePopupPayload>('update-popup-data', event => {
      setPayload(event.payload)
    })
    return () => {
      document.documentElement.classList.remove('update-page')
      document.body.classList.remove('update-page')
      unlisten.then(dispose => dispose())
    }
  }, [])

  const closePopup = () => {
    void hideUpdatePopup()
  }

  const recheckUpdate = async () => {
    setChecking(true)
    try {
      const result = await checkForUpdates()
      const nextPayload = buildUpdatePopupPayload(result)
      if (!nextPayload) {
        setPayload(null)
        await hideUpdatePopup(true)
        return
      }
      setPayload(nextPayload)
      await invoke('show_update_window', { payload: nextPayload })
    } finally {
      setChecking(false)
    }
  }

  const dragWindow = (event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('button')) return
    appWindow.startDragging().catch(() => undefined)
  }

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return

    let frameId = 0
    const syncWindowSize = async () => {
      const cardHeight = Math.max(card.scrollHeight, card.offsetHeight)
      const nextHeight = Math.max(
        minUpdateWindowHeight,
        Math.min(maxUpdateWindowHeight, Math.ceil(cardHeight + outerPaddingHeight))
      )
      const size = new LogicalSize(updateWindowWidth, nextHeight)
      try {
        await appWindow.setMinSize(size)
        await appWindow.setMaxSize(size)
        await appWindow.setSize(size)
      } catch (error) {
        console.error(error)
      }
    }

    const queueSync = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        void syncWindowSize()
      })
    }

    const resizeObserver = new ResizeObserver(() => {
      queueSync()
    })
    resizeObserver.observe(card)
    queueSync()

    return () => {
      resizeObserver.disconnect()
      window.cancelAnimationFrame(frameId)
    }
  }, [appWindow, checking, payload])

  const footer = payload?.mode === 'required' ? (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        className={`inline-flex h-9 items-center gap-1 rounded-xl px-3.5 text-[12px] font-medium transition-all duration-200 ${secondaryButtonClass}`}
        onClick={() => { void recheckUpdate() }}
        disabled={checking}
      >
        <RefreshCw size={13} className={checking ? 'animate-spin-slow' : ''} />
        {checking ? '检查中' : '重新检查'}
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
  ) : payload?.mode === 'available' ? (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        className={`inline-flex h-9 items-center rounded-xl px-3.5 text-[12px] font-medium transition-all duration-200 ${secondaryButtonClass}`}
        onClick={() => {
          persistIgnoredUpdateVersion(payload.latestVersion)
          closePopup()
        }}
      >
        忽略本次
      </button>
      <button
        type="button"
        className={`inline-flex h-9 items-center rounded-xl px-3.5 text-[12px] font-medium transition-all duration-200 ${secondaryButtonClass}`}
        onClick={closePopup}
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
  ) : undefined

  const title = payload?.mode === 'required'
    ? 'TokenNote 必须更新'
    : payload?.mode === 'available'
      ? 'TokenNote 有可用更新'
      : '更新提示'
  const icon = payload?.mode === 'required'
    ? <ShieldAlert size={17} className={theme.icon} />
    : <ArrowUpCircle size={17} className={theme.icon} />

  return (
    <main className="h-full w-full bg-transparent text-gray-900 select-none">
      <div className="relative flex h-full w-full items-start justify-center p-1.5">
        <GlassNoticeCard
          cardRef={cardRef}
          maxWidthClass="max-w-[508px]"
          eyebrow="Update"
          title={title}
          themeName={themeName}
          icon={icon}
          onDrag={dragWindow}
          footer={footer}
        >
          <div className="space-y-3">
            <div className="text-[12px] leading-6 break-words">
              {buildUpdateMessage(payload)}
            </div>
            {payload?.notes?.length ? (
              <div className="space-y-2">
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                  {payload.mode === 'required' ? '升级说明' : '更新内容'}
                </div>
                <div className="max-h-[188px] space-y-2 overflow-auto pr-1">
                  {payload.notes.map(note => (
                    <div
                      key={note}
                      className="flex items-start gap-2 rounded-[16px] border border-white/50 bg-white/44 px-3 py-2 text-[12px] leading-6 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
                    >
                      <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400/70" />
                      <span className="min-w-0 break-words">{note}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {payload?.errorMessage ? (
              <div className="rounded-[16px] border border-amber-200/80 bg-amber-50/88 px-3 py-2 text-[12px] leading-6 text-amber-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.56)]">
                最近一次检查提示：{payload.errorMessage}
              </div>
            ) : null}
          </div>
        </GlassNoticeCard>
      </div>
    </main>
  )
}

createRoot(document.getElementById('update-root')!).render(<UpdateApp />)
