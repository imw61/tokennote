import type { Dispatch, SetStateAction } from 'react'
import type { Station, StationFormTab, StationTypeDetectionState } from '../../types'
import { normalizeBaseUrl } from '../../utils'

type StationAddressSectionProps = {
  draft: Station
  editingId: string | null
  formTab: StationFormTab
  detectingType: boolean
  detectedType: StationTypeDetectionState
  unsupportedDetectedType: string
  setDetectedType: Dispatch<SetStateAction<StationTypeDetectionState>>
  setDraft: Dispatch<SetStateAction<Station>>
  onDetectStationType: (baseUrl: string) => void
}

function detectionBadgeClass(detectingType: boolean, detectedType: StationTypeDetectionState) {
  if (detectingType) return 'bg-white border-gray-200 text-gray-400'
  if (detectedType === 'sub2api') return 'bg-primary-50 border-primary-200 text-primary-600'
  if (detectedType === 'newapi') return 'bg-emerald-50 border-emerald-200 text-emerald-600'
  if (detectedType === 'unsupported') return 'bg-amber-50 border-amber-200 text-amber-700'
  if (detectedType === 'unknown') return 'bg-red-50 border-red-200 text-red-600'
  return 'bg-white border-gray-200 text-gray-400'
}

function detectionLabel(detectingType: boolean, detectedType: StationTypeDetectionState) {
  if (detectingType) return '识别中...'
  if (detectedType === 'sub2api') return 'Sub2API'
  if (detectedType === 'newapi') return 'NewAPI'
  if (detectedType === 'unsupported') return '暂不支持'
  if (detectedType === 'unknown') return '未知'
  return '--'
}

export function StationAddressSection({
  draft,
  editingId,
  formTab,
  detectingType,
  detectedType,
  unsupportedDetectedType,
  setDetectedType,
  setDraft,
  onDetectStationType
}: StationAddressSectionProps) {
  if (!(editingId || formTab === 'relay')) return null

  return (
    <>
      <label className="flex flex-col gap-1.5 text-[11px] font-bold text-gray-500">
        地址 URL
        <input
          value={draft.baseUrl}
          onChange={event => {
            const value = event.target.value
            setDraft(current => ({ ...current, baseUrl: value, stationType: editingId ? current.stationType : '' }))
            if (!editingId) setDetectedType('idle')
          }}
          onBlur={event => {
            const normalized = normalizeBaseUrl(event.target.value)
            setDraft(current => ({ ...current, baseUrl: normalized }))
            if (!editingId) onDetectStationType(normalized)
          }}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all duration-200"
        />
      </label>

      {!editingId ? (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100">
          <span className="text-[11px] font-bold text-gray-500">识别结果</span>
          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-extrabold ${detectionBadgeClass(detectingType, detectedType)}`}>
            {detectionLabel(detectingType, detectedType)}
          </span>
        </div>
      ) : null}

      {!editingId && !detectingType && detectedType === 'idle' && draft.baseUrl.trim() ? (
        <div className="px-3 py-2.5 rounded-xl bg-primary-50 border border-primary-100 text-[11px] font-semibold text-primary-600">
          输入地址后会自动识别站点类型；识别成功后才会显示登录/凭证填写项。
        </div>
      ) : null}

      {!editingId && detectedType === 'unknown' ? (
        <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-[11px] font-semibold text-red-600">
          无法识别站点类型，请确认输入的是 NewAPI 或 Sub2API 的控制台域名（只填到域名即可）。
        </div>
      ) : null}

      {!editingId && detectedType === 'unsupported' ? (
        <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-700">
          已识别到站点类型「{unsupportedDetectedType}」，但当前客户端暂不支持该类型，请升级客户端。
        </div>
      ) : null}
    </>
  )
}
