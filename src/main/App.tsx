import { useEffect, useRef } from 'react'
import { MainHeader } from './components/MainHeader'
import { MainPanels } from './components/MainPanels'
import { MobileOverlays } from './components/MobileOverlays'
import { StationFormLayer } from './components/StationFormLayer'
import { ConfigQrExportDialog } from './components/ConfigQrExportDialog'
import { ConfigQrImportDialog } from './components/ConfigQrImportDialog'
import { useAppShell } from './hooks/useAppShell'

const ENTRANCE_ANIMATION_CLASS = 'animate-main-entrance'

export function App() {
  const {
    entranceKey,
    contentKey,
    contentAnimationClass,
    headerProps,
    panelProps,
    formLayerProps,
    qrExportPlan,
    qrImportOpen,
    onCloseQrExport,
    onCloseQrImport,
    onQrPayloadAssembled
  } = useAppShell()
  const entranceRef = useRef<HTMLDivElement>(null)

  // 重新唤起主窗口时，仅重启外层入场动画的 CSS 关键帧（移除类 → 触发 reflow → 重新加上类），
  // 不卸载/重挂子树，避免与内层 page-in 动画叠加导致的闪烁。
  // entranceKey === 0 时是首次挂载，CSS 类已在 className 中，浏览器会自然播放，无需手动重启。
  useEffect(() => {
    if (entranceKey === 0) return
    const element = entranceRef.current
    if (!element) return
    element.classList.remove(ENTRANCE_ANIMATION_CLASS)
    // 触发一次同步重排，让浏览器把 animation 重置后再加回类名，从而重新播放关键帧
    void element.offsetWidth
    element.classList.add(ENTRANCE_ANIMATION_CLASS)
  }, [entranceKey])

  return (
    <main className="flex flex-col min-h-screen bg-transparent">
      <div
        ref={entranceRef}
        className={`flex-1 flex flex-col bg-white rounded-none shadow-none overflow-hidden ${ENTRANCE_ANIMATION_CLASS}`}
      >
        <MainHeader {...headerProps} />

        <div key={contentKey} className={`flex-1 overflow-hidden flex flex-col ${contentAnimationClass}`}>
          <MainPanels {...panelProps} />
        </div>
      </div>

      <StationFormLayer {...formLayerProps} />
      <MobileOverlays />

      {/* 配置二维码迁移对话框：电脑端展示 / 手机端扫描，二选一在屏幕中央叠层 */}
      {qrExportPlan ? (
        <ConfigQrExportDialog plan={qrExportPlan} onClose={onCloseQrExport} />
      ) : null}
      {qrImportOpen ? (
        <ConfigQrImportDialog
          onAssembled={payload => {
            void onQrPayloadAssembled(payload)
          }}
          onClose={onCloseQrImport}
        />
      ) : null}
    </main>
  )
}
