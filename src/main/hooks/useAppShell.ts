import { useCallback, useEffect } from 'react'
import { useAppData } from './useAppData'
import { useConfigTransfer } from './useConfigTransfer'
import { useFormLayerProps } from './useFormLayerProps'
import { useHeaderProps } from './useHeaderProps'
import { useMainViewState } from './useMainViewState'
import { usePanelProps } from './usePanelProps'
import { useStationActions } from './useStationActions'
import { useStationForm } from './useStationForm'
import { useStationReviews } from './useStationReviews'
import { useUpdateManager } from './useUpdateManager'

export function useAppShell() {
  const { data, setData, snapshots, persistenceNotice } = useAppData()
  const update = useUpdateManager()

  useEffect(() => {
    void update.runUpdateCheck(true)
  }, [update.runUpdateCheck])

  const view = useMainViewState({
    data,
    snapshots
  })

  const stationActions = useStationActions({
    data,
    setData,
    snapshots,
    onStationRemoved: view.resetSelection
  })

  const stationForm = useStationForm({
    setData,
    onRefreshStation: stationActions.refreshOne
  })

  const configTransfer = useConfigTransfer({
    data,
    setData,
    onRefreshAll: stationActions.refreshAll,
    resetViewState: () => {
      view.closeOverlays()
      stationForm.resetFormView()
    }
  })

  const stationReviews = useStationReviews({
    station: view.selectedStation,
    localStationReviews: data.localStationReviews,
    onLocalReviewSaved: setData
  })

  const onToggleSettingsView = useCallback(() => {
    view.setSelectedId(null)
    view.setActivePanel(current => current === 'settings' ? 'overview' : 'settings')
  }, [view.setActivePanel, view.setSelectedId])

  const headerProps = useHeaderProps({
    title: view.title,
    showSettings: view.showSettings,
    data,
    loading: stationActions.loading,
    onSaveSettings: stationActions.saveSettings,
    onRefreshAll: stationActions.refreshAll,
    onToggleSettingsView
  })

  const panelProps = usePanelProps({
    data,
    persistenceNotice,
    snapshots,
    view,
    update,
    stationActions,
    stationForm,
    configTransfer,
    stationReviews
  })

  const formLayerProps = useFormLayerProps({
    stationForm
  })

  return {
    contentKey: view.contentKey,
    contentAnimationClass: view.contentAnimationClass,
    headerProps,
    panelProps,
    formLayerProps
  }
}
