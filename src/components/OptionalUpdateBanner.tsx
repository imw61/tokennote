import { ArrowUpCircle } from 'lucide-react'

type OptionalUpdateBannerProps = {
  currentVersion: string
  latestVersion: string
  notes: string[]
  onOpenPrimaryDownload: () => void
  onOpenFallbackDownload?: () => void
  onDismiss: () => void
  onIgnoreVersion: () => void
}

export function OptionalUpdateBanner({
  currentVersion,
  latestVersion,
  notes,
  onOpenPrimaryDownload,
  onOpenFallbackDownload,
  onDismiss,
  onIgnoreVersion
}: OptionalUpdateBannerProps) {
  return (
    <section className="flex items-start gap-4">
      <div className="flex h-[56px] w-[56px] flex-shrink-0 items-center justify-center rounded-[12px] bg-[#f3f4f6] ring-1 ring-black/10">
        <ArrowUpCircle size={26} className="text-[#0a84ff]" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-gray-900">
          TokenNote 有可用更新
        </div>
        <div className="mt-1 text-[12.5px] leading-relaxed text-gray-600">
          TokenNote {latestVersion} 现已可用 — 你当前是 {currentVersion}。是否现在下载？
        </div>

        {notes.length > 0 ? (
          <div className="mt-2">
            <div className="text-[12px] font-medium text-gray-500">更新内容：</div>
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

        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-[8px] border border-gray-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
            onClick={onIgnoreVersion}
          >
            忽略本次
          </button>
          <button
            type="button"
            className="rounded-[8px] border border-gray-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
            onClick={onDismiss}
          >
            稍后提醒
          </button>
          <button
            type="button"
            className="rounded-[8px] bg-[#0a84ff] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset] hover:bg-[#0071e3]"
            onClick={onOpenPrimaryDownload}
          >
            立即更新
          </button>
          {onOpenFallbackDownload ? (
            <button
              type="button"
              className="rounded-[8px] border border-gray-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
              onClick={onOpenFallbackDownload}
            >
              备用链接
            </button>
          ) : null}
        </div>

      </div>
    </section>
  )
}
