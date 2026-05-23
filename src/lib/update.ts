/// <reference types="vite/client" />

import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { fetchWithTimeout } from './fetch-with-timeout'
import { validateExternalUrl } from './safe-external-url'

export type UpdateManifest = {
  latestVersion: string
  minSupportedVersion: string
  releaseUrl: string
  fallbackReleaseUrl?: string
  publishedAt?: string
  notes: string[]
}

export type UpdateLink = {
  label: string
  url: string
}

export type UpdateStatus = 'none' | 'available' | 'required' | 'error'

export type UpdateCheckResult = {
  status: UpdateStatus
  currentVersion: string
  manifestUrl: string
  manifest?: UpdateManifest
  errorMessage?: string
}

type ApiSuccess<T> = {
  ok: true
  data: T
}

const updateManifestUrl = validateExternalUrl('https://update.tokennote.dev/public/version')

function normalizeVersion(version: string) {
  return version.trim().replace(/^[vV]/, '')
}

function parseVersionParts(version: string) {
  return normalizeVersion(version)
    .split('.')
    .map(part => Number.parseInt(part, 10))
    .map(part => Number.isFinite(part) ? part : 0)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseNotes(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim())
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(Boolean)
  }
  return []
}

async function resolveCurrentVersion() {
  try {
    return normalizeVersion(await getVersion())
  } catch {
    return '0.0.0'
  }
}

function normalizeManifest(raw: unknown): UpdateManifest {
  if (!isRecord(raw)) {
    throw new Error('版本信息结构无效')
  }

  const latestVersion = typeof raw.latestVersion === 'string' ? normalizeVersion(raw.latestVersion) : ''
  const minSupportedVersion = typeof raw.minSupportedVersion === 'string' ? normalizeVersion(raw.minSupportedVersion) : ''
  const releaseUrl = typeof raw.releaseUrl === 'string' ? raw.releaseUrl.trim() : ''
  const fallbackReleaseUrl = typeof raw.fallbackReleaseUrl === 'string' && raw.fallbackReleaseUrl.trim()
    ? raw.fallbackReleaseUrl.trim()
    : undefined
  const publishedAt = typeof raw.publishedAt === 'string' && raw.publishedAt.trim() ? raw.publishedAt.trim() : undefined
  const notes = parseNotes(raw.notes)

  if (!latestVersion) {
    throw new Error('版本信息缺少 `latestVersion`')
  }
  if (!minSupportedVersion) {
    throw new Error('版本信息缺少 `minSupportedVersion`')
  }
  if (!releaseUrl) {
    throw new Error('版本信息缺少 `releaseUrl`')
  }

  const safeReleaseUrl = validateExternalUrl(releaseUrl, { allowHttpLoopback: true })
  const safeFallbackReleaseUrl = fallbackReleaseUrl
    ? validateExternalUrl(fallbackReleaseUrl, { allowHttpLoopback: true })
    : undefined

  return {
    latestVersion,
    minSupportedVersion,
    releaseUrl: safeReleaseUrl,
    fallbackReleaseUrl: safeFallbackReleaseUrl,
    publishedAt,
    notes
  }
}

export function compareVersions(left: string, right: string) {
  const leftParts = parseVersionParts(left)
  const rightParts = parseVersionParts(right)
  const maxLength = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0
    const rightValue = rightParts[index] ?? 0
    if (leftValue > rightValue) return 1
    if (leftValue < rightValue) return -1
  }

  return 0
}

async function resolveMachineUuid(): Promise<string> {
  try {
    return await invoke<string>('get_machine_uuid')
  } catch {
    return ''
  }
}

function appendManifestRequestMetadata(manifestUrl: string, currentVersion: string, machineUuid: string) {
  const url = new URL(manifestUrl)
  url.searchParams.set('clientVersion', currentVersion)
  url.searchParams.set('source', 'desktop')
  if (machineUuid) {
    url.searchParams.set('machineUuid', machineUuid)
  }
  return url.toString()
}

export function getUpdateDownloadLinks(manifest: UpdateManifest): UpdateLink[] {
  const links = [
    { label: '主链接', url: manifest.releaseUrl },
    manifest.fallbackReleaseUrl ? { label: '备用链接', url: manifest.fallbackReleaseUrl } : null
  ].filter((item): item is UpdateLink => Boolean(item))

  const uniqueLinks: UpdateLink[] = []
  for (const link of links) {
    if (!uniqueLinks.some(item => item.url === link.url)) {
      uniqueLinks.push(link)
    }
  }
  return uniqueLinks
}

function normalizeUpdateRequestError(error: unknown) {
  if (error instanceof Error) {
    if (error.message.trim()) {
      return error.message
    }
  }
  return '无法连接更新服务，已跳过本次检查。'
}

export async function checkForUpdates(signal?: AbortSignal): Promise<UpdateCheckResult> {
  const currentVersion = await resolveCurrentVersion()
  const manifestUrl = updateManifestUrl
  const machineUuidValue = await resolveMachineUuid()
  const requestUrl = appendManifestRequestMetadata(manifestUrl, currentVersion, machineUuidValue)

  try {
    const response = await fetchWithTimeout(requestUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        accept: 'application/json'
      },
      signal,
      timeoutMs: 8000,
      timeoutMessage: '连接更新服务超时，已跳过本次检查。'
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const payload = await response.json() as ApiSuccess<unknown>
    const manifest = normalizeManifest(payload.data)
    const isRequired = compareVersions(currentVersion, manifest.minSupportedVersion) < 0
    const hasNewVersion = compareVersions(currentVersion, manifest.latestVersion) < 0

    return {
      status: isRequired ? 'required' : hasNewVersion ? 'available' : 'none',
      currentVersion,
      manifestUrl,
      manifest
    }
  } catch (error) {
    return {
      status: 'error',
      currentVersion,
      manifestUrl,
      errorMessage: normalizeUpdateRequestError(error)
    }
  }
}
