import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { Download, RefreshCw } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { OptionalUpdateBanner } from './components/OptionalUpdateBanner'
import { UpdateRequiredNotice } from './components/UpdateRequiredNotice'
import { openExternalUrl } from './lib/safe-external-url'
import { checkForUpdates } from './lib/update'
import { applyPlatformMotionPreference } from './lib/platform-motion'
import {
  buildUpdatePopupPayload,
  getStoredUpdatePopupPayload,
  hideUpdatePopup,
  persistIgnoredUpdateVersion,
  type UpdatePopupPayload
} from './lib/update-popup'
import './styles.css'

applyPlatformMotionPreference()

function UpdateApp() {
  const appWindow = getCurrentWindow()
  const [payload, setPayload] = useState<UpdatePopupPayload | null>(() => getStoredUpdatePopupPayload())
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const unlisten = listen<UpdatePopupPayload>('update-popup-data', event => {
      setPayload(event.payload)
    })
    return () => {
      unlisten.then(dispose => dispose())
    }
  }, [])

  const closePopup = () => {
    void hideUpdatePopup()
  }

  const recheckUpdate = async () => {
    setChecking(true)
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 8000)
    try {
      const result = await checkForUpdates(controller.signal)
      const nextPayload = buildUpdatePopupPayload(result)
      if (!nextPayload) {
        setPayload(null)
        await hideUpdatePopup()
        return
      }
      setPayload(nextPayload)
      await invoke('show_update_window', { payload: nextPayload })
    } finally {
      window.clearTimeout(timer)
      setChecking(false)
    }
  }

  const dragWindow = (event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('button')) return
    appWindow.startDragging().catch(() => undefined)
  }

  return (
    <main className="h-full w-full overflow-hidden bg-white text-gray-900 select-none">
      <div className="relative flex h-full w-full items-stretch justify-center">
        <div className="animate-pop-in flex h-full w-full max-w-[520px] flex-col bg-white">
          <div className="h-3 w-full bg-white" data-tauri-drag-region onMouseDown={dragWindow} />
          <div className="flex-1 px-4 pb-4 pt-2">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 text-[12px] font-medium text-gray-500">
                <Download size={14} className="text-gray-400" />
                更新提示
              </div>
              {payload?.mode === 'required' || checking ? (
                <button
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[12px] font-medium text-gray-600 hover:bg-gray-50"
                  onClick={() => { void recheckUpdate() }}
                >
                  <RefreshCw size={13} className={checking ? 'animate-spin-slow' : ''} />
                  {checking ? '检查中' : '重新检查'}
                </button>
              ) : null}
            </div>
            <div className="mt-2">
            {payload?.mode === 'required' ? (
              <UpdateRequiredNotice
                currentVersion={payload.currentVersion}
                latestVersion={payload.latestVersion}
                minSupportedVersion={payload.minSupportedVersion}
                notes={payload.notes}
                checking={checking}
                errorMessage={payload.errorMessage}
                onOpenPrimaryDownload={() => openExternalUrl(payload.primaryUpdateLink, { allowHttpLoopback: true }).catch(console.error)}
                onOpenFallbackDownload={payload.fallbackUpdateLink ? () => openExternalUrl(payload.fallbackUpdateLink!, { allowHttpLoopback: true }).catch(console.error) : undefined}
                onRecheck={() => { void recheckUpdate() }}
              />
            ) : payload?.mode === 'available' ? (
              <OptionalUpdateBanner
                currentVersion={payload.currentVersion}
                latestVersion={payload.latestVersion}
                notes={payload.notes}
                onDismiss={closePopup}
                onIgnoreVersion={() => {
                  persistIgnoredUpdateVersion(payload.latestVersion)
                  closePopup()
                }}
                onOpenPrimaryDownload={() => openExternalUrl(payload.primaryUpdateLink, { allowHttpLoopback: true }).catch(console.error)}
                onOpenFallbackDownload={payload.fallbackUpdateLink ? () => openExternalUrl(payload.fallbackUpdateLink!, { allowHttpLoopback: true }).catch(console.error) : undefined}
              />
            ) : (
              <div className="rounded-[12px] bg-gray-50 px-4 py-10 text-center ring-1 ring-gray-200">
                <div className="text-[13px] font-medium text-gray-500">
                  暂无需要展示的更新提醒
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

createRoot(document.getElementById('update-root')!).render(<UpdateApp />)
