import type { StationFormLayerProps } from '../component-props'
import { StationFormModal } from './StationFormModal'

export function StationFormLayer({
  showForm,
  draft,
  editingId,
  formTab,
  setFormTab,
  detectingType,
  detectedType,
  unsupportedDetectedType,
  setDetectedType,
  setDraft,
  formError,
  formSaving,
  onClose,
  onSave,
  onDetectStationType
}: StationFormLayerProps) {
  if (!showForm) return null

  return (
    <StationFormModal
      draft={draft}
      editingId={editingId}
      formTab={formTab}
      setFormTab={setFormTab}
      detectingType={detectingType}
      detectedType={detectedType}
      unsupportedDetectedType={unsupportedDetectedType}
      setDetectedType={setDetectedType}
      setDraft={setDraft}
      formError={formError}
      formSaving={formSaving}
      onClose={onClose}
      onSave={onSave}
      onDetectStationType={onDetectStationType}
    />
  )
}
