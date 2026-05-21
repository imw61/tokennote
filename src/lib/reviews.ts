/// <reference types="vite/client" />

import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import type { AppData } from '../main/types'

export type StationReviewInput = {
  stationName: string
  baseUrl: string
  stationType: string
  rating: number
  content: string
}

export type StationReviewRecord = {
  id: number
  createdAt: string
  stationName: string
  baseUrl: string
  stationType: string
  rating: number
  content: string
  clientVersion: string
  source: string
}

export const stationReviewRatingLabels: Record<number, string> = {
  1: '拉完了',
  2: 'NPC',
  3: '人上人',
  4: '顶级',
  5: '夯爆了'
}

export function formatStationReviewRatingLabel(rating: number) {
  return stationReviewRatingLabels[rating] ?? `${rating} 星`
}

const reviewApiUrl = 'https://update.tokennote.dev/api/reviews'

async function resolveCurrentVersion() {
  try {
    return (await getVersion()).trim().replace(/^[vV]/, '')
  } catch {
    return '0.0.0'
  }
}

async function resolveMachineUuid() {
  try {
    return (await invoke<string>('get_machine_uuid')).trim()
  } catch {
    return ''
  }
}

export async function submitStationReview(input: StationReviewInput): Promise<StationReviewRecord> {
  const currentVersion = await resolveCurrentVersion()
  const machineUuid = await resolveMachineUuid()
  const response = await fetch(reviewApiUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-tokennote-version': currentVersion,
      'x-tokennote-source': 'desktop',
      ...(machineUuid ? { 'x-tokennote-machine-uuid': machineUuid } : {})
    },
    body: JSON.stringify(input)
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.error || `提交评价失败：HTTP ${response.status}`)
  }

  const payload = await response.json() as { item: StationReviewRecord }
  return payload.item
}

export async function saveLocalStationReviewRecord(input: {
  stationId: string
  stationName: string
  baseUrl: string
  stationType: string
  rating: number
  content: string
}) {
  return invoke<AppData>('save_station_review_record', { input })
}
