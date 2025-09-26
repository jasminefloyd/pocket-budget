"use client"

import { useState, useEffect, useRef } from "react"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import {
  getBudgets,
  getUserCategories,
  updateUserCategories,
  DEFAULT_CASH_BURN_PREFERENCES,
  calculateWeeklyCashBurn,
  getCashBurnPreferences,
  upsertCashBurnPreferences,
  getCashBurnReports,
  upsertCashBurnReport,
  getCashBurnAlerts,
  logCashBurnAlert,
  subscribeToCashBurnAlerts,
} from "./lib/supabase"
import BudgetsScreen from "./screens/BudgetsScreen"
import BudgetDetailsScreen from "./screens/BudgetDetailsScreen"
import CategoriesScreen from "./screens/CategoriesScreen"
import AIInsightsScreen from "./screens/AIInsightsScreen"
import LoginScreen from "./screens/LoginScreen"
import LoadingScreen from "./components/LoadingScreen"
import Header from "./components/Header"
import InstallPrompt from "./components/InstallPrompt"

const parseTimeToMinutes = (value) => {
  if (!value || typeof value !== "string") return null
  const [hours, minutes] = value.split(":").map((part) => Number.parseInt(part, 10))
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

const isWithinQuietHours = (date, quietHours) => {
  if (!quietHours) return false
  const startMinutes = parseTimeToMinutes(quietHours.start)
  const endMinutes = parseTimeToMinutes(quietHours.end)
  if (startMinutes === null || endMinutes === null) return false

  const minutes = date.getHours() * 60 + date.getMinutes()

  if (startMinutes === endMinutes) {
    return false
  }

  if (startMinutes < endMinutes) {
    return minutes >= startMinutes && minutes < endMinutes
  }

  return minutes >= startMinutes || minutes < endMinutes
}

const deriveAlertKey = (alert) => {
  if (!alert) return ""
  const weekStart = alert.week_start || alert.weekStart || ""
  const category = alert.category || "general"
  const ratio = Number.isFinite(alert.pace_ratio)
    ? Number(alert.pace_ratio).toFixed(3)
    : Number.isFinite(alert.paceRatio)
    ? Number(alert.paceRatio).toFixed(3)
    : "1.000"
  return `${weekStart}:${category}:${ratio}`
}

function AppContent() {
  const { user, loading: authLoading, initializing } = useAuth()
  const [budgets, setBudgets] = useState([])
  const [categories, setCategories] = useState({
    income: [
      { name: "Salary", icon: "💼" },
      { name: "Freelance", icon: "💻" },
      { name: "Investment", icon: "📈" },
      { name: "Business", icon: "🏢" },
      { name: "Gift", icon: "🎁" },
    ],
    expense: [
      { name: "Groceries", icon: "🛒" },
      { name: "Rent", icon: "🏠" },
      { name: "Transportation", icon: "🚗" },
      { name: "Entertainment", icon: "🎮" },
      { name: "Bills", icon: "🧾" },
      { name: "Shopping", icon: "🛍️" },
    ],
  })
  const [selectedBudget, setSelectedBudget] = useState(null)
  const [viewMode, setViewMode] = useState("budgets")
  const [isLoading, setIsLoading] = useState(false)
  const [cashBurnPreferences, setCashBurnPreferences] = useState(DEFAULT_CASH_BURN_PREFERENCES)
  const [cashBurnReport, setCashBurnReport] = useState(null)
  const [cashBurnHistory, setCashBurnHistory] = useState([])
  const [cashBurnAlerts, setCashBurnAlerts] = useState([])
  const [activeNudges, setActiveNudges] = useState([])
  const lastReportSignatureRef = useRef(null)
  const deliveredAlertKeysRef = useRef(new Set())

  // Load user data when authenticated
  useEffect(() => {
    if (user && !authLoading && !initializing) {
      loadUserData()
    }
  }, [user, authLoading, initializing])

  const loadUserData = async () => {
    try {
      setIsLoading(true)
      const [budgetsResult, categoriesResult, preferencesResult, reportsResult, alertsResult] = await Promise.all([
        getBudgets(user.id),
        getUserCategories(user.id),
        getCashBurnPreferences(user.id),
        getCashBurnReports(user.id),
        getCashBurnAlerts(user.id, { limit: 20 }),
      ])

      if (budgetsResult.error) {
        console.error("Error loading budgets:", budgetsResult.error)
      }

      const transformedBudgets =
        budgetsResult.data?.map((budget) => ({
          id: budget.id,
          name: budget.name,
          createdAt: new Date(budget.created_at).toLocaleDateString(),
          categoryBudgets: budget.category_budgets || [],
          transactions:
            budget.transactions?.map((tx) => ({
              id: tx.id,
              name: tx.name,
              amount: tx.amount,
              budgetedAmount: tx.budgeted_amount,
              category: tx.category,
              type: tx.type,
              date: tx.date,
              receipt: tx.receipt_url,
            })) || [],
        })) || []

      setBudgets(transformedBudgets)

      if (categoriesResult.error && categoriesResult.error.code !== "PGRST116") {
        console.error("Error loading categories:", categoriesResult.error)
      } else if (categoriesResult.data?.categories) {
        setCategories(categoriesResult.data.categories)
      }

      if (!preferencesResult.error && preferencesResult.data) {
        setCashBurnPreferences(preferencesResult.data)
      }

      if (!reportsResult.error && reportsResult.data) {
        setCashBurnHistory(reportsResult.data)
      }

      if (!alertsResult.error && alertsResult.data) {
        setCashBurnAlerts(alertsResult.data)
        alertsResult.data.forEach((alert) => {
          deliveredAlertKeysRef.current.add(deriveAlertKey(alert))
        })
        const realtimeAlerts = alertsResult.data.filter((alert) => alert.delivery === "realtime")
        setActiveNudges(realtimeAlerts.slice(0, 5))
      }
    } catch (error) {
      console.error("Error loading user data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCategoriesUpdate = async (newCategories) => {
    setCategories(newCategories)
    if (user) {
      try {
        await updateUserCategories(user.id, newCategories)
      } catch (error) {
        console.error("Error updating categories:", error)
      }
    }
  }

  const handleCashBurnPreferencesSave = async (updatedPreferences) => {
    if (!user) return

    const nextPreferences = {
      ...cashBurnPreferences,
      ...updatedPreferences,
    }

    const { data, error } = await upsertCashBurnPreferences(user.id, nextPreferences)
    if (error) {
      console.error("Error updating cash burn preferences:", error)
      throw error
    }
    setCashBurnPreferences(data || nextPreferences)
  }

  const handleDismissNudge = (nudgeId) => {
    setActiveNudges((prev) => prev.filter((nudge) => nudge.id !== nudgeId))
  }

  // Keep recent alert keys in sync with the active reporting week to avoid duplicate nudges
  useEffect(() => {
    const weekStart = cashBurnReport?.weekRange?.start
    if (!weekStart) return
    const filtered = Array.from(deliveredAlertKeysRef.current).filter((key) => key.startsWith(`${weekStart}:`))
    deliveredAlertKeysRef.current = new Set(filtered)
  }, [cashBurnReport?.weekRange?.start])

  // Generate weekly cash burn report and persist it
  useEffect(() => {
    if (!user) return

    const { ui, record } = calculateWeeklyCashBurn(budgets, cashBurnPreferences)
    setCashBurnReport(ui)

    if (!ui) return

    const signature = `${ui.weekRange.start}|${ui.totalBurn}|${ui.pace.ratio}|${ui.categories
      .map((category) => `${category.name}:${category.amount}`)
      .join(";")}`

    if (signature === lastReportSignatureRef.current) {
      return
    }

    lastReportSignatureRef.current = signature

    const persistReport = async () => {
      try {
        const { data, error } = await upsertCashBurnReport(user.id, record)
        if (error) {
          console.error("Error saving cash burn report:", error)
          return
        }
        if (data) {
          setCashBurnHistory((prev) => {
            const filtered = prev.filter((item) => item.weekRange.start !== data.weekRange.start)
            const updated = [data, ...filtered]
            return updated.sort((a, b) => (a.weekRange.start < b.weekRange.start ? 1 : -1))
          })
        }
      } catch (error) {
        console.error("Failed to persist cash burn report:", error)
      }
    }

    persistReport()
  }, [user, budgets, cashBurnPreferences])

  // Subscribe to new alerts via Supabase realtime or demo events
  useEffect(() => {
    if (!user) return

    const subscription = subscribeToCashBurnAlerts(user.id, (alert) => {
      setCashBurnAlerts((prev) => {
        if (prev.some((existing) => existing.id === alert.id)) {
          return prev
        }
        return [alert, ...prev]
      })

      deliveredAlertKeysRef.current.add(deriveAlertKey(alert))

      if (alert.delivery === "realtime") {
        setActiveNudges((prev) => {
          if (prev.some((existing) => existing.id === alert.id)) {
            return prev
          }
          return [alert, ...prev].slice(0, 5)
        })
      }
    })

    return () => subscription?.unsubscribe?.()
  }, [user])

  // Paid plan polling for real-time nudges that respect quiet hours and thresholds
  useEffect(() => {
    if (!user) return
    if (cashBurnPreferences.planTier !== "paid" || !cashBurnPreferences.realtimeEnabled) {
      return
    }

    const intervalMs = Math.max(1, Number(cashBurnPreferences.pollIntervalMinutes) || 15) * 60 * 1000

    let cancelled = false

    const evaluateCashBurn = async (delivery = "realtime") => {
      if (cancelled) return

      const { ui } = calculateWeeklyCashBurn(budgets, cashBurnPreferences)
      if (!ui?.thresholdBreached || !ui.leakCategories?.length) {
        return
      }

      if (isWithinQuietHours(new Date(), cashBurnPreferences.quietHours)) {
        return
      }

      const primaryLeak = ui.leakCategories[0]
      const key = deriveAlertKey({
        week_start: ui.weekRange.start,
        category: primaryLeak?.name,
        pace_ratio: ui.pace.ratio,
      })

      if (deliveredAlertKeysRef.current.has(key)) {
        return
      }

      deliveredAlertKeysRef.current.add(key)

      const overpacePercent = Math.max(0, Math.round((ui.pace.ratio - 1) * 100))
      const baseAlert = {
        id: `nudge-${Date.now()}`,
        message: `Spending pace is ${overpacePercent}% above plan. ${
          primaryLeak ? `${primaryLeak.name} is leading the leak.` : ""
        }`.trim(),
        severity: overpacePercent > 30 ? "critical" : overpacePercent > 15 ? "warning" : "info",
        category: primaryLeak?.name || null,
        paceRatio: ui.pace.ratio,
        quietHoursRespected: true,
        delivery,
        createdAt: new Date().toISOString(),
        weekStart: ui.weekRange.start,
        weekEnd: ui.weekRange.end,
      }

      try {
        const { data, error } = await logCashBurnAlert(user.id, baseAlert)
        if (error) {
          console.error("Failed to record cash burn alert:", error)
          return
        }

        const persisted = data || baseAlert
        setCashBurnAlerts((prev) => {
          const filtered = prev.filter((alert) => alert.id !== persisted.id)
          return [persisted, ...filtered]
        })
        setActiveNudges((prev) => {
          const filtered = prev.filter((alert) => alert.id !== persisted.id)
          return [persisted, ...filtered].slice(0, 5)
        })
      } catch (error) {
        console.error("Error logging cash burn alert:", error)
      }
    }

    evaluateCashBurn("realtime")
    const interval = setInterval(() => evaluateCashBurn("poll"), intervalMs)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [user, budgets, cashBurnPreferences])

  // Show loading screen only during initial auth check (with timeout protection)
  if (initializing) {
    return <LoadingScreen message="Initializing" />
  }

  // Show login screen if not authenticated
  if (!user && !authLoading) {
    return (
      <>
        <LoginScreen />
        <InstallPrompt />
      </>
    )
  }

  // Show loading screen while loading user data (only after auth is confirmed)
  if (user && isLoading) {
    return <LoadingScreen message="Loading your data" />
  }

  // If we have a user but still loading auth, show a brief loading state
  if (authLoading && user) {
    return <LoadingScreen message="Setting up your account" />
  }

  return (
    <div className="container">
      <Header title="Pocket Budget" showLogout={viewMode === "budgets"} />
      <InstallPrompt />

      {viewMode === "budgets" && (
        <BudgetsScreen
          budgets={budgets}
          setSelectedBudget={setSelectedBudget}
          setViewMode={setViewMode}
          setBudgets={setBudgets}
          userId={user.id}
          cashBurnReport={cashBurnReport}
          cashBurnHistory={cashBurnHistory}
          cashBurnPreferences={cashBurnPreferences}
          onSaveCashBurnPreferences={handleCashBurnPreferencesSave}
          activeNudges={activeNudges}
          onDismissNudge={handleDismissNudge}
        />
      )}
      {viewMode === "details" && selectedBudget && (
        <BudgetDetailsScreen
          budget={selectedBudget}
          categories={categories}
          setViewMode={setViewMode}
          setBudgets={setBudgets}
          budgets={budgets}
          setSelectedBudget={setSelectedBudget}
          userId={user.id}
        />
      )}
      {viewMode === "categories" && (
        <CategoriesScreen
          categories={categories}
          setCategories={handleCategoriesUpdate}
          budgets={budgets}
          setViewMode={setViewMode}
        />
      )}
      {viewMode === "ai" && selectedBudget && <AIInsightsScreen budget={selectedBudget} setViewMode={setViewMode} />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
