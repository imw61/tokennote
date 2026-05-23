import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Pause, Play, RefreshCw, Smartphone, X } from 'lucide-react'
import type { QrFramePlan } from '../../lib/config-transfer-qr'

/**
 * 配置二维码导出对话框（电脑端）
 *
 * - 输入：已经准备好的 `QrFramePlan`（由调用方完成 6 位密钥加密 + 分片）
 * - 行为：自适应大小渲染 QR、按固定间隔切下一帧、提供暂停 / 重置 / 关闭
 * - 不在这个组件里再加密：加密由调用方完成，组件只负责"循环展示二维码"
 */
type ConfigQrExportDialogProps = {
  plan: QrFramePlan
  onClose: () => void
}

const FRAME_INTERVAL_MS = 220
const QR_PIXEL_SIZE = 320

export function ConfigQrExportDialog({ plan, onClose }: ConfigQrExportDialogProps) {
  const [frameIndex, setFrameIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // 当 plan 变化（重新发起一次导出）时重置进度。
  useEffect(() => {
    setFrameIndex(0)
    setPaused(false)
  }, [plan])

  // 自动轮播：每隔 FRAME_INTERVAL_MS 切到下一帧；暂停时停止。
  useEffect(() => {
    if (paused) return
    if (plan.total <= 1) return
    const timer = window.setInterval(() => {
      setFrameIndex(current => (current + 1) % plan.total)
    }, FRAME_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [paused, plan.total])

  // 把当前帧渲染到 canvas。byte 模式 + ECC M，兼顾容量与识别率。
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const text = plan.frames[frameIndex] ?? ''
    QRCode.toCanvas(canvas, text, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: QR_PIXEL_SIZE,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF'
      }
    }).catch(error => {
      console.error('[ConfigQrExportDialog] QR render failed', error)
    })
  }, [plan, frameIndex])

  const progressPercent = useMemo(() => {
    if (plan.total === 0) return 0
    return Math.round(((frameIndex + 1) / plan.total) * 100)
  }, [frameIndex, plan.total])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative flex w-[420px] max-w-[92vw] flex-col gap-4 rounded-2xl bg-white p-6 shadow-2xl">
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-all duration-200 hover:bg-gray-100 hover:text-gray-700"
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
            <Smartphone size={16} />
          </span>
          <div className="min-w-0">
            <strong className="text-sm font-extrabold text-gray-900">扫码导入到手机</strong>
            <div className="text-[11px] font-semibold text-gray-500">
              请使用手机端 TokenNote 的「扫码导入」功能持续扫描下方二维码
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <canvas
            ref={canvasRef}
            width={QR_PIXEL_SIZE}
            height={QR_PIXEL_SIZE}
            className="rounded-xl bg-white shadow-sm"
          />
          <div className="w-full space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-500">
              <span>会话 {plan.sessionId}</span>
              <span className="tabular-nums text-gray-700">
                第 {frameIndex + 1} / {plan.total} 帧 · {progressPercent}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-primary-500 transition-[width] duration-200 ease-linear"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-[11px] leading-relaxed text-amber-800">
          二维码内容已使用刚刚输入的 6 位密钥加密。手机端扫描收齐所有分片后，需要输入相同的密钥才能解密导入。请在结束前不要切换或锁屏。
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-extrabold text-gray-600 transition-all duration-200 hover:bg-gray-100 interactive-bounce"
            onClick={() => setFrameIndex(0)}
          >
            <RefreshCw size={12} />
            重新开始
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-extrabold text-gray-600 transition-all duration-200 hover:bg-gray-100 interactive-bounce"
            onClick={() => setPaused(value => !value)}
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
            {paused ? '继续' : '暂停'}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary-500 px-3 py-1.5 text-[11px] font-extrabold text-white transition-all duration-200 hover:bg-primary-600 interactive-bounce"
            onClick={onClose}
          >
            完成
          </button>
        </div>
      </div>
    </div>
  )
}
