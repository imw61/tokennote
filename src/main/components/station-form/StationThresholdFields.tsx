import type { Dispatch, SetStateAction } from 'react'
import type { Station } from '../../types'

type StationThresholdFieldsProps = {
  draft: Station
  setDraft: Dispatch<SetStateAction<Station>>
}

export function StationThresholdFields({ draft, setDraft }: StationThresholdFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1.5 text-[11px] font-bold text-gray-500">
        低余额阈值
        <input
          type="number"
          value={draft.lowBalanceThreshold}
          onChange={event => setDraft(current => ({ ...current, lowBalanceThreshold: Number(event.target.value) }))}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all duration-200"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[11px] font-bold text-gray-500">
        变动阈值
        <input
          type="number"
          value={draft.changeThreshold}
          onChange={event => setDraft(current => ({ ...current, changeThreshold: Number(event.target.value) }))}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all duration-200"
        />
      </label>
    </div>
  )
}
