import { invoke } from '@tauri-apps/api/core'
import { getUpdateDownloadLinks, type UpdateCheckResult } from './update'

export type UpdatePopupMode = 'available' | 'required'

export type UpdatePopupPayload = {
  mode: UpdatePopupMode
  currentVersion: string
  latestVersion: string
  minSupportedVersion: string
  notes: string[]
  primaryUpdateLink: string
  fallbackUpdateLink?: string
  errorMessage?: string
}

const ignoredUpdateVersionStorageKey = 'tokennote.ignoredUpdateVersion'

export function getIgnoredUpdateVersion() {
  try {
    return window.localStorage.getItem(ignoredUpdateVersionStorageKey)
  } catch {
    return null
  }
}

export function persistIgnoredUpdateVersion(version: string | null) {
  try {
    if (version) {
      window.localStorage.setItem(ignoredUpdateVersionStorageKey, version)
    } else {
      window.localStorage.removeItem(ignoredUpdateVersionStorageKey)
    }
  } catch {
    // Ignore storage failures and keep runtime behavior best-effort.
  }
}

export function buildUpdatePopupPayload(result: UpdateCheckResult): UpdatePopupPayload | null {
  if (!result.manifest || (result.status !== 'available' && result.status !== 'required')) {
    return null
  }

  const links = getUpdateDownloadLinks(result.manifest)
  const primaryUpdateLink = links[0]?.url ?? ''
  if (!primaryUpdateLink) return null

  return {
    mode: result.status,
    currentVersion: result.currentVersion,
    latestVersion: result.manifest.latestVersion,
    minSupportedVersion: result.manifest.minSupportedVersion,
    notes: result.manifest.notes,
    primaryUpdateLink,
    fallbackUpdateLink: links[1]?.url,
    errorMessage: result.errorMessage
  }
}

export async function getActiveUpdatePopupPayload() {
  try {
    return await invoke<UpdatePopupPayload | null>('get_update_window_payload')
  } catch {
    return null
  }
}

export async function showUpdatePopup(payload: UpdatePopupPayload) {
  await invoke('show_update_window', { payload })
}

export async function hideUpdatePopup(allowRequired = false) {
  await invoke('hide_update_window', { allowRequired })
}

export async function syncUpdatePopup(result: UpdateCheckResult, ignoredVersion: string | null) {
  const activePayload = await getActiveUpdatePopupPayload()
  const hasRequiredPopup = activePayload?.mode === 'required'
  const nextPayload = buildUpdatePopupPayload(result)

  if (!nextPayload) {
    const latestActivePayload = await getActiveUpdatePopupPayload()
    if (latestActivePayload?.mode === 'required') {
      return latestActivePayload
    }
    await hideUpdatePopup()
    return null
  }

  if (nextPayload.mode === 'available' && ignoredVersion === nextPayload.latestVersion) {
    const latestActivePayload = await getActiveUpdatePopupPayload()
    if (latestActivePayload?.mode === 'required') {
      return latestActivePayload
    }
    await hideUpdatePopup()
    return null
  }

  const latestActivePayload = hasRequiredPopup ? activePayload : await getActiveUpdatePopupPayload()
  if (latestActivePayload?.mode === 'required' && nextPayload.mode !== 'required') {
    return latestActivePayload
  }

  await showUpdatePopup(nextPayload)
  return nextPayload
}
