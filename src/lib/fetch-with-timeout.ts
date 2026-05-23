export type FetchWithTimeoutOptions = RequestInit & {
  timeoutMs?: number
  timeoutMessage?: string
}

export async function fetchWithTimeout(input: RequestInfo | URL, options: FetchWithTimeoutOptions = {}) {
  const {
    timeoutMs = 8000,
    timeoutMessage = '请求超时，请稍后重试。',
    signal,
    ...init
  } = options
  const controller = new AbortController()
  let didTimeout = false

  const abortFromOuterSignal = () => {
    controller.abort()
  }

  if (signal?.aborted) {
    abortFromOuterSignal()
  }

  signal?.addEventListener('abort', abortFromOuterSignal, { once: true })
  const timer = window.setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    })
  } catch (error) {
    if (didTimeout) {
      throw new Error(timeoutMessage)
    }
    throw error
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', abortFromOuterSignal)
  }
}
