/// <reference types="vite/client" />

import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import type { AppData } from '../main/types'

export type StationReviewInput = {
  stationName: string
  baseUrl: string
  stationType: string
  rating: number
  title: string
  content: string
  reviewerName: string
}

export type StationReviewRecord = {
  id: number
  createdAt: string
  stationName: string
  baseUrl: string
  stationType: string
  rating: number
  title: string
  content: string
  reviewerName: string
  clientVersion: string
  source: string
}

const reviewApiUrl = 'https://update.tokennote.dev/api/reviews'

async function resolveCurrentVersion() {
  try {
    return (await getVersion()).trim().replace(/^[vV]/, '')
  } catch {
    return '0.0.0'
  }
}

export async function submitStationReview(input: StationReviewInput): Promise<StationReviewRecord> {
  const currentVersion = await resolveCurrentVersion()
  const response = await fetch(reviewApiUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-tokennote-version': currentVersion,
      'x-tokennote-source': 'desktop'
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
