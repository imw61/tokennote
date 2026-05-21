import React, { useEffect, useLayoutEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ShieldAlert } from 'lucide-react'
import { applyPlatformMotionPreference } from './lib/platform-motion'
import './styles.css'

applyPlatformMotionPreference()

const noticeWindowWidth = 400
const minNoticeWindowHeight = 300
const maxNoticeWindowHeight = 600
const outerPaddingHeight = 16
const STORAGE_KEY = 'tokennote.securityNoticeShown'

async function closeWindow() {
  try {
    window.localStorage.setItem(STORAGE_KEY, 'true')
  } catch {
    // ignore
  }
  await invoke('hide_security_notice_window').catch(console.error)
}

function SecurityNoticeApp() {
  const appWindow = getCurrentWindow()
  const cardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY)) {
        void invoke('hide_security_notice_window').catch(console.error)
      }
    } catch {
      // ignore
    }
  }, [])

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
        minNoticeWindowHeight,
        Math.min(maxNoticeWindowHeight, Math.ceil(cardHeight + outerPaddingHeight))
      )
      const size = new LogicalSize(noticeWindowWidth, nextHeight)
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
  }, [appWindow])

  return (
    <main className="h-full w-full bg-transparent text-gray-900 select-none">
      <div className="relative flex h-full w-full items-start justify-center p-1.5">
        <div
          ref={cardRef}
          className="animate-pop-in flex w-full max-w-[388px] flex-col rounded-[24px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(245,250,255,0.96)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md"
        >
          <div className="h-2.5 w-full bg-transparent" data-tauri-drag-region onMouseDown={dragWindow} />
          <div className="flex-1 px-3.5 pb-3.5 pt-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex items-start gap-2.5">
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
                  <div className="text-[11px] leading-[1.55] text-gray-600">
                    {text}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-end">
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-xl bg-[linear-gradient(180deg,#60a5fa_0%,#3b82f6_100%)] px-3.5 text-[11px] font-bold text-white shadow-[0_6px_14px_rgba(59,130,246,0.24)] transition-all duration-200 hover:brightness-[1.03]"
                onClick={() => { void closeWindow() }}
              >
                我已知晓
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

createRoot(document.getElementById('security-notice-root')!).render(<SecurityNoticeApp />)
