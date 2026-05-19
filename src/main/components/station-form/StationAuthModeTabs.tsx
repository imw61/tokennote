import type { Dispatch, SetStateAction } from 'react'
import type { Station, StationFormTab, StationTypeDetectionState } from '../../types'

type StationAuthModeTabsProps = {
  draft: Station
  formTab: StationFormTab
  editingId: string | null
  detectedType: StationTypeDetectionState
  isDeepSeekDraft: boolean
  setDraft: Dispatch<SetStateAction<Station>>
}

export function StationAuthModeTabs({
  draft,
  formTab,
  editingId,
  detectedType,
  isDeepSeekDraft,
  setDraft
}: StationAuthModeTabsProps) {
  const shouldShow = editingId || formTab === 'provider' || detectedType === 'newapi' || detectedType === 'sub2api'
  if (!shouldShow) return null

  return (
    <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-gray-100">
      <button
        type="button"
        onClick={() => setDraft(current => ({ ...current, authMode: 'login' }))}
        className={`px-3 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 interactive-bounce ${draft.authMode === 'login' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
      >
        账号密码
      </button>
      <button
        type="button"
        onClick={() => setDraft(current => ({ ...current, authMode: 'manual' }))}
        className={`px-3 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 interactive-bounce ${draft.authMode === 'manual' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
      >
        {isDeepSeekDraft ? 'API Key / Token' : '手动凭证'}
      </button>
    </div>
  )
}
