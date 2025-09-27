export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

export const hasSessionExpired = (timestamp, now = Date.now()) => {
  if (!timestamp) return true
  return now - timestamp > SESSION_MAX_AGE_MS
}
