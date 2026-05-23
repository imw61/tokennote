import { Activity, ArrowLeft, Clock3, ExternalLink, Gauge, Layers3, Loader2, MessageSquareQuote, RefreshCw, Settings, Trash2, WalletCards } from 'lucide-react'
import { useMemo } from 'react'
import { BalanceTrendChart } from '../../components/BalanceTrendChart'
import { PieChart } from '../../components/PieChart'
import { isAndroid } from '../../lib/platform'
import type { BalanceHistoryPoint } from '../../lib/balance-history'
import type { BalanceSnapshot, Station } from '../types'
import {
  formatCurrency,
  formatDateTime,
  formatInt,
  formatMetric,
  formatResponseTime,
  isDeepSeekStation,
  isSub2ApiStation,
  normCurrency,
  stationUserFallback
} from '../utils'

type StationDetailProps = {
  station: Station
  snapshot?: BalanceSnapshot
  balanceHistory: BalanceHistoryPoint[]
  trendHours: number
  hasSubmittedReview: boolean
  openingConsole: boolean
  onBack: () => void
  onRefresh: () => void
  onOpenConsole: () => void
  onEdit: () => void
  onDelete: () => void
  onOpenReview: () => void
}

export function StationDetail({
  station,
  snapshot,
  balanceHistory,
  trendHours,
  hasSubmittedReview,
  openingConsole,
  onBack,
  onRefresh,
  onOpenConsole,
  onEdit,
  onDelete,
  onOpenReview
}: StationDetailProps) {
  const status = snapshot?.status === 'success' ? '正常' : snapshot ? '异常' : '待刷新'
  const low = snapshot?.status === 'success' && snapshot.currentBalance <= station.lowBalanceThreshold
  const showSub2ApiDailyMetrics = isSub2ApiStation(station.stationType)
  const showPerformanceMetrics = !isDeepSeekStation(station.stationType)
  // 快捷登录（打开站点网页 + 注入登录态）依赖桌面 webview 的"独立窗口 + cookie 注入"能力，
  // Android 端没有合适的等价实现，直接隐藏按钮，避免点击后报错或行为不一致。
  const showQuickLogin = !isAndroid()

  const pieData = useMemo(() => {
    if (!snapshot?.models) return []
    const colors = [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
    ]
    return snapshot.models.map((model, index) => ({
      label: model.modelName,
      value: model.quotaUsd,
      color: colors[index % colors.length]
    }))
  }, [snapshot?.models])

  const trendSymbol = normCurrency(balanceHistory.length ? balanceHistory[balanceHistory.length - 1].currency : snapshot?.currency)
  const trendPoints = useMemo(() => balanceHistory.map(point => ({
    fetchedAt: point.fetchedAt,
    balance: point.balance
  })), [balanceHistory])
  const trendDelta = balanceHistory.length >= 2
    ? balanceHistory[balanceHistory.length - 1].balance - balanceHistory[0].balance
    : 0

  return (
    <div className="flex-1 overflow-auto px-4 pb-4 space-y-3 scrollbar-hide stagger-children">
      <div className={`flex flex-col gap-4 p-4 bg-white rounded-2xl border shadow-sm animate-pop-in card-hover-lift ${low ? 'border-amber-200' : 'border-gray-100'}`}>
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold transition-all duration-200 interactive-bounce"
          >
            <ArrowLeft size={14} />总览
          </button>
          <div className="flex items-center gap-1">
            <button onClick={onRefresh} className="w-7 h-7 flex items-center justify-center rounded-[10px] bg-gray-100 hover:bg-gray-200 text-gray-500 transition-all duration-200 interactive-bounce">
              <RefreshCw size={13} />
            </button>
            <button onClick={onOpenReview} className="w-7 h-7 flex items-center justify-center rounded-[10px] bg-gray-100 hover:bg-primary-50 hover:text-primary-600 text-gray-500 transition-all duration-200 interactive-bounce" title="评价站点">
              <MessageSquareQuote size={13} />
            </button>
            {showQuickLogin ? (
              <button onClick={onOpenConsole} disabled={openingConsole} className="w-7 h-7 flex items-center justify-center rounded-[10px] bg-gray-100 hover:bg-primary-50 hover:text-primary-600 text-gray-500 transition-all duration-200 interactive-bounce disabled:opacity-50 disabled:cursor-not-allowed" title={openingConsole ? '正在加载控制台...' : '打开站点网页'}>
                {openingConsole ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
              </button>
            ) : null}
            <button onClick={onEdit} className="w-7 h-7 flex items-center justify-center rounded-[10px] bg-gray-100 hover:bg-gray-200 text-gray-500 transition-all duration-200 interactive-bounce">
              <Settings size={13} />
            </button>
            <button onClick={onDelete} className="w-7 h-7 flex items-center justify-center rounded-[10px] bg-gray-100 hover:bg-red-50 hover:text-red-500 text-gray-500 transition-all duration-200 interactive-bounce">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-400">{status} · {snapshot?.username || stationUserFallback(station.stationType)}</span>
            <strong className="text-[38px] font-extrabold text-gray-900 tracking-[-0.07em] leading-none">
              {snapshot ? formatCurrency(snapshot.currentBalance, normCurrency(snapshot.currency)) : '--'}
            </strong>
            <span className="text-[11px] text-gray-400 font-medium">最后刷新：{formatDateTime(snapshot?.fetchedAt || 0)}</span>
          </div>
          {!hasSubmittedReview ? (
            <button
              type="button"
              onClick={onOpenReview}
              className="shrink-0 rounded-2xl border border-primary-100 bg-primary-50/70 px-3 py-2 text-left transition-all duration-200 hover:border-primary-200 hover:bg-primary-50 interactive-bounce"
            >
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-primary-700">
                <MessageSquareQuote size={13} />
                去评价
              </div>
              <div className="mt-1 text-[10px] font-medium text-primary-600/90">
                评价后自动隐藏
              </div>
            </button>
          ) : null}
        </div>
      </div>

      {snapshot?.status === 'failed' ? (
        <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-[10px] font-semibold text-red-600">
          {snapshot.errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5">
        <MetricGroup icon={<WalletCards size={14} />} title="账户数据" items={[
          ['当前余额', snapshot ? formatCurrency(snapshot.currentBalance, normCurrency(snapshot.currency)) : '--'],
          ['历史消耗', snapshot ? formatCurrency(snapshot.historicalConsumption, normCurrency(snapshot.currency)) : '--']
        ]} />
        {showPerformanceMetrics ? (
          <MetricGroup icon={<Gauge size={14} />} title="性能指标" items={[
            ['平均响应', snapshot ? formatResponseTime(snapshot.averageResponseMs) : '--'],
            ['平均 RPM', snapshot ? formatMetric(snapshot.averageRpm) : '--'],
            ['平均 TPM', snapshot ? formatMetric(snapshot.averageTpm) : '--']
          ]} />
        ) : null}
        <MetricGroup icon={<Activity size={14} />} title="使用统计" items={[
          ['请求次数', snapshot ? formatInt(snapshot.requestCount) : '--'],
          ['统计次数', snapshot ? formatInt(snapshot.statsCount) : '--']
        ]} />
        <MetricGroup icon={<Layers3 size={14} />} title="资源消耗" items={[
          ['统计额度', snapshot ? formatCurrency(snapshot.totalQuota, normCurrency(snapshot.currency)) : '--'],
          ['Tokens', snapshot ? formatInt(snapshot.totalTokens) : '--']
        ]} />
        {showSub2ApiDailyMetrics ? (
          <MetricGroup className="col-span-2" icon={<Clock3 size={14} />} title="今日表现" items={[
            ['今日请求', snapshot ? formatInt(snapshot.todayRequestCount) : '--'],
            ['今日 Token', snapshot ? formatInt(snapshot.todayTokens) : '--'],
            ['今日输入 / 输出', snapshot ? `${formatInt(snapshot.todayInputTokens)} / ${formatInt(snapshot.todayOutputTokens)}` : '--'],
            ['今日消费', snapshot ? `${formatCurrency(snapshot.todayActualCost, normCurrency(snapshot.currency))} / ${formatCurrency(snapshot.todayCost, normCurrency(snapshot.currency))}` : '--']
          ]} />
        ) : null}
      </div>

      <div className="p-3.5 bg-white rounded-2xl border border-gray-100 shadow-sm animate-fade-up card-hover-lift">
        <div className="flex items-center justify-between mb-2">
          <strong className="flex items-center gap-1.5 text-xs font-extrabold text-gray-700">
            <Activity size={14} />余额趋势
          </strong>
          <span className="text-[10px] font-bold text-gray-400">近 {trendHours} 小时</span>
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-gray-400">期间变化</span>
          <span className={`text-[11px] font-extrabold tabular-nums ${trendDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {trendSymbol}{trendDelta >= 0 ? '+' : ''}{trendDelta.toFixed(2)}
          </span>
        </div>
        <BalanceTrendChart
          points={trendPoints}
          valueFormatter={value => `${trendSymbol}${value.toFixed(2)}`}
        />
      </div>

      <div className="p-3.5 bg-white rounded-2xl border border-gray-100 shadow-sm animate-fade-up card-hover-lift">
        <div className="flex items-center justify-between mb-3">
          <strong className="flex items-center gap-1.5 text-xs font-extrabold text-gray-700">
            <Clock3 size={14} />模型数据分析
          </strong>
          <span className="text-[10px] font-bold text-gray-400">{snapshot?.models?.length || 0} 个模型</span>
        </div>

        {pieData.length > 0 ? (
          <div className="mb-4 p-3 bg-gray-50/50 rounded-xl border border-gray-100/50">
            <PieChart
              data={pieData}
              size={100}
              valueFormatter={value => formatCurrency(value, normCurrency(snapshot?.currency))}
              totalFormatter={value => formatCurrency(value, normCurrency(snapshot?.currency))}
            />
          </div>
        ) : null}

        <div className="space-y-2">
          {(snapshot?.models || []).length === 0 ? <p className="text-xs text-gray-400 text-center py-2">暂无模型统计数据</p> : null}
          {(snapshot?.models || []).map(model => (
            <div key={model.modelName} className="flex items-center justify-between gap-2 p-2.5 bg-gray-50 rounded-xl card-hover-lift">
              <div className="flex flex-col gap-0.5 min-w-0">
                <strong className="text-xs font-extrabold text-gray-900 truncate">{model.modelName}</strong>
                <span className="text-[10px] text-gray-400 font-medium">{formatInt(model.count)} 次 · 倍率 {model.ratio.toFixed(4)}</span>
              </div>
              <div className="flex flex-col gap-0.5 text-right">
                <b className="text-xs font-extrabold text-gray-900">{formatCurrency(model.quotaUsd, normCurrency(snapshot?.currency))}</b>
                <span className="text-[10px] text-gray-400 font-medium">{formatInt(model.tokenUsed)} tokens</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MetricGroup({
  icon,
  title,
  items,
  className
}: {
  icon: React.ReactNode
  title: string
  items: [string, string][]
  className?: string
}) {
  return (
    <div className={`p-3 bg-white rounded-2xl border border-gray-100 shadow-sm animate-fade-up card-hover-lift ${className || ''}`}>
      <h3 className="flex items-center gap-1.5 mb-2 text-[11px] font-extrabold text-primary-600">
        {icon}{title}
      </h3>
      {items.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between py-1">
          <span className="text-[10px] font-bold text-gray-400">{label}</span>
          <strong className="text-[13px] font-extrabold text-gray-900 tracking-[-0.03em] max-w-[120px] truncate">{value}</strong>
        </div>
      ))}
    </div>
  )
}
