import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  saveLocalStationReviewRecord,
  submitStationReview,
  type StationReviewInput
} from '../../lib/reviews'
import type { AppData, Station } from '../types'

function createDefaultDraft() {
  return {
    rating: 5,
    content: ''
  }
}

type UseStationReviewsOptions = {
  station: Station | null
  localStationReviews: AppData['localStationReviews']
  onLocalReviewSaved: (data: AppData) => void
}

export function useStationReviews({ station, localStationReviews, onLocalReviewSaved }: UseStationReviewsOptions) {
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')
  const [draft, setDraft] = useState(createDefaultDraft)

  const localReview = useMemo(() => {
    if (!station) return null
    return localStationReviews.find(item => item.stationId === station.id || item.baseUrl === station.baseUrl) ?? null
  }, [localStationReviews, station])

  useEffect(() => {
    setDraft(createDefaultDraft())
    setSubmitError('')
    setSubmitSuccess('')
  }, [station?.id])

  const submitReview = useCallback(async () => {
    if (!station) {
      setSubmitError('未找到当前中转站，无法提交评价。')
      setSubmitSuccess('')
      return false
    }

    if (localReview) {
      setSubmitError('当前设备已经提交过该中转站评价，不能重复提交。')
      setSubmitSuccess('')
      return false
    }

    const requestBody: StationReviewInput = {
      stationName: station.name.trim() || station.baseUrl.trim(),
      baseUrl: station.baseUrl.trim(),
      stationType: station.stationType.trim() || 'newapi',
      rating: draft.rating,
      content: draft.content.trim()
    }

    if (!requestBody.baseUrl) {
      setSubmitError('当前中转站缺少地址，无法提交评价。')
      setSubmitSuccess('')
      return false
    }

    if (!requestBody.content || requestBody.content.length < 4) {
      setSubmitError('评价内容至少需要 4 个字符。')
      setSubmitSuccess('')
      return false
    }

    if (requestBody.content.length > 120) {
      setSubmitError('评价内容请控制在 120 个字符以内。')
      setSubmitSuccess('')
      return false
    }

    setSubmitting(true)
    setSubmitError('')
    setSubmitSuccess('')

    try {
      await submitStationReview(requestBody)
      const nextData = await saveLocalStationReviewRecord({
        stationId: station.id,
        stationName: requestBody.stationName,
        baseUrl: requestBody.baseUrl,
        stationType: requestBody.stationType,
        rating: requestBody.rating,
        content: requestBody.content
      })
      onLocalReviewSaved(nextData)
      setDraft(createDefaultDraft())
      setSubmitSuccess('评价已提交。')
      return true
    } catch (nextError) {
      setSubmitError(nextError instanceof Error ? nextError.message : String(nextError))
      return false
    } finally {
      setSubmitting(false)
    }
  }, [draft.content, draft.rating, localReview, onLocalReviewSaved, station])

  return {
    submitting,
    submitError,
    submitSuccess,
    draft,
    setDraft,
    submitReview,
    localReview,
    hasSubmitted: Boolean(localReview)
  }
}
