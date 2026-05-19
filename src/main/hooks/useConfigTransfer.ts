import type { Dispatch, SetStateAction } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { message, open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { useRef, useState } from 'react'
import { decryptConfigPayload, encryptConfigPayload, validateTransferKey } from '../../lib/config-transfer-crypto'
import { buildConfigExport, parseConfigImport } from '../../lib/config-transfer'
import type { ConfigTransferDialogState } from '../component-props'
import type { AppData } from '../types'

type UseConfigTransferOptions = {
  data: AppData
  setData: Dispatch<SetStateAction<AppData>>
  resetViewState: () => void
  onRefreshAll: () => Promise<void>
}

export function useConfigTransfer({ data, setData, resetViewState, onRefreshAll }: UseConfigTransferOptions) {
  const [exportingConfig, setExportingConfig] = useState(false)
  const [importingConfig, setImportingConfig] = useState(false)
  const [configTransferDialog, setConfigTransferDialog] = useState<ConfigTransferDialogState | null>(null)
  const confirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null)
  const keyResolverRef = useRef<((key: string | null) => void) | null>(null)

  const closeConfigTransferDialog = () => {
    setConfigTransferDialog(null)
    confirmResolverRef.current = null
    keyResolverRef.current = null
  }

  const requestConfirmation = (messageText: string, confirmLabel: string) => new Promise<boolean>(resolve => {
    confirmResolverRef.current = resolve
    setConfigTransferDialog({
      mode: 'confirm',
      title: '确认操作',
      message: messageText,
      confirmLabel,
      cancelLabel: '取消',
      keyValue: ''
    })
  })

  const requestTransferKey = (title: string, messageText: string, confirmLabel: string) => new Promise<string | null>(resolve => {
    keyResolverRef.current = resolve
    setConfigTransferDialog({
      mode: 'key',
      title,
      message: messageText,
      confirmLabel,
      cancelLabel: '取消',
      keyValue: '',
      placeholder: '请输入 6 位密钥',
      hint: '仅支持 6 位英文数字混合密钥，输入后会自动转成大写。'
    })
  })

  const requestExportTransferKey = async () => {
    const key = await requestTransferKey('设置导出 key', '请输入用于导出配置的 6 位英文数字混合密钥。输入内容会自动转成大写。', '下一步')
    if (!key) return null
    const confirmation = await requestTransferKey('确认导出 key', '请再次输入同一个 6 位密钥，防止导出时输错。', '确认')
    if (!confirmation) return null
    if (confirmation !== key) {
      throw new Error('两次输入的 key 不一致。')
    }
    return key
  }

  const exportConfig = async () => {
    const confirmed = await requestConfirmation(
      '导出配置前需要输入 6 位英文数字混合密钥对内容加密。\n\n输入内容会自动转成大写。加密后文件仍包含站点地址、账号、密码、Cookie、API Key 和本机评价记录等敏感数据，请务必记住密钥并妥善保管文件。',
      '继续导出'
    )
    if (!confirmed) return
    setExportingConfig(true)
    try {
      const transferKey = await requestExportTransferKey()
      if (!transferKey) return
      const exportPayload = buildConfigExport({
        settings: data.settings,
        stations: data.stations,
        localStationReviews: data.localStationReviews
      })
      const filePath = await save({
        title: '导出 TokenNote 配置',
        defaultPath: `tokennote-config-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (!filePath) return
      const encryptedPayload = await encryptConfigPayload(JSON.stringify(exportPayload), transferKey)
      await writeTextFile(filePath, encryptedPayload)
      await message('配置已导出并加密。导入时需要输入相同的 6 位密钥，请务必牢记。', {
        title: '导出成功',
        kind: 'info'
      })
    } catch (error) {
      console.error(error)
      await message(`导出失败：${error instanceof Error ? error.message : String(error)}`, {
        title: '导出失败',
        kind: 'error'
      })
    } finally {
      setExportingConfig(false)
    }
  }

  const importConfig = async () => {
    const confirmed = await requestConfirmation(
      '导入配置时需要输入导出时设置的 6 位英文数字混合密钥进行解密。\n\n输入内容会自动转成大写。导入会覆盖当前的站点、偏好设置和本机评价记录，请确认文件来源可信。',
      '继续导入'
    )
    if (!confirmed) return
    setImportingConfig(true)
    try {
      const selected = await open({
        title: '导入 TokenNote 配置',
        multiple: false,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (!selected || Array.isArray(selected)) return
      const raw = await readTextFile(selected)
      const transferKey = await requestTransferKey('输入导入 key', '请输入导出时设置的 6 位密钥，用于解密配置文件。', '开始解密')
      if (!transferKey) return
      const decrypted = await decryptConfigPayload(raw, transferKey)
      const imported = parseConfigImport(decrypted)
      const nextData = await invoke<AppData>('import_app_data', { input: imported })
      setData(nextData)
      resetViewState()
      try {
        await onRefreshAll()
        await message('配置已解密、导入并刷新完成。', {
          title: '导入成功',
          kind: 'info'
        })
      } catch (refreshError) {
        console.error(refreshError)
        await message('配置已导入，但刷新失败，请稍后手动刷新一次。', {
          title: '导入成功',
          kind: 'warning'
        })
      }
    } catch (error) {
      console.error(error)
      await message(`导入失败：${error instanceof Error ? error.message : String(error)}`, {
        title: '导入失败',
        kind: 'error'
      })
    } finally {
      setImportingConfig(false)
    }
  }

  const onConfigTransferDialogChange = (value: string) => {
    const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    setConfigTransferDialog(current => current && current.mode === 'key'
      ? { ...current, keyValue: normalized, error: undefined }
      : current)
  }

  const onConfigTransferDialogCancel = () => {
    if (confirmResolverRef.current) {
      confirmResolverRef.current(false)
    }
    if (keyResolverRef.current) {
      keyResolverRef.current(null)
    }
    closeConfigTransferDialog()
  }

  const onConfigTransferDialogConfirm = () => {
    if (!configTransferDialog) return
    if (configTransferDialog.mode === 'confirm') {
      confirmResolverRef.current?.(true)
      closeConfigTransferDialog()
      return
    }
    try {
      const key = validateTransferKey(configTransferDialog.keyValue)
      keyResolverRef.current?.(key)
      closeConfigTransferDialog()
    } catch (error) {
      setConfigTransferDialog(current => current && current.mode === 'key'
        ? { ...current, error: error instanceof Error ? error.message : String(error) }
        : current)
    }
  }

  return {
    exportingConfig,
    importingConfig,
    configTransferDialog,
    exportConfig,
    importConfig,
    onConfigTransferDialogChange,
    onConfigTransferDialogConfirm,
    onConfigTransferDialogCancel
  }
}
