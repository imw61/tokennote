import type { Dispatch, SetStateAction } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useState } from 'react'
import type { AppData, Station, StationFormTab, StationTypeDetectionState } from '../types'
import { createDraft, normalizeBaseUrl } from '../utils'

type UseStationFormOptions = {
  setData: Dispatch<SetStateAction<AppData>>
  onRefreshStation: (id: string) => Promise<void>
}

export function useStationForm({ setData, onRefreshStation }: UseStationFormOptions) {
  const [draft, setDraft] = useState<Station>(createDraft())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formTab, setFormTab] = useState<StationFormTab>('relay')
  const [detectingType, setDetectingType] = useState(false)
  const [detectedType, setDetectedType] = useState<StationTypeDetectionState>('idle')
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const detectStationType = async (baseUrl: string) => {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
    if (!normalizedBaseUrl) {
      setDetectedType('idle')
      setDraft(current => ({ ...current, baseUrl: '', stationType: '' }))
      return
    }
    setDetectingType(true)
    try {
      const result = await invoke<{ stationType: string }>('detect_station_type', { baseUrl: normalizedBaseUrl })
      const stationType = result.stationType === 'sub2api'
        ? 'sub2api'
        : result.stationType === 'newapi'
          ? 'newapi'
          : 'unknown'
      setDetectedType(stationType)
      setDraft(current => ({
        ...current,
        baseUrl: normalizedBaseUrl,
        stationType: stationType === 'unknown' ? '' : stationType,
        cookie: stationType === 'sub2api' ? '' : current.cookie,
        newApiUser: stationType === 'sub2api' ? '' : current.newApiUser
      }))
    } catch {
      setDetectedType('unknown')
      setDraft(current => ({ ...current, baseUrl: normalizedBaseUrl, stationType: '' }))
    } finally {
      setDetectingType(false)
    }
  }

  const saveStation = async () => {
    setFormError('')
    setFormSaving(true)
    try {
      const normalizedBaseUrl = normalizeBaseUrl(draft.baseUrl)
      if (!normalizedBaseUrl) {
        throw new Error('请输入合法的站点地址，仅支持 http 或 https 域名。')
      }
      const name = draft.name.trim() || (
        draft.stationType === 'deepseek'
          ? 'DeepSeek'
          : new URL(normalizedBaseUrl).hostname.replace('api.', '')
      )
      const action = editingId ? 'update_station' : 'add_station'
      const refreshTargetId = editingId
      const next = await invoke<AppData>(action, { station: { ...draft, baseUrl: normalizedBaseUrl, name } })
      setData(next)
      setShowForm(false)
      setEditingId(null)
      setDraft(createDraft())

      if (refreshTargetId) {
        await onRefreshStation(refreshTargetId)
      } else {
        const added = next.stations[next.stations.length - 1]
        if (added) {
          await onRefreshStation(added.id)
        }
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setFormSaving(false)
    }
  }

  const addStation = () => {
    setDraft(createDraft())
    setEditingId(null)
    setFormTab('relay')
    setDetectedType('idle')
    setFormError('')
    setShowForm(true)
  }

  const editStation = (station: Station) => {
    setDraft({ ...createDraft(), ...station })
    setEditingId(station.id)
    setFormTab(station.stationType === 'deepseek' ? 'provider' : 'relay')
    setDetectedType('idle')
    setFormError('')
    setShowForm(true)
  }

  const resetFormView = () => {
    setEditingId(null)
    setShowForm(false)
  }

  return {
    draft,
    setDraft,
    editingId,
    setEditingId,
    showForm,
    setShowForm,
    formTab,
    setFormTab,
    detectingType,
    detectedType,
    setDetectedType,
    formSaving,
    formError,
    detectStationType,
    saveStation,
    addStation,
    editStation,
    resetFormView
  }
}
