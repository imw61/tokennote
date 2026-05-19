import { ReviewsView } from '../ReviewsView'
import type { LocalStationReviewRecord, Station } from '../../types'

type ReviewDraft = {
  rating: number
  content: string
}

type ReviewsPanelProps = {
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

export function ReviewsPanel(props: ReviewsPanelProps) {
  return <ReviewsView {...props} />
}
