export function createThrottle<T extends (...args: any[]) => void>(
  fn: T,
  intervalMs: number,
) {
  let last = 0
  let timeout: ReturnType<typeof setTimeout> | null = null
  let pending: Parameters<T> | null = null

  return (...args: Parameters<T>) => {
    const now = performance.now()
    const remaining = intervalMs - (now - last)
    pending = args

    if (remaining <= 0) {
      last = now
      pending = null
      fn(...args)
      return
    }

    if (!timeout) {
      timeout = setTimeout(() => {
        timeout = null
        last = performance.now()
        if (pending) {
          const next = pending
          pending = null
          fn(...next)
        }
      }, remaining)
    }
  }
}
