import { useCallback, useMemo } from 'react'
import type { StationFormLayerProps } from '../component-props'
import type { useStationForm } from './useStationForm'

type StationFormState = ReturnType<typeof useStationForm>

type UseFormLayerPropsOptions = {
  stationForm: StationFormState
}

export function useFormLayerProps({ stationForm }: UseFormLayerPropsOptions): StationFormLayerProps {
  const onClose = useCallback(() => {
    stationForm.setShowForm(false)
  }, [stationForm.setShowForm])

  const onSave = useCallback(() => {
    void stationForm.saveStation()
  }, [stationForm.saveStation])

  const onDetectStationType = useCallback((baseUrl: string) => {
    void stationForm.detectStationType(baseUrl)
  }, [stationForm.detectStationType])

  return useMemo(() => ({
    showForm: stationForm.showForm,
    draft: stationForm.draft,
    editingId: stationForm.editingId,
    formTab: stationForm.formTab,
    setFormTab: stationForm.setFormTab,
    detectingType: stationForm.detectingType,
    detectedType: stationForm.detectedType,
    setDetectedType: stationForm.setDetectedType,
    setDraft: stationForm.setDraft,
    formError: stationForm.formError,
    formSaving: stationForm.formSaving,
    onClose,
    onSave,
    onDetectStationType
  }), [
    onClose,
    onDetectStationType,
    onSave,
    stationForm.detectedType,
    stationForm.detectingType,
    stationForm.draft,
    stationForm.editingId,
    stationForm.formError,
    stationForm.formSaving,
    stationForm.formTab,
    stationForm.setDetectedType,
    stationForm.setDraft,
    stationForm.setFormTab,
    stationForm.showForm
  ])
}
