import React, { useEffect, useMemo, useState } from 'react'
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
  onAdd: () => void
  onOpen: (id: string) => void
  onReorder: (draggedId: string, targetId: string) => Promise<void>
  onRefresh: (id: string) => void
}

type DragMeta = {
  stationId: string
  width: number
  height: number
  offsetX: number
  offsetY: number
  startX: number
  startY: number
  pointerX: number
  pointerY: number
}

export function Overview({
  stations,
  snapshots,
  totals,
  loading,
  onAdd,
  onOpen,
  onReorder,
  onRefresh
}: OverviewProps) {
  const [searchKeyword, setSearchKeyword] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [blockOpen, setBlockOpen] = useState(false)
  const [pendingDrag, setPendingDrag] = useState<DragMeta | null>(null)
  const [dragPreview, setDragPreview] = useState<Omit<DragMeta, 'stationId' | 'startX' | 'startY'> | null>(null)
  const dragOverIdRef = React.useRef<string | null>(null)
  const shouldShowSearch = stations.length > 8

  useEffect(() => {
    if (!shouldShowSearch && searchKeyword) {
      setSearchKeyword('')
    }
  }, [searchKeyword, shouldShowSearch])

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
      setDraggingId(null)
      setDragOverId(null)
      dragOverIdRef.current = null
      setDragPreview(null)
      return
    }
    const currentDraggingId = draggingId
    setBlockOpen(true)
    setDraggingId(null)
    setDragOverId(null)
    dragOverIdRef.current = null
    setDragPreview(null)
    await onReorder(currentDraggingId, targetId)
    window.setTimeout(() => setBlockOpen(false), 120)
  }

  useEffect(() => {
    if (!draggingId && !pendingDrag) return

    const handleWindowMouseMove = (event: MouseEvent) => {
      if (draggingId) {
        setDragPreview(current => current ? {
          ...current,
          pointerX: event.clientX,
          pointerY: event.clientY
        } : current)
        return
      }

      if (!pendingDrag) return
      const dx = Math.abs(event.clientX - pendingDrag.startX)
      const dy = Math.abs(event.clientY - pendingDrag.startY)
      if (dx + dy < 6) return

      setBlockOpen(true)
      setDraggingId(pendingDrag.stationId)
      dragOverIdRef.current = null
      setDragOverId(null)
      setDragPreview({
        width: pendingDrag.width,
        height: pendingDrag.height,
        offsetX: pendingDrag.offsetX,
        offsetY: pendingDrag.offsetY,
        pointerX: event.clientX,
        pointerY: event.clientY
      })
      setPendingDrag(null)
    }

    const handleWindowMouseUp = () => {
      if (pendingDrag && !draggingId) {
        setPendingDrag(null)
        return
      }

      const targetId = dragOverIdRef.current
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

    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
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

      <div className="flex-1 overflow-auto px-4 pb-3 grid grid-cols-2 gap-2.5 content-start scrollbar-hide stagger-children">
        {stations.length === 0 ? <EmptyState onAdd={onAdd} /> : null}
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
            onDragEnter={() => {
              if (!draggingId || draggingId === station.id) return
              dragOverIdRef.current = station.id
              setDragOverId(station.id)
            }}
            onCardPointerDown={event => {
              if (event.button !== 0) return
              const target = event.target as HTMLElement
              if (target.closest('button, input, textarea, select, label, a')) return
              const card = event.currentTarget
              const rect = card.getBoundingClientRect()
              setPendingDrag({
                stationId: station.id,
                width: rect.width,
                height: rect.height,
                offsetX: event.clientX - rect.left,
                offsetY: event.clientY - rect.top,
                startX: event.clientX,
                startY: event.clientY,
                pointerX: event.clientX,
                pointerY: event.clientY
              })
            }}
            onDrop={async event => {
              event.stopPropagation()
              await handleDrop(station.id)
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
              left: dragPreview.pointerX - dragPreview.offsetX,
              top: dragPreview.pointerY - dragPreview.offsetY,
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
        <div className="px-3 py-2 rounded-xl bg-red-100/80 border border-red-200 text-[11px] font-semibold text-red-600">
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
  onDragEnter,
  onDrop,
  onDragCancel
}: {
  station: Station
  snapshot?: BalanceSnapshot
  loading: boolean
  isDragging: boolean
  isDropTarget: boolean
  onOpen: () => void
  onCardPointerDown: (event: React.MouseEvent<HTMLElement>) => void
  onDragEnter: () => void
  onDrop: (event: React.MouseEvent<HTMLElement>) => void
  onDragCancel: () => void
  onRefresh: () => void
}) {
  const status = snapshot?.status === 'success' ? '正常' : snapshot ? '异常' : '待刷新'
  const low = snapshot?.status === 'success' && snapshot.currentBalance <= station.lowBalanceThreshold
  const failed = snapshot?.status === 'failed'

  return (
    <article
      onClick={onOpen}
      onMouseEnter={onDragEnter}
      onMouseUp={onDrop}
      onMouseDown={onCardPointerDown}
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
        <div className="px-3 py-2 rounded-xl bg-red-100/80 border border-red-200 text-[11px] font-semibold text-red-600">
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
