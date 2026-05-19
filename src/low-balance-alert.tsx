import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { AlertTriangle, ExternalLink, X } from 'lucide-react'
import type { LowBalanceAlertPayload } from './lib/low-balance-alert'
import { applyPlatformMotionPreference } from './lib/platform-motion'
import './styles.css'

applyPlatformMotionPreference()

function formatCurrency(value: number, symbol = '$') {
  return `${symbol}${value.toFixed(2)}`
}

const visibleItemLimit = 3
const alertWindowWidth = 360
const minAlertWindowHeight = 172
const maxAlertWindowHeight = 420
const outerPaddingHeight = 16

function LowBalanceAlertApp() {
  const appWindow = getCurrentWindow()
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [payload, setPayload] = useState<LowBalanceAlertPayload | null>(null)

  useEffect(() => {
    invoke<LowBalanceAlertPayload | null>('get_low_balance_alert_payload')
      .then(setPayload)
      .catch(console.error)

    const unlisten = listen<LowBalanceAlertPayload>('low-balance-alert-data', event => {
      setPayload(event.payload)
    })

    return () => {
      unlisten.then(dispose => dispose())
    }
  }, [])

  const closeWindow = async () => {
    await invoke('hide_low_balance_alert_window').catch(console.error)
    setPayload(null)
  }

  const openMainWindow = async () => {
    await invoke('hide_low_balance_alert_window').catch(console.error)
    setPayload(null)
    await invoke('show_main_window').catch(console.error)
  }

  const dragWindow = (event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('button')) return
    appWindow.startDragging().catch(() => undefined)
  }

  const items = payload?.items ?? []
  const visibleItems = items.slice(0, visibleItemLimit)
  const hiddenCount = Math.max(0, (payload?.totalCount ?? items.length) - visibleItems.length)

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return

    let frameId = 0
    const syncWindowSize = async () => {
      const cardHeight = Math.max(card.scrollHeight, card.offsetHeight)
      const nextHeight = Math.max(
        minAlertWindowHeight,
        Math.min(maxAlertWindowHeight, Math.ceil(cardHeight + outerPaddingHeight))
      )
      const size = new LogicalSize(alertWindowWidth, nextHeight)
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
  }, [appWindow, hiddenCount, items.length, payload?.totalCount, visibleItems.length])

  return (
    <main className="h-full w-full overflow-hidden bg-transparent text-gray-900 select-none">
      <div className="relative flex h-full w-full items-start justify-center overflow-hidden p-1.5">
        <div
          ref={cardRef}
          className="animate-pop-in flex w-full max-w-[348px] flex-col overflow-hidden rounded-[24px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(255,251,245,0.96)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md"
        >
          <div className="h-2.5 w-full bg-transparent" data-tauri-drag-region onMouseDown={dragWindow} />
          <div className="flex-1 px-3.5 pb-3.5 pt-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex items-start gap-2.5">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] border border-amber-100/70 bg-[linear-gradient(180deg,#fff7ed_0%,#fffbeb_100%)] text-amber-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
                  <AlertTriangle size={16} className="text-amber-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400/90">
                    Low Balance
                  </div>
                  <div className="mt-0.5 text-[15px] font-extrabold text-gray-900">
                    {payload?.totalCount ? `${payload.totalCount} 个站点余额不足` : '低余额提醒'}
                  </div>
                  <div className="mt-1 text-[11px] leading-4 text-gray-500/90">
                    正在汇总本轮新触发的低余额站点，请尽快处理。
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/75 text-gray-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-colors duration-200 hover:bg-gray-100 hover:text-gray-600"
                onClick={() => { void closeWindow() }}
                aria-label="关闭提醒"
              >
                <X size={14} />
              </button>
            </div>

            <div className="mt-3 space-y-1.5">
              {visibleItems.length > 0 ? visibleItems.map(item => (
                <div
                  key={item.stationId}
                  className="flex items-center gap-2 rounded-[18px] border border-gray-200/85 bg-white/78 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-bold text-gray-800" title={item.stationName}>
                      {item.stationName || '未命名站点'}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-gray-400">
                      <span>余额 {formatCurrency(item.currentBalance, item.currency)}</span>
                      <span className="text-gray-300">/</span>
                      <span>阈值 {formatCurrency(item.threshold, item.currency)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                    低余额
                  </div>
                </div>
              )) : (
                <div className="rounded-[18px] border border-gray-200/85 bg-white/78 px-3 py-3 text-center text-[11px] font-semibold text-gray-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]">
                  暂无低余额数据
                </div>
              )}
              {hiddenCount > 0 ? (
                <div className="px-1 text-right text-[10px] font-semibold text-gray-400">
                  还有 {hiddenCount} 个站点未展开
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1 rounded-xl border border-gray-200/90 bg-white/85 px-3 text-[11px] font-bold text-gray-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition-colors duration-200 hover:bg-gray-50"
                onClick={() => { void openMainWindow() }}
              >
                <ExternalLink size={12} />
                打开主界面
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-xl bg-[linear-gradient(180deg,#fbbf24_0%,#f59e0b_100%)] px-3.5 text-[11px] font-bold text-white shadow-[0_6px_14px_rgba(245,158,11,0.24)] transition-all duration-200 hover:brightness-[1.03]"
                onClick={() => { void closeWindow() }}
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

createRoot(document.getElementById('low-balance-alert-root')!).render(<LowBalanceAlertApp />)
