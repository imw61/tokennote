import { useRef } from 'react'
import type { ConfigTransferDialogState } from '../component-props'

type ConfigTransferDialogProps = {
  dialog: ConfigTransferDialogState
  onChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
}

export function ConfigTransferDialog({
  dialog,
  onChange,
  onConfirm,
  onCancel
}: ConfigTransferDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const keyChars = dialog.keyValue.padEnd(6, ' ').slice(0, 6).split('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/45 px-4">
      <div className="w-full max-w-xs rounded-3xl border border-amber-100 bg-white p-4 shadow-2xl">
        <div className="text-sm font-extrabold text-gray-900">{dialog.title}</div>
        <div className="mt-2 whitespace-pre-line text-[12px] leading-relaxed text-gray-600">{dialog.message}</div>
        {dialog.mode === 'key' ? (
          <div className="mt-3">
            <div
              className="relative"
              onClick={() => inputRef.current?.focus()}
            >
              <input
                ref={inputRef}
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                maxLength={6}
                value={dialog.keyValue}
                placeholder={dialog.placeholder}
                aria-label={dialog.placeholder ?? '请输入 6 位密钥'}
                onChange={event => onChange(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onConfirm()
                  }
                }}
                className="absolute inset-0 h-full w-full cursor-text opacity-0"
              />
              <div className="grid grid-cols-6 gap-2">
                {keyChars.map((char, index) => {
                  const filled = char.trim().length > 0
                  const focused = dialog.keyValue.length === index || (dialog.keyValue.length >= 6 && index === 5)
                  return (
                    <div
                      key={index}
                      className={`flex h-12 items-center justify-center rounded-2xl border text-lg font-black tracking-[0.08em] transition-all duration-200 ${
                        focused
                          ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-300/40'
                          : filled
                            ? 'border-amber-200 bg-amber-50/70'
                            : 'border-amber-200 bg-amber-50/40'
                      } text-gray-900`}
                    >
                      {filled ? char : ''}
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="mt-2 text-[10px] font-semibold text-amber-700">{dialog.hint}</div>
            {dialog.error ? (
              <div className="mt-2 text-[10px] font-semibold text-rose-600">{dialog.error}</div>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-extrabold text-gray-600 transition-all duration-200 hover:bg-gray-50"
            onClick={onCancel}
          >
            {dialog.cancelLabel}
          </button>
          <button
            type="button"
            className="rounded-xl bg-amber-500 px-3 py-1.5 text-[11px] font-extrabold text-white transition-all duration-200 hover:bg-amber-600"
            onClick={onConfirm}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
