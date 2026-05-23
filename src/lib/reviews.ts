/// <reference types="vite/client" />

import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { fetchWithTimeout } from './fetch-with-timeout'
import { getSourceLabel } from './platform'
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

type ApiSuccess<T> = {
  ok: true
  data: T
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

const reviewApiUrl = 'https://update.tokennote.dev/public/review-submit'

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

function normalizeReviewRequestError(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.trim()
    if (message) {
      return message
    }
  }
  return '无法连接评价服务，请稍后重试。'
}

export async function submitStationReview(input: StationReviewInput): Promise<StationReviewRecord> {
  const currentVersion = await resolveCurrentVersion()
  const machineUuid = await resolveMachineUuid()
  try {
    const response = await fetchWithTimeout(reviewApiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        ...input,
        clientVersion: currentVersion,
        // source 上报具体平台:windows / macos / linux / android / ios。
        source: getSourceLabel(),
        machineUuid
      }),
      timeoutMs: 8000,
      timeoutMessage: '连接评价服务超时，请稍后重试。'
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      throw new Error(payload?.error || `提交评价失败：HTTP ${response.status}`)
    }

    const payload = await response.json() as ApiSuccess<StationReviewRecord>
    return payload.data
  } catch (error) {
    throw new Error(normalizeReviewRequestError(error))
  }
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
