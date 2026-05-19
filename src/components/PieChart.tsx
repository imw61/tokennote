import React, { useMemo, useState } from 'react'

interface PieChartData {
  label: string
  value: number
  color: string
}

interface PieChartProps {
  data: PieChartData[]
  size?: number
  strokeWidth?: number
  valueFormatter?: (value: number) => string
  totalFormatter?: (total: number) => string
}

const formatCompactNumber = (value: number) => {
  const abs = Math.abs(value)
  if (abs >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}K`
  return `${Math.round(value)}`
}

export const PieChart: React.FC<PieChartProps> = ({ data, size = 120, strokeWidth = 15, valueFormatter = formatCompactNumber, totalFormatter = formatCompactNumber }) => {
  const total = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data])
  const radius = (size - strokeWidth) / 2
  const center = size / 2
  const circumference = 2 * Math.PI * radius

  let currentOffset = 0
  const [hovered, setHovered] = useState<PieChartData | null>(null)
  const hoveredPercent = hovered && total > 0 ? (hovered.value / total) * 100 : 0

  return (
    <div className="flex items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
          {total === 0 ? (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="#f3f4f6"
              strokeWidth={strokeWidth}
            />
          ) : (
            data.map((item, index) => {
              const percentage = (item.value / total) * 100
              const strokeDasharray = `${(percentage * circumference) / 100} ${circumference}`
              const strokeDashoffset = -currentOffset
              currentOffset += (percentage * circumference) / 100

              return (
                <circle
                  key={index}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="transparent"
                  stroke={item.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  onMouseEnter={() => setHovered(item)}
                  onMouseLeave={() => setHovered(current => (current?.label === item.label ? null : current))}
                  className={`transition-all duration-200 ease-in-out ${hovered?.label === item.label ? 'opacity-100' : hovered ? 'opacity-40' : 'opacity-100'} cursor-pointer`}
                >
                  <title>
                    {item.label} · {valueFormatter(item.value)} · {(total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0')}%
                  </title>
                </circle>
              )
            })
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {hovered ? (
            <>
              <span className="text-[10px] font-bold text-gray-500 leading-none max-w-[92%] truncate">{hovered.label}</span>
              <span className="text-xs font-black text-gray-900 mt-0.5 tabular-nums">{valueFormatter(hovered.value)}</span>
              <span className="text-[10px] font-bold text-gray-400 mt-0.5 tabular-nums">{hoveredPercent.toFixed(1)}%</span>
            </>
          ) : (
            <>
              <span className="text-[10px] font-bold text-gray-400 leading-none">总计</span>
              <span className="text-xs font-black text-gray-900 mt-0.5 tabular-nums">{totalFormatter(total)}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        {data.slice(0, 5).map((item, index) => (
          <div
            key={index}
            onMouseEnter={() => setHovered(item)}
            onMouseLeave={() => setHovered(current => (current?.label === item.label ? null : current))}
            className="flex items-center justify-between gap-2 cursor-default"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-[10px] font-bold text-gray-600 truncate">{item.label}</span>
            </div>
            <span className="text-[10px] font-extrabold text-gray-400">
              {total > 0 ? ((item.value / total) * 100).toFixed(1) : 0}%
            </span>
          </div>
        ))}
        {data.length > 5 && (
          <div className="text-[10px] font-bold text-gray-400 pl-3.5">
            等其他 {data.length - 5} 个模型...
          </div>
        )}
      </div>
    </div>
  )
}
