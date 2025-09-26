import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  createCashBurnAlert,
  getCashBurnAlerts,
  getCashBurnPreferences,
  getCashBurnReports,
  recordCashBurnAlertEvent,
  subscribeToCashBurnAlerts,
  updateCashBurnAlert,
  updateCashBurnPreferences,
} from "../lib/supabase"

const POLL_INTERVAL_MS = 60 * 1000

const FALLBACK_PREFERENCES = (userId) => ({
  userId,
  planTier: "free",
  cadence: "weekly",
  trackedCategories: ["Dining Out", "Rideshare", "Subscriptions"],
  quietHours: { start: "21:00", end: "07:00" },
  alertThresholds: { default: 150 },
  sponsorSlot: {
    label: "Upgrade to Pocket Budget Pro",
    message: "Unlock proactive alerts and unlimited report history.",
    cta: "See plans",
    href: "https://pocketbudget.example.com/upgrade",
  },
})

const parseTimeToMinutes = (timeString) => {
  if (!timeString || typeof timeString !== "string") return null
  const [hours, minutes] = timeString.split(":").map((value) => parseInt(value, 10))
  if (Number.isNaN(hours)) return null
  return hours * 60 + (Number.isNaN(minutes) ? 0 : minutes)
}

const isWithinQuietHours = (quietHours) => {
  if (!quietHours) return false
  const start = parseTimeToMinutes(quietHours.start)
  const end = parseTimeToMinutes(quietHours.end)
  if (start === null || end === null || start === end) return false

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  if (start < end) {
    return currentMinutes >= start && currentMinutes < end
  }

  return currentMinutes >= start || currentMinutes < end
}

const normalizeCategoryKey = (category) => category?.toString().trim().toLowerCase() || "default"

const derivePaceStatus = (report) => {
  if (!report) return "neutral"
  if (report.pace) return report.pace
  if (!report.plannedBurn) return "neutral"

  const variance = report.totalBurn - report.plannedBurn
  if (variance > report.plannedBurn * 0.05) return "over"
  if (variance < report.plannedBurn * -0.05) return "under"
  return "on-track"
}

const attachComparisons = (reports = []) =>
  reports.map((report, index) => {
    const previous = reports[index + 1]
    const delta = previous ? report.totalBurn - previous.totalBurn : 0
    const deltaPercent = previous && previous.totalBurn ? (delta / previous.totalBurn) * 100 : null

    return {
      ...report,
      pace: derivePaceStatus(report),
      weekOverWeekDelta: delta,
      weekOverWeekDeltaPercent: deltaPercent,
    }
  })

const mergeAlert = (existingAlerts, newAlert) => {
  const idx = existingAlerts.findIndex((alert) => alert.id === newAlert.id)
  if (idx === -1) {
    return [newAlert, ...existingAlerts]
  }
  const updated = [...existingAlerts]
  updated[idx] = { ...updated[idx], ...newAlert }
  return updated
}

const mapAlertPayload = (rawAlert) => {
  if (!rawAlert) return null
  return {
    id: rawAlert.id,
    userId: rawAlert.userId || rawAlert.user_id,
    category: rawAlert.category,
    currentBurn: rawAlert.currentBurn ?? rawAlert.current_burn,
    threshold: rawAlert.threshold,
    status: rawAlert.status,
    scheduledFor: rawAlert.scheduledFor ?? rawAlert.scheduled_for,
    lastTriggeredAt: rawAlert.lastTriggeredAt ?? rawAlert.last_triggered_at,
    channel: rawAlert.channel || "in-app",
    message: rawAlert.message,
    createdAt: rawAlert.createdAt ?? rawAlert.created_at,
  }
}

export function useCashBurnAnalytics(userId) {
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState([])
  const [preferences, setPreferences] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [nudges, setNudges] = useState([])
  const deliveredAlertIdsRef = useRef(new Set())
  const preferencesRef = useRef(null)
  const pollTimerRef = useRef(null)
  const subscriptionCleanupRef = useRef(null)

  const isPaidPlan = preferences?.planTier && preferences.planTier !== "free"

  const queueNudgeForAlert = useCallback(
    (alert) => {
      const prefs = preferencesRef.current
      if (!prefs || prefs.planTier === "free") return
      if (!alert || !alert.id) return
      if (deliveredAlertIdsRef.current.has(alert.id)) return
      if (isWithinQuietHours(prefs.quietHours)) return

      const categoryKey = normalizeCategoryKey(alert.category)
      const threshold = prefs.alertThresholds?.[categoryKey] ?? prefs.alertThresholds?.default

      if (threshold && typeof alert.currentBurn === "number" && alert.currentBurn < threshold) {
        return
      }

      deliveredAlertIdsRef.current.add(alert.id)

      const severity = threshold && alert.currentBurn >= threshold * 1.25 ? "high" : "medium"
      const delta = threshold ? alert.currentBurn - threshold : null

      setNudges((existing) => [
        {
          id: `${alert.id}-nudge`,
          alertId: alert.id,
          category: alert.category,
          message:
            alert.message ||
            `Your ${alert.category ?? "cash burn"} spending is tracking ${delta ? `+$${delta.toFixed(0)}` : "over"} this week`,
          severity,
          createdAt: new Date().toISOString(),
        },
        ...existing,
      ])

      recordCashBurnAlertEvent(alert.id).catch((error) => {
        console.error("Unable to record cash burn alert delivery", error)
      })
    },
    [],
  )

  const loadReports = useCallback(async () => {
    if (!userId) return
    const { data, error } = await getCashBurnReports(userId)
    if (error) {
      console.error("Unable to load cash burn reports", error)
      return
    }
    setReports(attachComparisons(data))
  }, [userId])

  const loadAlerts = useCallback(
    async (options = { hydrateNudges: true }) => {
      if (!userId) return
      const { data, error } = await getCashBurnAlerts(userId)
      if (error) {
        console.error("Unable to load cash burn alerts", error)
        return
      }
      setAlerts(data)

      if (options.hydrateNudges && preferencesRef.current?.planTier !== "free") {
        data
          .filter((alert) => alert.status === "ready" || alert.status === "pending")
          .forEach((alert) => queueNudgeForAlert(alert))
      }
    },
    [queueNudgeForAlert, userId],
  )

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  const startPolling = useCallback(() => {
    stopPolling()
    if (!userId) return
    pollTimerRef.current = setInterval(() => {
      loadAlerts({ hydrateNudges: false })
    }, POLL_INTERVAL_MS)
  }, [loadAlerts, userId])

  const bootstrap = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [preferencesResult, reportsResult] = await Promise.all([
        getCashBurnPreferences(userId),
        getCashBurnReports(userId),
      ])

      const { data: rawPreferences, error: prefsError } = preferencesResult

      if (prefsError) {
        console.error("Unable to load cash burn preferences", prefsError)
      }

      let resolvedPreferences = rawPreferences
      if (!resolvedPreferences) {
        const fallback = FALLBACK_PREFERENCES(userId)
        const { data: createdPrefs, error: createError } = await updateCashBurnPreferences(userId, fallback)
        if (createError) {
          console.error("Unable to persist default cash burn preferences", createError)
          resolvedPreferences = fallback
        } else {
          resolvedPreferences = createdPrefs || fallback
        }
      }

      setPreferences(resolvedPreferences)
      preferencesRef.current = resolvedPreferences

      if (reportsResult.error) {
        console.error("Unable to load cash burn reports", reportsResult.error)
      }
      setReports(attachComparisons(reportsResult.data || []))

      await loadAlerts()
    } finally {
      setLoading(false)
    }
  }, [loadAlerts, userId])

  useEffect(() => {
    if (!userId) return () => {}

    bootstrap()

    startPolling()

    const unsubscribe = subscribeToCashBurnAlerts(userId, (payload) => {
      if (!payload) return
      const eventType = payload.eventType || payload.type
      if (eventType === "DELETE") {
        const deletedId = payload.old?.id || payload.id
        if (!deletedId) return
        deliveredAlertIdsRef.current.delete(deletedId)
        setAlerts((existing) => existing.filter((alert) => alert.id !== deletedId))
        setNudges((existing) => existing.filter((nudge) => nudge.alertId !== deletedId))
        return
      }

      const incoming = mapAlertPayload(payload.new || payload)
      if (!incoming?.id) return

      setAlerts((existing) => mergeAlert(existing, incoming))

      if (preferencesRef.current?.planTier !== "free") {
        queueNudgeForAlert(incoming)
      }
    })

    subscriptionCleanupRef.current = unsubscribe

    return () => {
      stopPolling()
      if (subscriptionCleanupRef.current) {
        subscriptionCleanupRef.current()
        subscriptionCleanupRef.current = null
      }
    }
  }, [bootstrap, queueNudgeForAlert, startPolling, userId])

  useEffect(() => {
    preferencesRef.current = preferences
  }, [preferences])

  const savePreferences = useCallback(
    async (updates) => {
      if (!userId) return { data: null, error: new Error("Missing userId") }
      const nextPreferences = { ...preferencesRef.current, ...updates, userId }
      const { data, error } = await updateCashBurnPreferences(userId, nextPreferences)
      if (error) {
        console.error("Unable to update cash burn preferences", error)
        return { data: null, error }
      }
      const resolved = data || nextPreferences
      setPreferences(resolved)
      preferencesRef.current = resolved
      return { data: resolved, error: null }
    },
    [userId],
  )

  const dismissNudge = useCallback((nudgeId) => {
    setNudges((existing) => existing.filter((nudge) => nudge.id !== nudgeId))
  }, [])

  const acknowledgeAlert = useCallback(async (alertId) => {
    if (!alertId) return
    const timestamp = new Date().toISOString()
    await updateCashBurnAlert(alertId, { status: "acknowledged", lastTriggeredAt: timestamp })
    deliveredAlertIdsRef.current.delete(alertId)
    setAlerts((existing) =>
      existing.map((alert) => (alert.id === alertId ? { ...alert, status: "acknowledged", lastTriggeredAt: timestamp } : alert)),
    )
    setNudges((existing) => existing.filter((nudge) => nudge.alertId !== alertId))
  }, [])

  const scheduleAlert = useCallback(
    async ({ category, threshold, currentBurn, scheduledFor, message }) => {
      if (!userId) return { data: null, error: new Error("Missing userId") }
      const { data, error } = await createCashBurnAlert(userId, {
        category,
        threshold,
        currentBurn,
        scheduledFor,
        message,
        status: "pending",
      })
      if (!error && data) {
        setAlerts((existing) => mergeAlert(existing, data))
      }
      return { data, error }
    },
    [userId],
  )

  const paceLegend = useMemo(
    () => ({
      over: { label: "Over pace", tone: "danger" },
      "on-track": { label: "On track", tone: "success" },
      under: { label: "Under pace", tone: "muted" },
      neutral: { label: "Neutral", tone: "muted" },
    }),
    [],
  )

  return {
    loading,
    reports,
    alerts,
    nudges,
    preferences,
    isPaidPlan,
    paceLegend,
    refreshReports: loadReports,
    refreshAlerts: loadAlerts,
    savePreferences,
    dismissNudge,
    acknowledgeAlert,
    scheduleAlert,
  }
}

export default useCashBurnAnalytics
