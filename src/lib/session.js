export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

export const hasSessionExpired = (timestamp, now = Date.now()) => {
  if (timestamp == null) return false

  const normalizedTimestamp =
    typeof timestamp === "number" ? timestamp : Number(timestamp)

  if (!Number.isFinite(normalizedTimestamp)) {
    return true
  }

  return now - normalizedTimestamp > SESSION_MAX_AGE_MS
}
