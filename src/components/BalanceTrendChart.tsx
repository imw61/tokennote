import { useMemo, useState } from 'react'

export type BalanceTrendPoint = {
  fetchedAt: number
  balance: number
}

export function BalanceTrendChart({ points, height = 84, stroke = '#3b82f6', valueFormatter }: {
  points: BalanceTrendPoint[]
  height?: number
  stroke?: string
  valueFormatter?: (value: number) => string
}) {
  const viewWidth = 260
  const paddingX = 10
  const paddingY = 10

  const series = useMemo(() => {
    const cleaned = points
      .filter(p => Number.isFinite(p.balance) && Number.isFinite(p.fetchedAt))
      .sort((a, b) => a.fetchedAt - b.fetchedAt)
    if (cleaned.length <= 1) return { path: '', min: 0, max: 0, firstAt: 0, lastAt: 0, coords: [] as { x: number; y: number; balance: number; fetchedAt: number }[] }
    const firstAt = cleaned[0].fetchedAt
    const lastAt = cleaned[cleaned.length - 1].fetchedAt
    const min = Math.min(...cleaned.map(p => p.balance))
    const max = Math.max(...cleaned.map(p => p.balance))
    const range = max - min
    const denomY = range === 0 ? 1 : range
    const denomX = lastAt === firstAt ? 1 : (lastAt - firstAt)
    const innerW = viewWidth - paddingX * 2
    const innerH = height - paddingY * 2

    const coords = cleaned.map(p => {
      const x = paddingX + ((p.fetchedAt - firstAt) / denomX) * innerW
      const y = paddingY + (1 - ((p.balance - min) / denomY)) * innerH
      return { x, y, balance: p.balance, fetchedAt: p.fetchedAt }
    })
    const d = cleaned.map((p, idx) => {
      const x = paddingX + ((p.fetchedAt - firstAt) / denomX) * innerW
      const y = paddingY + (1 - ((p.balance - min) / denomY)) * innerH
      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
    }).join(' ')

    return { path: d, min, max, firstAt, lastAt, coords }
  }, [points, height])

  const hasData = Boolean(series.path)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const hovered = hoverIndex === null ? null : series.coords[hoverIndex] ?? null
  const hoveredValueText = hovered ? (valueFormatter ? valueFormatter(hovered.balance) : hovered.balance.toFixed(2)) : ''
  const hoveredTimeText = hovered
    ? new Date(hovered.fetchedAt * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div className="w-full">
      <div className="w-full rounded-xl bg-gray-50/60 border border-gray-100 px-2.5 py-2 relative">
        <svg
          viewBox={`0 0 ${viewWidth} ${height}`}
          className="w-full h-auto"
          onMouseLeave={() => setHoverIndex(null)}
          onMouseMove={(event) => {
            if (!hasData || series.coords.length === 0) return
            const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect()
            const px = ((event.clientX - rect.left) / rect.width) * viewWidth
            let bestIndex = 0
            let bestDist = Number.POSITIVE_INFINITY
            for (let i = 0; i < series.coords.length; i++) {
              const dist = Math.abs(series.coords[i].x - px)
              if (dist < bestDist) {
                bestDist = dist
                bestIndex = i
              }
            }
            setHoverIndex(bestIndex)
          }}
        >
          <path d={`M${paddingX} ${height - paddingY} H${viewWidth - paddingX}`} stroke="#e5e7eb" strokeWidth="1" fill="none" />
          <path d={`M${paddingX} ${paddingY} H${viewWidth - paddingX}`} stroke="#f3f4f6" strokeWidth="1" fill="none" />
          {hasData ? (
            <>
              <path d={series.path} stroke={stroke} strokeWidth="2.4" fill="none" strokeLinejoin="round" strokeLinecap="round" />
              <path d={`${series.path} L${viewWidth - paddingX} ${height - paddingY} L${paddingX} ${height - paddingY} Z`} fill={stroke} opacity="0.08" />
              {hovered && (
                <>
                  <path d={`M${hovered.x.toFixed(2)} ${paddingY} V${(height - paddingY).toFixed(2)}`} stroke="#d1d5db" strokeWidth="1" strokeDasharray="2 2" />
                  <circle cx={hovered.x} cy={hovered.y} r="3.6" fill={stroke} />
                  <circle cx={hovered.x} cy={hovered.y} r="6.2" fill={stroke} opacity="0.18" />
                </>
              )}
            </>
          ) : (
            <text x={viewWidth / 2} y={height / 2} textAnchor="middle" dominantBaseline="middle" className="fill-gray-400 text-[10px] font-semibold">
              暂无趋势数据
            </text>
          )}
        </svg>
        {hovered && (
          <div
            className="absolute pointer-events-none px-2 py-1 rounded-lg bg-white border border-gray-200 shadow-md"
            style={{
              left: `${(hovered.x / viewWidth) * 100}%`,
              top: `${Math.max(0, (hovered.y / height) * 100 - 6)}%`,
              transform: 'translate(-50%, -100%)'
            }}
          >
            <div className="text-[11px] font-extrabold text-gray-900 tabular-nums">{hoveredValueText}</div>
            <div className="text-[10px] font-bold text-gray-400 tabular-nums">{hoveredTimeText}</div>
          </div>
        )}
      </div>
      {hasData && (
        <div className="mt-1 flex items-center justify-between text-[10px] font-bold text-gray-400 tabular-nums">
          <span>{valueFormatter ? valueFormatter(series.min) : series.min.toFixed(2)}</span>
          <span>{valueFormatter ? valueFormatter(series.max) : series.max.toFixed(2)}</span>
        </div>
      )}
    </div>
  )
}
