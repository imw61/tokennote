import { useEffect, useMemo, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Camera, RefreshCw, X } from 'lucide-react'
import { parseQrFrame, QrFrameInbox } from '../../lib/config-transfer-qr'

/**
 * 配置二维码导入对话框（手机端）
 *
 * - 申请后置摄像头权限，构造一个隐藏的 video 元素接收视频流
 * - 在 requestAnimationFrame 循环里把当前帧画到 canvas，再交给 jsQR 解码
 * - 解码到协议帧后送进 `QrFrameInbox`，集齐后回调 `onAssembled(payload)`
 * - 不在这一层做解密：解密继续走 `decryptConfigPayload`，由调用方处理
 */
type ConfigQrImportDialogProps = {
  onAssembled: (payload: string) => void
  onClose: () => void
}

type CameraState =
  | { status: 'starting' }
  | { status: 'streaming' }
  | { status: 'error'; message: string }

export function ConfigQrImportDialog({ onAssembled, onClose }: ConfigQrImportDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const inboxRef = useRef<QrFrameInbox>(new QrFrameInbox())
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const finishedRef = useRef(false)
  const [cameraState, setCameraState] = useState<CameraState>({ status: 'starting' })
  const [progress, setProgress] = useState({ received: 0, total: 0, sessionId: '' as string | null })
  const [warning, setWarning] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState({ status: 'error', message: '当前 WebView 不支持调用摄像头。' })
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // 优先后置摄像头；不可用时浏览器会回退到任意可用源
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        })
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) {
          stream.getTracks().forEach(track => track.stop())
          return
        }
        video.srcObject = stream
        // playsInline + muted 是 iOS / 部分 WebView 自动播放的硬性要求
        video.muted = true
        video.playsInline = true
        await video.play()
        setCameraState({ status: 'streaming' })
        scheduleScan()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        // NotAllowedError / NotFoundError 等都归到一条用户友好的错误
        if (/permission|denied|NotAllowed/i.test(message)) {
          setCameraState({ status: 'error', message: '相机权限被拒绝，请在系统设置里允许 TokenNote 使用相机后重试。' })
        } else if (/NotFound|OverConstrained/i.test(message)) {
          setCameraState({ status: 'error', message: '没有可用的相机设备。' })
        } else {
          setCameraState({ status: 'error', message: `无法启动相机：${message}` })
        }
      }
    }

    void startCamera()

    return () => {
      cancelled = true
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scheduleScan = () => {
    if (finishedRef.current) return
    rafRef.current = requestAnimationFrame(scanFrame)
  }

  const scanFrame = () => {
    if (finishedRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) {
      scheduleScan()
      return
    }
    const width = video.videoWidth
    const height = video.videoHeight
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      scheduleScan()
      return
    }
    context.drawImage(video, 0, 0, width, height)
    let imageData: ImageData
    try {
      imageData = context.getImageData(0, 0, width, height)
    } catch (error) {
      console.error('[ConfigQrImportDialog] getImageData failed', error)
      scheduleScan()
      return
    }
    const result = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    })
    if (result?.data) {
      handleDecoded(result.data)
    }
    scheduleScan()
  }

  const handleDecoded = (raw: string) => {
    const frame = parseQrFrame(raw)
    if (!frame) return
    const inbox = inboxRef.current
    const { accepted, isNewSession } = inbox.ingest(frame)
    if (isNewSession) {
      setWarning('检测到新的扫描会话，已重置之前的进度。')
    } else if (accepted) {
      setWarning(null)
    }
    const info = inbox.sessionInfo
    setProgress({ received: info.received, total: info.total, sessionId: info.sessionId })
    if (inbox.isComplete()) {
      finishedRef.current = true
      // 立刻停掉 raf，避免重复合并
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      inbox
        .assemble()
        .then(payload => {
          onAssembled(payload)
        })
        .catch(error => {
          finishedRef.current = false
          setWarning(`合并失败：${error instanceof Error ? error.message : String(error)}`)
          // 让用户重新扫一次：清空 inbox 进入新一轮
          inbox.reset()
          setProgress({ received: 0, total: 0, sessionId: null })
          scheduleScan()
        })
    }
  }

  const progressPercent = useMemo(() => {
    if (progress.total === 0) return 0
    return Math.round((progress.received / progress.total) * 100)
  }, [progress.received, progress.total])

  const onResetProgress = () => {
    inboxRef.current.reset()
    finishedRef.current = false
    setProgress({ received: 0, total: 0, sessionId: null })
    setWarning(null)
    if (rafRef.current === null) {
      scheduleScan()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative flex w-[440px] max-w-[94vw] flex-col gap-3 rounded-2xl bg-white p-5 shadow-2xl">
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
            <Camera size={16} />
          </span>
          <div className="min-w-0">
            <strong className="text-sm font-extrabold text-gray-900">扫码导入配置</strong>
            <div className="text-[11px] font-semibold text-gray-500">
              请把电脑端「显示二维码」对话框对准相机，无需点击，扫到所有分片后会自动进入解密
            </div>
          </div>
        </div>

        <div className="relative aspect-square overflow-hidden rounded-2xl border border-gray-200 bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />
          {cameraState.status === 'starting' ? (
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white/80">
              正在启动相机…
            </div>
          ) : null}
          {cameraState.status === 'error' ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 px-4 text-center text-xs font-bold leading-relaxed text-white/90">
              {cameraState.message}
            </div>
          ) : null}
        </div>

        {progress.total > 0 ? (
          <div className="space-y-1.5 px-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-500">
              <span>{progress.sessionId ? `会话 ${progress.sessionId}` : '识别中…'}</span>
              <span className="tabular-nums text-gray-700">
                {progress.received} / {progress.total} · {progressPercent}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-primary-500 transition-[width] duration-200 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        ) : null}

        {warning ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            {warning}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-extrabold text-gray-600 transition-all duration-200 hover:bg-gray-100 interactive-bounce"
            onClick={onResetProgress}
            disabled={progress.total === 0}
          >
            <RefreshCw size={12} />
            重新扫描
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-1.5 text-[11px] font-extrabold text-white transition-all duration-200 hover:bg-gray-700 interactive-bounce"
            onClick={onClose}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
