type StationSubmitButtonProps = {
  disabled: boolean
  label: string
  onSave: () => void
}

export function StationSubmitButton({ disabled, label, onSave }: StationSubmitButtonProps) {
  return (
    <button
      onClick={onSave}
      disabled={disabled}
      className="w-full py-3 rounded-xl bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-extrabold transition-all duration-200 hover:scale-[1.01] interactive-bounce"
    >
      {label}
    </button>
  )
}
