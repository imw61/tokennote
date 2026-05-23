import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { listen } from '@tauri-apps/api/event'
import { BellRing } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { GlassNoticeCard, resolveNoticeTheme } from './components/GlassNoticeCard'
import { applyPlatformMotionPreference } from './lib/platform-motion'
import {
  acknowledgeForceReminder,
  getForceReminderPayload,
  type ForceReminderPayload
} from './lib/force-reminder'
import './styles.css'

applyPlatformMotionPreference()

const reminderWindowWidth = 420
const minReminderWindowHeight = 228
const maxReminderWindowHeight = 560
const outerPaddingHeight = 16

function ForceReminderApp() {
  const appWindow = getCurrentWindow()
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [payload, setPayload] = useState<ForceReminderPayload | null>(null)
  const theme = resolveNoticeTheme(payload?.type)

  useEffect(() => {
    getForceReminderPayload()
      .then(setPayload)
      .catch(console.error)

    const unlisten = listen<ForceReminderPayload>('force-reminder-data', event => {
      setPayload(event.payload)
    })

    return () => {
      unlisten.then(dispose => dispose())
    }
  }, [])

  const closeWindow = async () => {
    await acknowledgeForceReminder().catch(console.error)
    setPayload(null)
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
        minReminderWindowHeight,
        Math.min(maxReminderWindowHeight, Math.ceil(cardHeight + outerPaddingHeight))
      )
      const size = new LogicalSize(reminderWindowWidth, nextHeight)
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
  }, [appWindow, payload?.content, payload?.updatedAt])

  return (
    <main className="h-full w-full bg-transparent text-gray-900 select-none">
      <div className="relative flex h-full w-full items-start justify-center p-1.5">
        <GlassNoticeCard
          cardRef={cardRef}
          eyebrow="Reminder"
          title="启动提醒"
          themeName={payload?.type}
          icon={<BellRing size={17} className={theme.icon} />}
          onDrag={dragWindow}
          footer={(
            <button
              type="button"
              className={`inline-flex h-9 items-center rounded-xl px-4 text-[12px] font-medium text-white transition-all duration-200 ${theme.button}`}
              onClick={() => { void closeWindow() }}
            >
              知道了
            </button>
          )}
        >
          <div className="text-[12px] leading-6 whitespace-pre-wrap break-words select-text">
            {payload?.content || '暂无提醒内容'}
          </div>
        </GlassNoticeCard>
      </div>
    </main>
  )
}

createRoot(document.getElementById('force-reminder-root')!).render(<ForceReminderApp />)
