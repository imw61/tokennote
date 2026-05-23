import React, { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { GripVertical, Plus, RefreshCw, Search, WalletCards, X } from 'lucide-react'
import type { BalanceSnapshot, OverviewTotals, Station } from '../types'
import {
  formatCurrency,
  formatInt,
  formatTime,
  normCurrency,
  stationTypeLabel,
  stationUserFallback
} from '../utils'

type OverviewProps = {
  stations: Station[]
  snapshots: Record<string, BalanceSnapshot>
  totals: OverviewTotals
  loading: boolean
  /**
   * 首次 `get_app_data` 是否已经返回。安卓冷启动比桌面慢得多，在 IPC 第一次往返
   * 完成前 stations 还是初始空数组，如果直接展示"还没有监控站点"会让用户误以为
   * 配置被清掉；下拉/点击刷新走的是 `refresh_all`，那一次会把数据一起带回来，
   * 这就是"刷新后才显示站点"的根因。
   */
  initialLoaded: boolean
  onAdd: () => void
  onOpen: (id: string) => void
  onReorder: (draggedId: string, targetId: string) => Promise<void>
  onRefresh: (id: string) => void
  /**
   * 安卓端首页下拉刷新：触发后立即解除手势状态、不展示外露的"下拉条"动画，
   * 仅在 header 现有 loading icon 上反映异步刷新进度。桌面端可以传同一个回调，
   * 但实际上下拉手势在桌面 mouse 场景不会被触发。
   */
  onRefreshAll: () => void
}

type DragMeta = {
  stationId: string
  pointerId: number
  pointerType: 'mouse' | 'touch' | 'pen' | string
  width: number
  height: number
  offsetX: number
  offsetY: number
  startX: number
  startY: number
  pointerX: number
  pointerY: number
  /** 触屏长按计时器；超过阈值后才把"待拖拽"提升为"拖拽中"，避免误触阻断页面滚动 */
  longPressTimer: number | null
  /** 长按计时器是否已经触发 */
  longPressArmed: boolean
}

type DragPreviewMeta = {
  width: number
  height: number
  offsetX: number
  offsetY: number
  pointerX: number
  pointerY: number
}

/** 触屏长按的等待时间，与 Material Design 推荐 250ms 对齐 */
const TOUCH_LONG_PRESS_MS = 250
/** 鼠标按下后多远开始拖拽；触屏在长按未到点前用同样阈值取消拖拽，让出滚动 */
const DRAG_TRIGGER_DISTANCE = 8

export function Overview({
  stations,
  snapshots,
  totals,
  loading,
  initialLoaded,
  onAdd,
  onOpen,
  onReorder,
  onRefresh,
  onRefreshAll
}: OverviewProps) {
  const [searchKeyword, setSearchKeyword] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [blockOpen, setBlockOpen] = useState(false)
  const [pendingDrag, setPendingDrag] = useState<DragMeta | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreviewMeta | null>(null)
  const dragOverIdRef = React.useRef<string | null>(null)
  // 拖拽态的镜像 ref:供文档级 touchmove 非被动监听器同步访问,避免每次状态变化重新注册。
  const draggingIdRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    draggingIdRef.current = draggingId
  }, [draggingId])

  // 关键:Android WebView 上 `touch-action` 在 touchstart 那一刻就已固化,
  // 后面再把卡片的 `touch-action` 切到 `none` 对当前这次触摸不生效;
  // 而 PointerEvent.preventDefault 在多个 WebView 版本上压不住底层的滚动决策——
  // 一旦浏览器认定这次手势是"竖向滚动",会立即派发 pointercancel,把拖拽态清掉,
  // 表现就是用户竖向拖一下,拟态预览瞬间消失。
  //
  // 解法:在 document 上挂一个 `passive: false` 的 `touchmove` 监听器。只要从挂载起
  // 就存在非被动监听器,WebView 在 touchstart 阶段就不会做"假定可滚"的快速路径优化,
  // 等到我们在监听器里 `preventDefault()`,就能在第一次 touchmove 把滚动彻底压住,
  // 不再触发 pointercancel,拖拽预览也不会丢。
  React.useEffect(() => {
    const handler = (event: TouchEvent) => {
      if (!draggingIdRef.current) return
      // 仅在拖拽进行中阻止默认滚动;非拖拽阶段 passive: false 监听器只会"被注册",
      // 不会改变浏览器对滚动的处理(因为我们不调用 preventDefault)。
      if (event.cancelable) {
        event.preventDefault()
      }
    }
    document.addEventListener('touchmove', handler, { passive: false })
    return () => {
      document.removeEventListener('touchmove', handler)
    }
  }, [])

  // 网格容器是否真的溢出（内容高度 > 容器高度）。
  // 之前用 `stations.length > 6` 的静态阈值不准：手机屏幕短、桌面屏幕高、字体也不同。
  // 改成实测：用 ResizeObserver 监听容器与子元素尺寸，溢出才允许滚动；不溢出时关掉
  // overflow-y 以避免触屏的橡皮筋反弹。
  const gridContainerRef = React.useRef<HTMLDivElement | null>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const shouldShowSearch = stations.length > 8

  useEffect(() => {
    if (!shouldShowSearch && searchKeyword) {
      setSearchKeyword('')
    }
  }, [searchKeyword, shouldShowSearch])

  // 用 ResizeObserver 实测网格是否溢出。同时观察容器自身尺寸（视口/工具栏变化）
  // 与第一个子元素之外的整体 scrollHeight 变化（通过 element.scrollHeight 重新比较）。
  useEffect(() => {
    const node = gridContainerRef.current
    if (!node) return
    if (typeof ResizeObserver === 'undefined') {
      // 兜底：浏览器没有 ResizeObserver，直接按内容长度估计是否会溢出。
      setIsOverflowing(stations.length > 6)
      return
    }
    const evaluate = () => {
      // 在 overflow 关闭的状态下 clientHeight 仍然代表可视高度，scrollHeight 代表内容高度。
      // hidden 模式下 scrollHeight 仍会反映真实需要的高度，所以可以放心比较。
      setIsOverflowing(node.scrollHeight - node.clientHeight > 1)
    }
    const observer = new ResizeObserver(() => evaluate())
    observer.observe(node)
    // 子元素尺寸变化（站点新增 / 删除 / 文案换行）时也要重测。
    Array.from(node.children).forEach(child => {
      if (child instanceof HTMLElement) observer.observe(child)
    })
    evaluate()
    return () => observer.disconnect()
  }, [stations, snapshots, searchKeyword])

  const balanceLines = useMemo(() => {
    const entries = Object.entries(totals.currencyBalances).map(([symbol, balance]) => ({
      symbol,
      value: balance.toFixed(2)
    }))
    return entries.length > 0 ? entries : [{ symbol: '$', value: '--' }]
  }, [totals.currencyBalances])

  const consumptionLines = useMemo(() => {
    const entries = Object.entries(totals.historicalConsumptions).map(([symbol, value]) => ({
      symbol,
      value: value.toFixed(2)
    }))
    return entries.length > 0 ? entries : [{ symbol: '$', value: '--' }]
  }, [totals.historicalConsumptions])

  const warningTone = totals.warning > 0 ? 'warn' as const : 'good' as const
  const normalizedKeyword = searchKeyword.trim().toLowerCase()

  const visibleStations = useMemo(() => {
    if (!normalizedKeyword) return stations
    return stations.filter(station => {
      const snapshot = snapshots[station.id]
      const candidates = [
        station.name,
        station.baseUrl,
        snapshot?.username ?? '',
        stationTypeLabel(station.stationType)
      ]
      return candidates.some(candidate => candidate.toLowerCase().includes(normalizedKeyword))
    })
  }, [normalizedKeyword, snapshots, stations])

  const draggedStation = draggingId
    ? stations.find(station => station.id === draggingId) || null
    : null
  const draggedSnapshot = draggingId ? snapshots[draggingId] : undefined

  const handleDrop = async (targetId: string) => {
    if (!draggingId || draggingId === targetId) {
      flushSync(() => {
        setDraggingId(null)
        setDragOverId(null)
        setDragPreview(null)
      })
      dragOverIdRef.current = null
      return
    }
    const currentDraggingId = draggingId
    setBlockOpen(true)

    // 关键:把"乐观换序"和"清拖拽态"用 flushSync 强行打包到同一次 React commit。
    //
    // 没有 flushSync 时,事件链路是:
    //   pointerup → handleDrop → onReorder() 同步部分调用 setData(乐观换序)
    //                            ↓
    //                            return Promise(还在 pending)
    //                          setDraggingId(null) / setDragPreview(null)
    //                            ↓
    //                          React 18 大多数时候会自动 batch 这两次 setState,
    //                          但在 PointerEvent 回调链 + setPointerCapture 释放
    //                          交错的边缘场景下,偶尔会被切成两次 commit:
    //                            commit A:拟态消失,stations 还是旧顺序 → 用户看到"回到原位"一帧
    //                            commit B:stations 切到新顺序
    //
    // flushSync 强制把回调里所有 setState(包括 onReorder 内部那一行同步 setData
    // 触发的更新)一次性提交,下一帧用户看到的必然是"卡片已就位 + 拟态消失",
    // 任何调度抖动都不会再撕成两帧。
    //
    // onReorder 返回的 Promise 仍然带着后续 IPC 等待——我们继续 await,但只用来
    // 收尾 blockOpen,不再影响视觉同步性。
    let reorderPromise: Promise<void> = Promise.resolve()
    flushSync(() => {
      reorderPromise = onReorder(currentDraggingId, targetId)
      setDraggingId(null)
      setDragOverId(null)
      setDragPreview(null)
    })
    dragOverIdRef.current = null

    try {
      await reorderPromise
    } catch (error) {
      console.error('[Overview] onReorder failed', error)
    } finally {
      window.setTimeout(() => setBlockOpen(false), 120)
    }
  }

  useEffect(() => {
    if (!draggingId && !pendingDrag) return

    const resolveDropTargetId = (clientX: number, clientY: number): string | null => {
      // 触屏环境下 pointerenter 事件在指针被原始元素 capture 时不会跨元素触发，
      // 因此必须用 elementsFromPoint 主动找一下"指针下方"是哪张站点卡片。
      if (typeof document === 'undefined' || !document.elementsFromPoint) return null
      const candidates = document.elementsFromPoint(clientX, clientY)
      for (const candidate of candidates) {
        if (!(candidate instanceof HTMLElement)) continue
        const card = candidate.closest('[data-station-id]') as HTMLElement | null
        if (card) {
          return card.dataset.stationId || null
        }
      }
      return null
    }

    const handleWindowPointerMove = (event: PointerEvent) => {
      if (pendingDrag && event.pointerId !== pendingDrag.pointerId) return

      if (draggingId) {
        // 拖拽中阻止默认行为，避免触屏被解释为页面滚动；
        // event.cancelable 在 capture-phase 之外不可保证为 true，故双保险。
        if (event.cancelable) event.preventDefault()
        setDragPreview(current => current ? {
          ...current,
          pointerX: event.clientX,
          pointerY: event.clientY
        } : current)
        const targetId = resolveDropTargetId(event.clientX, event.clientY)
        if (targetId !== dragOverIdRef.current) {
          dragOverIdRef.current = targetId
          setDragOverId(targetId)
        }
        return
      }

      if (!pendingDrag) return
      const dx = Math.abs(event.clientX - pendingDrag.startX)
      const dy = Math.abs(event.clientY - pendingDrag.startY)

      // 触屏：长按未到点前若手指已移动一定距离，视为滚动手势，取消"待拖拽"。
      if (pendingDrag.pointerType === 'touch' && !pendingDrag.longPressArmed) {
        if (dx + dy >= DRAG_TRIGGER_DISTANCE) {
          if (pendingDrag.longPressTimer !== null) {
            window.clearTimeout(pendingDrag.longPressTimer)
          }
          setPendingDrag(null)
          return
        }
        // 触屏在长按到点前不进入拖拽，留给 setTimeout 触发。
        return
      }

      if (dx + dy < DRAG_TRIGGER_DISTANCE) return

      // 鼠标 / 笔：直接进入拖拽
      setBlockOpen(true)
      setDraggingId(pendingDrag.stationId)
      dragOverIdRef.current = null
      setDragOverId(null)
      // 指尖永远落在卡片正中：用 width/2、height/2 作为 offset，渲染时 left = pointerX - offsetX
      // 就把卡片中心绑定到指尖位置，避免"卡片在点击点下方一截"的体感问题。
      setDragPreview({
        width: pendingDrag.width,
        height: pendingDrag.height,
        offsetX: pendingDrag.width / 2,
        offsetY: pendingDrag.height / 2,
        pointerX: event.clientX,
        pointerY: event.clientY
      })
      setPendingDrag(null)
    }

    const handleWindowPointerUp = (event: PointerEvent) => {
      if (pendingDrag && event.pointerId !== pendingDrag.pointerId) return
      if (draggingId && pendingDrag === null) {
        // 普通流程下 draggingId 已经存在；继续走 drop 逻辑
      }

      if (pendingDrag && pendingDrag.longPressTimer !== null) {
        window.clearTimeout(pendingDrag.longPressTimer)
      }

      if (pendingDrag && !draggingId) {
        setPendingDrag(null)
        return
      }

      const targetId = dragOverIdRef.current
        ?? resolveDropTargetId(event.clientX, event.clientY)
      if (targetId && targetId !== draggingId) {
        void handleDrop(targetId)
        return
      }

      setDraggingId(null)
      setDragOverId(null)
      dragOverIdRef.current = null
      setDragPreview(null)
      window.setTimeout(() => setBlockOpen(false), 0)
    }

    const handleWindowPointerCancel = () => {
      if (pendingDrag && pendingDrag.longPressTimer !== null) {
        window.clearTimeout(pendingDrag.longPressTimer)
      }
      setDraggingId(null)
      setDragOverId(null)
      dragOverIdRef.current = null
      setDragPreview(null)
      setPendingDrag(null)
      window.setTimeout(() => setBlockOpen(false), 0)
    }

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false })
    window.addEventListener('pointerup', handleWindowPointerUp)
    window.addEventListener('pointercancel', handleWindowPointerCancel)
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', handleWindowPointerUp)
      window.removeEventListener('pointercancel', handleWindowPointerCancel)
    }
  }, [draggingId, pendingDrag])

  return (
    <>
      <div className="grid grid-cols-5 gap-2 px-4 pb-2 stagger-children">
        <SummaryTile label="站点" value={String(stations.length)} tone="neutral" />
        <SummaryTile label="余额" values={balanceLines} tone={warningTone} />
        <SummaryTile label="历史消耗" values={consumptionLines} tone="neutral" />
        <SummaryTile label="请求" value={formatInt(totals.requests)} tone="neutral" />
        <SummaryActionTile label="添加中转站" icon={<Plus size={15} />} onClick={onAdd} />
      </div>

      {shouldShowSearch ? (
        <div className="px-4 pb-2">
          <label className="flex items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3 py-2 shadow-sm">
            <Search size={14} className="text-gray-400" />
            <input
              value={searchKeyword}
              onChange={event => setSearchKeyword(event.target.value)}
              placeholder="搜索站点名、地址、用户名或类型"
              className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
            />
            {searchKeyword ? (
              <button
                type="button"
                onClick={() => setSearchKeyword('')}
                className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition-all duration-200 hover:bg-gray-100 hover:text-gray-600"
                aria-label="清空搜索"
              >
                <X size={12} />
              </button>
            ) : null}
          </label>
        </div>
      ) : null}

      {/*
        网格容器：
        - 仅当容器真的"内容高度 > 视口高度"时才允许滚动；不溢出则用 overflow-y-hidden +
          overscroll-none 关掉触屏的橡皮筋拉动。
        - 滚动条统一用 .scrollbar-hide 不显示。
        - `isOverflowing` 由 ResizeObserver 在 useEffect 里实测得出，不再依赖固定阈值。
      */}
      <div
        ref={gridContainerRef}
        className={`flex-1 px-4 pb-3 grid grid-cols-2 gap-2.5 content-start stagger-children ${
          isOverflowing
            ? 'overflow-y-auto scrollbar-hide'
            : 'overflow-y-hidden overscroll-none'
        }`}
      >
        {!initialLoaded && stations.length === 0 ? <InitialLoadingState /> : null}
        {initialLoaded && stations.length === 0 ? <EmptyState onAdd={onAdd} /> : null}
        {stations.length > 0 && visibleStations.length === 0 ? <SearchEmptyState keyword={searchKeyword} /> : null}
        {visibleStations.map(station => (
          <StationCard
            key={station.id}
            station={station}
            snapshot={snapshots[station.id]}
            isDragging={draggingId === station.id}
            isDropTarget={dragOverId === station.id && draggingId !== station.id}
            loading={loading}
            onOpen={() => {
              if (blockOpen || draggingId) return
              onOpen(station.id)
            }}
            onDragCancel={() => {
              setDraggingId(null)
              setDragOverId(null)
              dragOverIdRef.current = null
              setDragPreview(null)
              window.setTimeout(() => setBlockOpen(false), 0)
            }}
            onCardPointerDown={event => {
              if (event.button !== 0) return
              const target = event.target as HTMLElement
              if (target.closest('button, input, textarea, select, label, a')) return
              const card = event.currentTarget
              const rect = card.getBoundingClientRect()
              const pointerType = event.pointerType || 'mouse'
              const capturedPointerId = event.pointerId

              // 触屏：先创建 pending，启动长按计时器；超过阈值才提升为 dragging。
              // 计时期间手指若移动超过 DRAG_TRIGGER_DISTANCE 会在 pointermove 中取消，让出滚动。
              const longPressTimer = pointerType === 'touch'
                ? window.setTimeout(() => {
                    setPendingDrag(current => {
                      if (!current || current.stationId !== station.id) return current
                      // 标记长按已满足；下一次 pointermove 会把 pending 推升为 dragging。
                      // 这里不能直接 setDraggingId，因为我们没有 PointerEvent 实例。
                      return {
                        ...current,
                        longPressArmed: true
                      }
                    })
                    setBlockOpen(true)
                    setDraggingId(prev => prev ?? station.id)
                    // 触屏长按：让指尖始终落在预览卡片正中央，
                    // 不再使用 pointerdown 时的相对偏移（那会让卡片明显偏离指尖、压在下方）。
                    setDragPreview({
                      width: rect.width,
                      height: rect.height,
                      offsetX: rect.width / 2,
                      offsetY: rect.height / 2,
                      pointerX: event.clientX,
                      pointerY: event.clientY
                    })
                    // 关键：长按到点后立刻把 pointer capture 拿到卡片自己身上。
                    // 触屏默认会按 touch-action 解释竖向移动为滚动；setPointerCapture 之后
                    // 系统会把后续 pointermove 一律 dispatch 给卡片元素 / 不再走默认滚动手势，
                    // 让卡片可以"任意方向"拖动（包括上下）。
                    try {
                      if (typeof card.setPointerCapture === 'function' && capturedPointerId !== -1) {
                        card.setPointerCapture(capturedPointerId)
                      }
                    } catch (error) {
                      // capture 失败不阻塞拖拽，pointer events 在桌面端通常用不到这一步
                      console.warn('[StationCard] setPointerCapture failed', error)
                    }
                  }, TOUCH_LONG_PRESS_MS)
                : null

              setPendingDrag({
                stationId: station.id,
                pointerId: event.pointerId,
                pointerType,
                width: rect.width,
                height: rect.height,
                offsetX: event.clientX - rect.left,
                offsetY: event.clientY - rect.top,
                startX: event.clientX,
                startY: event.clientY,
                pointerX: event.clientX,
                pointerY: event.clientY,
                longPressTimer,
                longPressArmed: false
              })
            }}
            onRefresh={() => onRefresh(station.id)}
          />
        ))}
      </div>

      {draggingId && draggedStation && dragPreview ? (
        <div className="fixed inset-0 pointer-events-none z-50">
          <div
            className="absolute"
            style={{
              width: dragPreview.width,
              // 关键：用 left/top 把指尖位置当作锚点，再用 translate(-50%, -50%) 把
              // "本元素自身实际渲染出来的盒子"中心移到锚点上。这样无论预览的真实高度
              // 比捕获时的 rect.height 大多少（StationDragPreview 内部的 padding / gap
              // 与原卡片不同，外加 transform: scale(...) 会让视觉中心略偏），都能保证
              // 卡片中心严格跟随指尖，不再"压在指尖下方"或"偏离上方"。
              left: dragPreview.pointerX,
              top: dragPreview.pointerY,
              transform: 'translate(-50%, -50%)',
              filter: 'drop-shadow(0 22px 40px rgba(15, 23, 42, 0.22))'
            }}
          >
            <StationDragPreview station={draggedStation} snapshot={draggedSnapshot} />
          </div>
        </div>
      ) : null}
    </>
  )
}

function StationDragPreview({ station, snapshot }: { station: Station; snapshot?: BalanceSnapshot }) {
  const status = snapshot?.status === 'success' ? '正常' : snapshot ? '异常' : '待刷新'
  const low = snapshot?.status === 'success' && snapshot.currentBalance <= station.lowBalanceThreshold
  const failed = snapshot?.status === 'failed'

  return (
    <div
      className={`flex flex-col gap-3 p-3.5 rounded-xl border shadow-2xl backdrop-blur-sm ${
        failed ? 'border-red-200 bg-red-50/95' : low ? 'border-amber-200 bg-amber-50/95' : 'border-gray-100 bg-white/96'
      } animate-[float-soft_3.6s_ease-in-out_infinite]`}
      style={{
        transform: 'rotate(2deg) scale(1.035)',
        boxShadow: '0 18px 34px rgba(15, 23, 42, 0.14), 0 6px 14px rgba(59, 130, 246, 0.10)'
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${failed ? 'bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.15)]' : low ? 'bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.15)]' : 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]'}`} />
            <strong className="text-sm font-extrabold text-gray-900 tracking-[-0.02em] truncate">{station.name}</strong>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium min-w-0">
            <span className="truncate">{snapshot?.username || stationUserFallback(station.stationType)}</span>
            <span className="text-gray-200">|</span>
            <span className="flex-shrink-0">{status}</span>
            <span className="text-gray-200">|</span>
            <span className="flex-shrink-0">{formatTime(snapshot?.fetchedAt || 0)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <GripVertical size={14} className="text-gray-300" />
          <span className="px-1.5 py-0.5 rounded-md bg-primary-50 text-[9px] font-bold text-primary-500">
            {stationTypeLabel(station.stationType)}
          </span>
        </div>
      </div>

      {failed ? (
        <div className="px-3 py-2 rounded-xl bg-red-100/80 border border-red-200 text-[10px] font-semibold text-red-600">
          {snapshot!.errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-1.5 mt-1">
        <div className="flex flex-col gap-0.5 p-2 bg-gray-50/80 rounded-lg min-w-0">
          <span className="text-[10px] font-bold text-gray-400">余额</span>
          <b className="text-sm font-extrabold text-gray-900 tracking-[-0.02em] truncate">
            {snapshot ? formatCurrency(snapshot.currentBalance, normCurrency(snapshot.currency)) : '--'}
          </b>
        </div>
        <div className="flex flex-col gap-0.5 p-2 bg-gray-50/80 rounded-lg min-w-0">
          <span className="text-[10px] font-bold text-gray-400">请求</span>
          <b className="text-sm font-extrabold text-gray-700 tracking-[-0.02em] truncate">
            {snapshot ? formatInt(snapshot.requestCount) : '--'}
          </b>
        </div>
      </div>
    </div>
  )
}

function SummaryTile({
  label,
  value,
  values,
  tone,
  extra
}: {
  label: string
  value?: string
  values?: { symbol: string; value: string }[]
  tone: 'neutral' | 'good' | 'warn' | 'bad'
  extra?: string
}) {
  const toneColor = label === '余额'
    ? 'text-gray-900'
    : tone === 'good' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : tone === 'bad' ? 'text-red-500' : 'text-gray-900'

  return (
    <div className="flex flex-col gap-1 p-2.5 bg-gray-50 rounded-xl border border-gray-100 animate-pop-in card-hover-lift">
      <span className="text-[10px] font-bold text-gray-400">{label}</span>
      {values ? values.map(item => (
        <div key={item.symbol} className="flex items-baseline gap-0.5">
          <span className="text-[9px] font-bold text-gray-400">{item.symbol}</span>
          <strong className={`text-xs font-extrabold tracking-[-0.03em] truncate ${toneColor}`}>{item.value}</strong>
        </div>
      )) : <strong className={`text-sm font-extrabold tracking-[-0.03em] truncate ${toneColor}`}>{value}</strong>}
      {extra ? <span className="text-[9px] font-bold text-gray-400 mt-0.5">{extra}</span> : null}
    </div>
  )
}

function SummaryActionTile({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 p-2.5 bg-white/90 hover:bg-primary-50 text-primary-600 rounded-xl border border-primary-100 transition-all duration-200 hover:scale-[1.01] hover:shadow-lg animate-pop-in interactive-bounce"
    >
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary-50 text-primary-500">
        {icon}
      </span>
      <span className="text-[11px] font-extrabold tracking-[-0.02em] leading-none text-center">{label}</span>
    </button>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="col-span-2 flex flex-col items-center gap-3 py-10 px-4 text-center bg-gray-50 rounded-2xl border border-gray-100 animate-pop-in card-hover-lift">
      <WalletCards size={28} className="text-primary-400" />
      <h2 className="text-base font-extrabold text-gray-900">还没有监控站点</h2>
      <p className="text-xs text-gray-400 leading-relaxed">添加中转站后，这里只显示余额、请求和状态摘要，点击卡片再看详情。</p>
      <button
        onClick={onAdd}
        className="px-5 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-sm font-extrabold transition-all duration-200 hover:scale-[1.02] hover:shadow-lg interactive-bounce"
      >
        立即添加
      </button>
    </div>
  )
}

/**
 * 首次 IPC 还没回来时的占位。安卓冷启动这一段最长会出现几百毫秒空白，
 * 之前会被 `EmptyState` 抢着渲染成"还没有监控站点"。这里换成一个克制的骨架，
 * 既避免让用户误以为数据丢失，也不会和真正的空态冲突。
 */
function InitialLoadingState() {
  return (
    <div className="col-span-2 flex flex-col items-center justify-center gap-2 py-10 px-4 text-center" aria-busy="true" aria-live="polite">
      <RefreshCw size={22} className="text-gray-300 animate-spin" />
      <span className="text-xs font-bold text-gray-400">正在加载站点…</span>
    </div>
  )
}

function SearchEmptyState({ keyword }: { keyword: string }) {
  return (
    <div className="col-span-2 flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white px-4 py-8 text-center shadow-sm">
      <Search size={22} className="text-gray-300" />
      <div className="text-sm font-extrabold text-gray-700">未找到匹配站点</div>
      <div className="text-xs text-gray-400">当前关键字：{keyword.trim()}</div>
    </div>
  )
}

function StationCard({
  station,
  snapshot,
  loading,
  isDragging,
  isDropTarget,
  onOpen,
  onRefresh,
  onCardPointerDown,
  onDragCancel
}: {
  station: Station
  snapshot?: BalanceSnapshot
  loading: boolean
  isDragging: boolean
  isDropTarget: boolean
  onOpen: () => void
  onCardPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  onDragCancel: () => void
  onRefresh: () => void
}) {
  const status = snapshot?.status === 'success' ? '正常' : snapshot ? '异常' : '待刷新'
  const low = snapshot?.status === 'success' && snapshot.currentBalance <= station.lowBalanceThreshold
  const failed = snapshot?.status === 'failed'

  return (
    <article
      data-station-id={station.id}
      onClick={onOpen}
      onPointerDown={onCardPointerDown}
      style={{
        // 触屏手势分流:
        // - 默认 `pan-y`:短滑允许浏览器把竖向滚动手势透传给祖先 grid 容器,
        //   保证整列卡片可以正常上下滑(否则像现在一样:屏幕几乎被卡片覆盖,
        //   手指落在卡片上时 `none` 会把滚动手势全部吞掉,用户根本下滑不到下面的卡片)。
        // - 真正进入拖拽状态(`isDragging`)后切到 `none`:此时 onCardPointerDown
        //   里已经走过 `setPointerCapture`,后续 pointer 事件由 JS 独占,不会被
        //   浏览器手势识别截胡,卡片可以任意方向(包括竖向)被拖动。
        // - 250ms 长按计时期间:如果手指已经开始竖向滑,window 上的 pointermove /
        //   pointercancel 处理器会清掉 longPressTimer(见上方 useEffect),
        //   滚动手势继续走浏览器,这时拖拽根本不会启动。
        touchAction: isDragging ? 'none' : 'pan-y'
      }}
      className={`relative flex flex-col gap-2.5 p-3 bg-white rounded-xl shadow-sm border transition-all duration-200 hover:shadow-md hover:scale-[1.01] cursor-grab active:cursor-grabbing animate-fade-up card-hover-lift ${
        isDropTarget
          ? 'border-primary-300 bg-primary-50/60'
          : failed ? 'border-red-200 bg-red-50/50'
          : low ? 'border-amber-200 bg-amber-50/50'
          : 'border-gray-100'
      } ${isDragging ? 'opacity-60 scale-[0.99]' : ''} ${
        isDropTarget ? 'shadow-[0_0_0_2px_rgba(59,130,246,0.12)]' : ''
      }`}
    >
      <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-1">
          <span className="px-1.5 py-0.5 rounded-md bg-primary-50 text-[9px] font-bold text-primary-500">
            {stationTypeLabel(station.stationType)}
          </span>
          <button
            onClick={event => {
              event.stopPropagation()
              onRefresh()
            }}
            className="w-5 h-5 flex items-center justify-center rounded-md bg-white/80 border border-gray-200 hover:bg-primary-50 hover:border-primary-200 text-gray-400 hover:text-primary-600 transition-all duration-200"
            aria-label="刷新"
          >
            <RefreshCw size={10} className={loading ? 'animate-spin-slow' : ''} />
          </button>
        </div>
      </div>
      {isDragging ? (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation()
            onDragCancel()
          }}
          className="absolute bottom-3 right-3 w-7 h-7 flex items-center justify-center rounded-[10px] bg-white/85 border border-gray-200 hover:bg-red-50 hover:border-red-200 text-gray-400 hover:text-red-500 transition-all duration-200 interactive-bounce"
          title="取消拖动"
          aria-label="取消拖动"
        >
          <X size={12} />
        </button>
      ) : null}
      <div className="flex flex-col gap-1 min-w-0 pr-16">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${failed ? 'bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.15)]' : low ? 'bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.15)]' : 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]'}`} />
          <strong className="text-sm font-extrabold text-gray-900 tracking-[-0.02em] truncate">{station.name}</strong>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium min-w-0 whitespace-nowrap">
          <span
            className="truncate flex-1 min-w-[56px]"
            title={snapshot?.username || stationUserFallback(station.stationType)}
          >
            {snapshot?.username || stationUserFallback(station.stationType)}
          </span>
          <span className="text-gray-200 flex-shrink-0">|</span>
          <span className="flex-shrink-0">{status}</span>
          <span className="text-gray-200 flex-shrink-0">|</span>
          <span className="flex-shrink-0 tabular-nums">{formatTime(snapshot?.fetchedAt || 0)}</span>
        </div>
      </div>

      {failed ? (
        <div className="px-3 py-2 rounded-xl bg-red-100/80 border border-red-200 text-[10px] font-semibold text-red-600">
          {snapshot!.errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-1.5 mt-1">
        <div className="flex flex-col gap-0.5 p-2 bg-gray-50/80 rounded-lg min-w-0">
          <span className="text-[10px] font-bold text-gray-400">余额</span>
          <b className="text-sm font-extrabold text-gray-900 tracking-[-0.02em] truncate">
            {snapshot ? formatCurrency(snapshot.currentBalance, normCurrency(snapshot.currency)) : '--'}
          </b>
        </div>
        <div className="flex flex-col gap-0.5 p-2 bg-gray-50/80 rounded-lg min-w-0">
          <span className="text-[10px] font-bold text-gray-400">请求</span>
          <b className="text-sm font-extrabold text-gray-700 tracking-[-0.02em] truncate">
            {snapshot ? formatInt(snapshot.requestCount) : '--'}
          </b>
        </div>
      </div>
    </article>
  )
}
