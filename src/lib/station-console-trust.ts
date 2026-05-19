const storageKey = 'tokennote.trustedConsoleOrigins'

function readTrustedOrigins() {
  try {
    const raw = window.localStorage.getItem(storageKey)
    const value = raw ? JSON.parse(raw) : []
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : []
  } catch {
    return []
  }
}

export function isTrustedConsoleOrigin(origin: string) {
  return readTrustedOrigins().includes(origin)
}

export function trustConsoleOrigin(origin: string) {
  const next = Array.from(new Set([...readTrustedOrigins(), origin]))
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(next))
  } catch {
    // Ignore storage failures and keep confirmation best-effort.
  }
}
