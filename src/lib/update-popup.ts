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
const updatePopupPayloadStorageKey = 'tokennote.updatePopupPayload'

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

export function getStoredUpdatePopupPayload() {
  try {
    const raw = window.localStorage.getItem(updatePopupPayloadStorageKey)
    return raw ? JSON.parse(raw) as UpdatePopupPayload : null
  } catch {
    return null
  }
}

export async function showUpdatePopup(payload: UpdatePopupPayload) {
  try {
    window.localStorage.setItem(updatePopupPayloadStorageKey, JSON.stringify(payload))
  } catch {
    // Ignore storage failures and keep event-driven behavior best-effort.
  }
  await invoke('show_update_window', { payload })
}

export async function hideUpdatePopup() {
  try {
    window.localStorage.removeItem(updatePopupPayloadStorageKey)
  } catch {
    // Ignore storage failures and keep hide behavior best-effort.
  }
  await invoke('hide_update_window')
}
