import { useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { MainHeaderProps } from '../component-props'
import { openExternalUrl } from '../../lib/safe-external-url'
import { officialWebsiteUrl } from '../utils'
import type { AppData } from '../types'

type UseHeaderPropsOptions = {
  title: string
  showSettings: boolean
  data: AppData
  loading: boolean
  onSaveSettings: (settings: AppData['settings']) => Promise<void>
  onRefreshAll: () => Promise<void>
  onToggleSettingsView: () => void
}

export function useHeaderProps({
  title,
  showSettings,
  data,
  loading,
  onSaveSettings,
  onRefreshAll,
  onToggleSettingsView
}: UseHeaderPropsOptions): MainHeaderProps {
  const appWindow = getCurrentWindow()

  const onDragWindow = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('button, input, textarea, label')) return
    appWindow.startDragging().catch(() => undefined)
  }, [appWindow])

  const onOpenWebsite = useCallback(() => {
    openExternalUrl(officialWebsiteUrl, { allowedHosts: ['www.tokennote.dev', 'tokennote.dev'] }).catch(console.error)
  }, [])

  const onMinimize = useCallback(() => {
    appWindow.minimize()
  }, [appWindow])

  const onToggleAlwaysOnTop = useCallback(() => {
    void onSaveSettings({
      ...data.settings,
      alwaysOnTop: !data.settings.alwaysOnTop
    })
  }, [data.settings, onSaveSettings])

  const onRefreshAllClick = useCallback(() => {
    void onRefreshAll()
  }, [onRefreshAll])

  const onClose = useCallback(() => {
    invoke('hide_main_window').catch(console.error)
  }, [])

  return useMemo(() => ({
    title,
    alwaysOnTop: data.settings.alwaysOnTop,
    loading,
    showSettings,
    onDragWindow,
    onOpenWebsite,
    onMinimize,
    onToggleAlwaysOnTop,
    onRefreshAll: onRefreshAllClick,
    onToggleSettings: onToggleSettingsView,
    onClose
  }), [
    data.settings.alwaysOnTop,
    loading,
    onClose,
    onDragWindow,
    onOpenWebsite,
    onMinimize,
    onRefreshAllClick,
    onToggleAlwaysOnTop,
    onToggleSettingsView,
    showSettings,
    title
  ])
}
