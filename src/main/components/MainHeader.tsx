import { ArrowLeft, Home, Minus, Pin, RefreshCw, Settings, X } from 'lucide-react'
import type { MainHeaderProps } from '../component-props'

export function MainHeader({
  title,
  alwaysOnTop,
  loading,
  showSettings,
  onDragWindow,
  onOpenWebsite,
  onMinimize,
  onToggleAlwaysOnTop,
  onRefreshAll,
  onToggleSettings,
  onClose
}: MainHeaderProps) {
  return (
    <header
      className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 select-none animate-fade-up"
      data-tauri-drag-region
      onMouseDown={onDragWindow}
    >
      <div className="min-w-0" data-tauri-drag-region>
        <h1 className="text-[22px] font-extrabold text-gray-900 tracking-[-0.04em] leading-none truncate">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          className="w-7 h-7 flex items-center justify-center rounded-[10px] bg-gray-100 hover:bg-primary-50 hover:text-primary-600 text-gray-500 transition-all duration-200 interactive-bounce"
          onClick={onOpenWebsite}
          aria-label="打开官网首页"
          title="官网首页"
        >
          <Home size={14} />
        </button>
        <button
          className="w-7 h-7 flex items-center justify-center rounded-[10px] bg-gray-100 hover:bg-gray-200 text-gray-500 transition-all duration-200 interactive-bounce"
          onClick={onMinimize}
          aria-label="最小化"
        >
          <Minus size={14} />
        </button>
        <button
          className={`w-7 h-7 flex items-center justify-center rounded-[10px] transition-all duration-200 interactive-bounce ${
            alwaysOnTop
              ? 'bg-primary-50 text-primary-600 hover:bg-primary-100'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-500'
          }`}
          onClick={onToggleAlwaysOnTop}
          aria-label={alwaysOnTop ? '取消置顶' : '窗口置顶'}
        >
          <Pin size={14} />
        </button>
        <button
          className="w-7 h-7 flex items-center justify-center rounded-[10px] bg-gray-100 hover:bg-gray-200 text-gray-500 transition-all duration-200 interactive-bounce"
          onClick={onRefreshAll}
          aria-label="刷新全部"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin-slow' : ''} />
        </button>
        <button
          className={`w-7 h-7 flex items-center justify-center rounded-[10px] transition-all duration-200 interactive-bounce ${
            showSettings
              ? 'bg-primary-50 text-primary-600 hover:bg-primary-100'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-500'
          }`}
          onClick={onToggleSettings}
          aria-label={showSettings ? '返回' : '设置'}
        >
          {showSettings ? <ArrowLeft size={14} /> : <Settings size={14} />}
        </button>
        <button
          className="w-7 h-7 flex items-center justify-center rounded-[10px] bg-gray-100 hover:bg-red-50 hover:text-red-500 text-gray-500 transition-all duration-200 interactive-bounce"
          onClick={onClose}
          aria-label="关闭"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  )
}
