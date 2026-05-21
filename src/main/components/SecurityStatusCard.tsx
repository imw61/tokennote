import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ShieldCheck } from 'lucide-react'

/**
 * 本地凭据安全状态卡片
 *
 * 仅负责展示当前设备的加密指纹与算法摘要。
 * 机器码本身不会渲染，只显示其 SHA-256 哈希的前 8 位 hex，
 * 用于让用户直观感知“当前设备的密钥派生材料”。
 */
async function computeFingerprint(machineUuid: string): Promise<string> {
  const trimmed = machineUuid.trim()
  if (!trimmed) {
    return ''
  }
  const buffer = new TextEncoder().encode(trimmed)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  const bytes = new Uint8Array(digest)
  return Array.from(bytes.slice(0, 4))
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

export function SecurityStatusCard() {
  const [fingerprint, setFingerprint] = useState<string>('')
  const [errored, setErrored] = useState<boolean>(false)

  useEffect(() => {
    let cancelled = false
    invoke<string>('get_machine_uuid')
      .then(async raw => {
        const value = await computeFingerprint(raw)
        if (cancelled) return
        if (!value) {
          setErrored(true)
          return
        }
        setFingerprint(value)
      })
      .catch(() => {
        if (cancelled) return
        setErrored(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const fingerprintText = errored
    ? '读取失败'
    : fingerprint
      ? fingerprint
      : '计算中…'

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <ShieldCheck size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <strong className="text-xs font-bold text-emerald-900">本地凭据安全</strong>
          <div className="mt-1 text-[11px] leading-relaxed text-emerald-800">
            账号、密码已与本机绑定加密，配置文件即使被复制到其它电脑也无法读取。
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-emerald-200/80 bg-white/70 px-3 py-2">
            <span className="text-[10px] font-bold text-emerald-700">本机标识</span>
            <code className="font-mono text-[11px] font-extrabold tracking-wider text-emerald-900">
              {fingerprintText}
            </code>
          </div>
          <div className="mt-2 text-[10px] leading-relaxed text-emerald-700/90">
            更换电脑或重装系统后请通过“导入配置”恢复数据。
          </div>
        </div>
      </div>
    </div>
  )
}
