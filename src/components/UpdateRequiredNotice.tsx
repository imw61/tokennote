import { RefreshCw, ShieldAlert } from 'lucide-react'

type UpdateRequiredNoticeProps = {
  currentVersion: string
  latestVersion: string
  minSupportedVersion: string
  notes: string[]
  checking?: boolean
  errorMessage?: string
  onOpenPrimaryDownload: () => void
  onOpenFallbackDownload?: () => void
  onRecheck?: () => void
}

export function UpdateRequiredNotice({
  currentVersion,
  latestVersion,
  minSupportedVersion,
  notes,
  checking = false,
  errorMessage,
  onOpenPrimaryDownload,
  onOpenFallbackDownload,
  onRecheck
}: UpdateRequiredNoticeProps) {
  return (
    <section className="flex items-start gap-4">
      <div className="flex h-[56px] w-[56px] flex-shrink-0 items-center justify-center rounded-[12px] bg-[#fff1f2] ring-1 ring-black/10">
        <ShieldAlert size={26} className="text-[#ff3b30]" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-gray-900">
          TokenNote 必须更新
        </div>
        <div className="mt-1 text-[12.5px] leading-relaxed text-gray-600">
          当前版本 {currentVersion} 已低于最低支持版本 {minSupportedVersion}，需要先升级到 {latestVersion} 或更高版本。
        </div>

        {notes.length > 0 ? (
          <div className="mt-2">
            <div className="text-[12px] font-medium text-gray-500">升级说明：</div>
            <div className="mt-1 max-h-[104px] overflow-auto rounded-[10px] bg-[#f7f7f8] px-3 py-2 ring-1 ring-black/10">
              <div className="space-y-1">
                {notes.map(note => (
                  <div key={note} className="flex items-start gap-2 text-[12px] leading-relaxed text-gray-700">
                    <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-gray-400" />
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            最近一次检查提示：{errorMessage}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {onRecheck ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-[8px] border border-gray-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
              onClick={onRecheck}
              disabled={checking}
            >
              <RefreshCw size={13} className={checking ? 'animate-spin-slow' : ''} />
              {checking ? '检查中' : '重新检查'}
            </button>
          ) : null}
          {onOpenFallbackDownload ? (
            <button
              type="button"
              className="rounded-[8px] border border-gray-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
              onClick={onOpenFallbackDownload}
            >
              备用链接
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-[8px] bg-[#0a84ff] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset] hover:bg-[#0071e3]"
            onClick={onOpenPrimaryDownload}
          >
            立即更新
          </button>
        </div>
      </div>
    </section>
  )
}
