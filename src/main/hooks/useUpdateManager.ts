import { useCallback, useEffect, useMemo, useState } from 'react'
import { checkForUpdates, getUpdateDownloadLinks, type UpdateCheckResult } from '../../lib/update'
import {
  getIgnoredUpdateVersion,
  persistIgnoredUpdateVersion,
  syncUpdatePopup
} from '../../lib/update-popup'

export function useUpdateManager() {
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [ignoredUpdateVersion, setIgnoredUpdateVersion] = useState<string | null>(() => getIgnoredUpdateVersion())

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'tokennote.ignoredUpdateVersion') {
        setIgnoredUpdateVersion(getIgnoredUpdateVersion())
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const setIgnoredVersion = useCallback((version: string | null) => {
    persistIgnoredUpdateVersion(version)
    setIgnoredUpdateVersion(version)
  }, [])

  const runUpdateCheck = useCallback(async (silent = false) => {
    if (!silent) setCheckingUpdates(true)
    try {
      const result = await checkForUpdates()
      setUpdateInfo(result)
      const storedIgnoredVersion = getIgnoredUpdateVersion()
      const nextIgnoredVersion = result.status === 'none' || result.status === 'required'
        ? null
        : storedIgnoredVersion
      if (nextIgnoredVersion !== storedIgnoredVersion) {
        setIgnoredVersion(nextIgnoredVersion)
      } else {
        setIgnoredUpdateVersion(storedIgnoredVersion)
      }
      await syncUpdatePopup(result, nextIgnoredVersion).catch(console.error)
    } finally {
      if (!silent) setCheckingUpdates(false)
    }
  }, [setIgnoredVersion])

  const restoreUpdateReminder = useCallback(async () => {
    setIgnoredVersion(null)
    if (updateInfo) {
      await syncUpdatePopup(updateInfo, null).catch(console.error)
    }
  }, [setIgnoredVersion, updateInfo])

  const updateManifest = updateInfo?.manifest
  const updateLinks = updateManifest ? getUpdateDownloadLinks(updateManifest) : []
  const primaryUpdateLink = updateLinks[0]?.url ?? ''
  const fallbackUpdateLink = updateLinks[1]?.url
  const isLatestVersionIgnored = Boolean(
    updateManifest &&
    updateInfo?.status === 'available' &&
    ignoredUpdateVersion === updateManifest.latestVersion
  )

  const updateStatusText = useMemo(() => {
    if (!updateInfo) return '启动后会自动检查一次更新。'
    if (updateInfo.status === 'error') {
      return `更新检查失败：${updateInfo.errorMessage || '未知错误'}`
    }
    if (updateInfo.status === 'required' && updateManifest) {
      return `当前版本低于最低支持版本 v${updateManifest.minSupportedVersion}，需要尽快升级。`
    }
    if (updateInfo.status === 'available' && updateManifest && isLatestVersionIgnored) {
      return `新版本 v${updateManifest.latestVersion} 已被忽略，可手动更新或恢复提醒。`
    }
    if (updateInfo.status === 'available' && updateManifest) {
      return `发现新版本 v${updateManifest.latestVersion}，启动时会弹窗提醒。`
    }
    return `当前已是最新版本 v${updateInfo.currentVersion}。`
  }, [isLatestVersionIgnored, updateInfo, updateManifest])

  return {
    updateInfo,
    checkingUpdates,
    primaryUpdateLink,
    fallbackUpdateLink,
    isLatestVersionIgnored,
    updateStatusText,
    runUpdateCheck,
    restoreUpdateReminder
  }
}
