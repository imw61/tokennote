import { ArrowLeft, Send, Star } from 'lucide-react'
import { formatStationReviewRatingLabel } from '../../lib/reviews'
import type { LocalStationReviewRecord, Station } from '../types'
import { formatDateTime, stationTypeLabel } from '../utils'

type ReviewDraft = {
  rating: number
  content: string
}

type ReviewsViewProps = {
  station: Station | null
  submitting: boolean
  submitError: string
  draft: ReviewDraft
  hasSubmitted: boolean
  localReview: LocalStationReviewRecord | null
  onDraftChange: (updater: (current: ReviewDraft) => ReviewDraft) => void
  onSubmit: () => void
  onBack: () => void
}

const ratingOptions = [1, 2, 3, 4, 5]

export function ReviewsView({
  station,
  submitting,
  submitError,
  draft,
  hasSubmitted,
  localReview,
  onDraftChange,
  onSubmit,
  onBack
}: ReviewsViewProps) {
  return (
    <div className="flex-1 overflow-auto px-4 pb-4 space-y-3 scrollbar-hide stagger-children">
      <div className="flex items-center">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold transition-all duration-200 interactive-bounce"
        >
          <ArrowLeft size={14} />
          返回站点
        </button>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-sm font-extrabold text-gray-900">提交当前中转站评价</h2>
        </div>

        {station ? (
          <div className="mt-4 rounded-2xl border border-primary-100 bg-primary-50/60 px-3 py-2 text-[11px] text-primary-700">
            <div className="font-extrabold">{station.name || station.baseUrl}</div>
            <div className="mt-1 break-all">{station.baseUrl}</div>
            <div className="mt-1">{stationTypeLabel(station.stationType)}</div>
          </div>
        ) : (
          <EmptyReviewHint text="未找到当前中转站，请返回详情页重新进入。" />
        )}

        <div className="mt-4 space-y-3">
          {localReview ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-3 text-[11px] text-emerald-700">
              <div className="font-extrabold">本机已提交过该中转站评价</div>
              <div className="mt-1">
                评分：{formatStationReviewRatingLabel(localReview.rating)}
                <span className="ml-1 text-emerald-600/80">({localReview.rating} 星)</span>
              </div>
              <div className="mt-1 leading-relaxed text-emerald-800">{localReview.content}</div>
              <div className="mt-1 text-[10px] font-semibold text-emerald-600">
                提交时间：{formatDateTime(localReview.submittedAt)}
              </div>
            </div>
          ) : null}

          <div>
            <div className="mb-1.5 text-[11px] font-bold text-gray-500">评分</div>
            <div className="flex items-center gap-1">
              {ratingOptions.map(value => {
                const active = value <= draft.rating
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onDraftChange(current => ({ ...current, rating: value }))}
                    disabled={hasSubmitted}
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 ${
                      active
                        ? 'text-amber-400 hover:text-amber-500'
                        : 'text-gray-200 hover:text-amber-300'
                    } disabled:cursor-not-allowed disabled:opacity-45`}
                    aria-label={`${formatStationReviewRatingLabel(value)}（${value} 星）`}
                    title={`${formatStationReviewRatingLabel(value)}（${value} 星）`}
                  >
                    <Star size={22} strokeWidth={1.8} className={`${active ? 'fill-current drop-shadow-[0_1px_4px_rgba(251,191,36,0.28)]' : ''}`} />
                  </button>
                )
              })}
              <span className="ml-2 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-600">
                {formatStationReviewRatingLabel(draft.rating)}
              </span>
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold text-gray-500">评价内容</span>
            <textarea
              value={draft.content}
              onChange={event => onDraftChange(current => ({ ...current, content: event.target.value }))}
              placeholder="写一句简洁反馈，例如：稳定、响应快、价格合适。"
              rows={4}
              maxLength={120}
              disabled={hasSubmitted}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-all duration-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            />
            <div className="mt-1 flex items-center justify-between text-[10px] font-semibold text-gray-400">
              <span>建议控制在 8-60 个字，突出核心体验。</span>
              <span>{draft.content.length}/120</span>
            </div>
          </label>

          {submitError ? <div className="text-[11px] font-bold text-red-500">{submitError}</div> : null}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting || !station || hasSubmitted}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-500 px-4 py-2 text-sm font-extrabold text-white transition-all duration-200 hover:bg-primary-600 interactive-bounce disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={14} />
              {hasSubmitted ? '已提交' : submitting ? '提交中...' : '提交评价'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyReviewHint({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm font-semibold text-gray-400">
      {text}
    </div>
  )
}
