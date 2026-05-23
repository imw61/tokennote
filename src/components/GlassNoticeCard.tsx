import type { ReactNode, RefObject } from 'react'

export type NoticeThemeName = 'info' | 'warning' | 'danger'

const noticeThemeMap = {
  info: {
    accent: 'bg-[linear-gradient(90deg,rgba(96,165,250,0.95)_0%,rgba(59,130,246,0.82)_55%,rgba(34,211,238,0.72)_100%)]',
    iconWrap:
      'border-white/65 bg-[linear-gradient(180deg,rgba(239,246,255,0.88)_0%,rgba(219,234,254,0.62)_100%)] text-blue-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-sm',
    icon: 'text-blue-600',
    card:
      'border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.9)_0%,rgba(241,245,249,0.74)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-xl',
    content:
      'border-white/55 bg-white/52 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-md',
    button:
      'bg-[linear-gradient(180deg,rgba(37,99,235,0.96)_0%,rgba(29,78,216,0.92)_100%)] shadow-[0_10px_20px_rgba(37,99,235,0.22)] hover:brightness-[1.04]',
  },
  warning: {
    accent: 'bg-[linear-gradient(90deg,rgba(251,191,36,0.96)_0%,rgba(245,158,11,0.84)_55%,rgba(251,191,36,0.72)_100%)]',
    iconWrap:
      'border-white/65 bg-[linear-gradient(180deg,rgba(255,251,235,0.9)_0%,rgba(254,243,199,0.66)_100%)] text-amber-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-sm',
    icon: 'text-amber-600',
    card:
      'border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.9)_0%,rgba(255,247,237,0.74)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-xl',
    content:
      'border-white/55 bg-white/54 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-md',
    button:
      'bg-[linear-gradient(180deg,rgba(245,158,11,0.96)_0%,rgba(217,119,6,0.92)_100%)] shadow-[0_10px_20px_rgba(245,158,11,0.2)] hover:brightness-[1.04]',
  },
  danger: {
    accent: 'bg-[linear-gradient(90deg,rgba(251,113,133,0.96)_0%,rgba(244,63,94,0.84)_55%,rgba(251,113,133,0.72)_100%)]',
    iconWrap:
      'border-white/65 bg-[linear-gradient(180deg,rgba(255,241,242,0.9)_0%,rgba(255,228,230,0.66)_100%)] text-rose-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-sm',
    icon: 'text-rose-600',
    card:
      'border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.9)_0%,rgba(255,241,242,0.74)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-xl',
    content:
      'border-white/55 bg-white/54 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-md',
    button:
      'bg-[linear-gradient(180deg,rgba(225,29,72,0.96)_0%,rgba(190,24,93,0.92)_100%)] shadow-[0_10px_20px_rgba(225,29,72,0.22)] hover:brightness-[1.04]',
  },
} as const

export function resolveNoticeTheme(name?: NoticeThemeName) {
  if (name === 'warning' || name === 'danger') {
    return noticeThemeMap[name]
  }
  return noticeThemeMap.info
}

export function buildNoticeSecondaryButtonClass() {
  return 'border border-white/55 bg-white/58 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-md hover:bg-white/72'
}

type GlassNoticeCardProps = {
  cardRef?: RefObject<HTMLDivElement | null>
  maxWidthClass?: string
  eyebrow: string
  title: string
  themeName?: NoticeThemeName
  icon: ReactNode
  onDrag: (event: React.MouseEvent<HTMLElement>) => void
  children: ReactNode
  footer?: ReactNode
}

export function GlassNoticeCard({
  cardRef,
  maxWidthClass = 'max-w-[408px]',
  eyebrow,
  title,
  themeName = 'info',
  icon,
  onDrag,
  children,
  footer
}: GlassNoticeCardProps) {
  const theme = resolveNoticeTheme(themeName)

  return (
    <div
      ref={cardRef}
      className={`animate-pop-in relative flex w-full ${maxWidthClass} flex-col overflow-hidden rounded-[20px] border ${theme.card}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.42)_0%,rgba(255,255,255,0.12)_34%,transparent_70%)]" />
      <div className={`h-1.5 w-full ${theme.accent}`} />
      <div className="h-2.5 w-full bg-transparent" data-tauri-drag-region onMouseDown={onDrag} />
      <div className="relative z-10 flex-1 px-5 pb-5 pt-2">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${theme.iconWrap}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
              {eyebrow}
            </div>
            <div className="mt-1 text-[17px] font-semibold text-slate-900">
              {title}
            </div>
          </div>
        </div>

        <div className={`mt-4 rounded-2xl border px-4 py-3 ${theme.content}`}>
          {children}
        </div>

        {footer ? (
          <div className="mt-4 flex items-center justify-end border-t border-white/45 pt-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
