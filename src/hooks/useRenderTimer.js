import { useEffect, useMemo, useRef, useState } from "react"

const defaultThresholds = []

const buildStatus = (duration, thresholds = defaultThresholds) => {
  if (!Number.isFinite(duration)) {
    return "pending"
  }
  if (!thresholds.length) {
    return "ok"
  }
  const breached = thresholds.find((threshold) => duration > threshold.limit)
  return breached ? `breached:${breached.label || "threshold"}` : "ok"
}

export function useRenderTimer({
  name,
  dependencies = [],
  thresholds = defaultThresholds,
  enabled = true,
} = {}) {
  const startRef = useRef(enabled ? performance.now() : 0)
  const lastLoggedRef = useRef(null)
  const [duration, setDuration] = useState(null)

  useEffect(() => {
    if (!enabled) return undefined
    startRef.current = performance.now()
    lastLoggedRef.current = null
    if (name) {
      performance.mark?.(`${name}:start`)
    }
    let frame = requestAnimationFrame(() => {
      const elapsed = performance.now() - startRef.current
      setDuration(elapsed)
      const rounded = Number.isFinite(elapsed) ? Number(elapsed.toFixed(1)) : null
      if (rounded !== null && lastLoggedRef.current !== rounded) {
        console.debug?.(
          `[perf] ${name || "render"} completed in ${rounded.toFixed(1)}ms`,
        )
        lastLoggedRef.current = rounded
      }
      if (name) {
        performance.mark?.(`${name}:end`)
        performance.measure?.(name, `${name}:start`, `${name}:end`)
      }
      thresholds.forEach((threshold) => {
        if (elapsed > threshold.limit) {
          console.warn(
            `[perf] ${name || "render"} exceeded ${threshold.label || threshold.limit}ms: ${elapsed.toFixed(1)}ms`,
          )
        }
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [enabled, name, thresholds, ...dependencies])

  const status = useMemo(() => buildStatus(duration, thresholds), [duration, thresholds])

  const dataAttributes = useMemo(
    () => ({
      "data-perf-metric": name || "render",
      "data-perf-duration": duration ? duration.toFixed(1) : undefined,
      "data-perf-status": status,
    }),
    [duration, name, status],
  )

  return { duration, status, dataAttributes }
}

export default useRenderTimer
