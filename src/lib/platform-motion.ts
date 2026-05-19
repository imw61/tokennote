export function applyPlatformMotionPreference() {
  if (typeof window === 'undefined') return
  if (typeof navigator === 'undefined') return

  const userAgent = navigator.userAgent.toLowerCase()
  const isWindows = userAgent.includes('windows')
  if (!isWindows) return

  document.documentElement.classList.add('force-motion')
}

