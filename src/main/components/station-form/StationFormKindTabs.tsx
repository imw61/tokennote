import type { Dispatch, SetStateAction } from 'react'
import type { Station, StationFormTab, StationTypeDetectionState } from '../../types'

type StationFormKindTabsProps = {
  formTab: StationFormTab
  setFormTab: Dispatch<SetStateAction<StationFormTab>>
  setDetectedType: Dispatch<SetStateAction<StationTypeDetectionState>>
  setDraft: Dispatch<SetStateAction<Station>>
}

export function StationFormKindTabs({
  formTab,
  setFormTab,
  setDetectedType,
  setDraft
}: StationFormKindTabsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-gray-100">
      <button
        type="button"
        onClick={() => {
          setFormTab('relay')
          setDetectedType('idle')
          setDraft(current => ({
            ...current,
            stationType: '',
            baseUrl: '',
            authMode: 'login',
            cookie: '',
            newApiUser: '',
            loginUsername: '',
            loginPassword: ''
          }))
        }}
        className={`px-3 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 interactive-bounce ${formTab === 'relay' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
      >
        中转站
      </button>
      <button
        type="button"
        onClick={() => {
          setFormTab('provider')
          setDetectedType('idle')
          setDraft(current => ({
            ...current,
            stationType: 'deepseek',
            baseUrl: 'https://platform.deepseek.com',
            authMode: 'login',
            cookie: '',
            newApiUser: '',
            loginUsername: '',
            loginPassword: ''
          }))
        }}
        className={`px-3 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 interactive-bounce ${formTab === 'provider' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
      >
        服务商
      </button>
    </div>
  )
}
