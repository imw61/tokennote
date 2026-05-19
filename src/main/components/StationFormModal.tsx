import { X } from 'lucide-react'
import type { StationFormModalProps } from '../component-props'
import { stationTypeLabel } from '../utils'
import { useStationFormMeta } from '../hooks/useStationFormMeta'
import { StationAddressSection } from './station-form/StationAddressSection'
import { StationAuthFields } from './station-form/StationAuthFields'
import { StationAuthModeTabs } from './station-form/StationAuthModeTabs'
import { StationFormKindTabs } from './station-form/StationFormKindTabs'
import { StationSubmitButton } from './station-form/StationSubmitButton'
import { StationThresholdFields } from './station-form/StationThresholdFields'

export function StationFormModal({
  draft,
  editingId,
  formTab,
  setFormTab,
  detectingType,
  detectedType,
  setDetectedType,
  setDraft,
  formError,
  formSaving,
  onClose,
  onSave,
  onDetectStationType
}: StationFormModalProps) {
  const {
    isSub2ApiDraft,
    isDeepSeekDraft,
    submitDisabled,
    submitLabel
  } = useStationFormMeta({ draft, formSaving })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-md animate-fade-up">
      <div className="w-full max-w-[360px] flex flex-col gap-3 p-5 bg-white rounded-2xl shadow-2xl border border-gray-100 animate-pop-in stagger-children">
        <div className="flex items-center justify-between">
          <strong className="text-base font-extrabold text-gray-900">
            {editingId ? '编辑中转站' : '添加中转站'}
          </strong>
          <button
            className="w-7 h-7 flex items-center justify-center rounded-[10px] bg-gray-100 hover:bg-gray-200 text-gray-500 transition-all duration-200 interactive-bounce"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>

        {!editingId ? (
          <StationFormKindTabs
            formTab={formTab}
            setFormTab={setFormTab}
            setDetectedType={setDetectedType}
            setDraft={setDraft}
          />
        ) : null}

        {editingId ? (
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-[11px] font-bold text-gray-500">
            <span>站点类型</span>
            <span className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-[10px] font-extrabold text-gray-700">
              {stationTypeLabel(draft.stationType)}
            </span>
          </div>
        ) : null}

        <StationAddressSection
          draft={draft}
          editingId={editingId}
          formTab={formTab}
          detectingType={detectingType}
          detectedType={detectedType}
          setDetectedType={setDetectedType}
          setDraft={setDraft}
          onDetectStationType={onDetectStationType}
        />

        {!editingId && formTab === 'provider' ? (
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100">
            <span className="text-[11px] font-bold text-gray-500">服务商</span>
            <span className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-[10px] font-extrabold text-gray-700">
              DeepSeek
            </span>
          </div>
        ) : null}

        <StationAuthModeTabs
          draft={draft}
          formTab={formTab}
          editingId={editingId}
          detectedType={detectedType}
          isDeepSeekDraft={isDeepSeekDraft}
          setDraft={setDraft}
        />

        <StationAuthFields
          draft={draft}
          editingId={editingId}
          formTab={formTab}
          detectedType={detectedType}
          isSub2ApiDraft={isSub2ApiDraft}
          isDeepSeekDraft={isDeepSeekDraft}
          setDraft={setDraft}
        />

        <StationThresholdFields draft={draft} setDraft={setDraft} />

        {formError ? (
          <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-[11px] font-semibold text-red-600 whitespace-pre-wrap">
            {formError}
          </div>
        ) : null}

        <StationSubmitButton
          disabled={submitDisabled}
          label={submitLabel}
          onSave={onSave}
        />
      </div>
    </div>
  )
}
