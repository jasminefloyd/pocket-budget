import { createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables. Please check your .env file.")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: "pkce", // Add PKCE flow for better security and reliability
  },
})

// Hardcoded admin user for demo/testing
const DEMO_ADMIN = {
  email: "test@me.com",
  password: "pass123",
  user: {
    id: "demo-admin-user-id",
    email: "test@me.com",
    user_metadata: {
      full_name: "Demo Admin",
    },
    created_at: new Date().toISOString(),
  },
  profile: {
    id: "demo-admin-user-id",
    email: "test@me.com",
    full_name: "Demo Admin",
    created_at: new Date().toISOString(),
  },
}

// Auth helper functions
export const signUp = async (email, password) => {
  // Check if it's the demo admin trying to sign up
  if (email === DEMO_ADMIN.email && password === DEMO_ADMIN.password) {
    // For demo admin, just redirect to sign in
    return await signIn(email, password)
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  })
  return { data, error }
}

export const signIn = async (email, password) => {
  // Check if it's the demo admin
  if (email === DEMO_ADMIN.email && password === DEMO_ADMIN.password) {
    // Create a mock session for demo admin
    const mockSession = {
      user: DEMO_ADMIN.user,
      access_token: "demo-admin-token",
      refresh_token: "demo-admin-refresh",
      expires_in: 3600,
      token_type: "bearer",
    }

    // Store demo session in localStorage to persist across page reloads
    localStorage.setItem("demo-admin-session", JSON.stringify(mockSession))

    // Trigger auth state change manually
    window.dispatchEvent(
      new CustomEvent("demo-auth-change", {
        detail: { session: mockSession, event: "SIGNED_IN" },
      }),
    )

    return { data: { user: DEMO_ADMIN.user, session: mockSession }, error: null }
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  return { data, error }
}

export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
    },
  })
  return { data, error }
}

export const signOut = async () => {
  // Clear demo session if it exists
  localStorage.removeItem("demo-admin-session")

  // Trigger auth state change for demo user
  window.dispatchEvent(
    new CustomEvent("demo-auth-change", {
      detail: { session: null, event: "SIGNED_OUT" },
    }),
  )

  const { error } = await supabase.auth.signOut()
  return { error }
}

export const getCurrentUser = async () => {
  try {
    // Check for demo admin session first
    const demoSession = localStorage.getItem("demo-admin-session")
    if (demoSession) {
      const session = JSON.parse(demoSession)
      return { user: session.user, error: null }
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    return { user, error }
  } catch (error) {
    console.error("Error getting current user:", error)
    return { user: null, error }
  }
}

// Database helper functions with demo admin support
export const createUserProfile = async (userId, email, fullName) => {
  // For demo admin, return mock profile
  if (userId === DEMO_ADMIN.user.id) {
    return { data: [DEMO_ADMIN.profile], error: null }
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .insert([
      {
        id: userId,
        email,
        full_name: fullName,
        created_at: new Date().toISOString(),
      },
    ])
    .select()
  return { data, error }
}

export const getUserProfile = async (userId) => {
  // For demo admin, return mock profile
  if (userId === DEMO_ADMIN.user.id) {
    return { data: DEMO_ADMIN.profile, error: null }
  }

  const { data, error } = await supabase.from("user_profiles").select("*").eq("id", userId).single()
  return { data, error }
}

// Demo data storage (in-memory for demo admin)
let demoBudgets = []
let demoCategories = {
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
}

export const DEFAULT_CASH_BURN_PREFERENCES = {
  planTier: "free",
  weeklyReportDay: "Monday",
  weeklyReportTime: "09:00",
  quietHours: { start: "21:00", end: "07:00" },
  alertThreshold: 0.15,
  realtimeEnabled: true,
  pollIntervalMinutes: 15,
  showSponsoredSlot: true,
}

let demoCashBurnPreferences = {}
let demoCashBurnReports = []
let demoCashBurnAlerts = []

const DEMO_ALERT_EVENT = "demo-cash-burn-alert"

const emitDemoAlertEvent = (payload) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DEMO_ALERT_EVENT, { detail: payload }))
  }
}

const dayNameToIndex = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const normalizeQuietHours = (quietHours) => {
  if (!quietHours) {
    return { ...DEFAULT_CASH_BURN_PREFERENCES.quietHours }
  }

  return {
    start: quietHours.start || DEFAULT_CASH_BURN_PREFERENCES.quietHours.start,
    end: quietHours.end || DEFAULT_CASH_BURN_PREFERENCES.quietHours.end,
  }
}

const toCamelPreferences = (row) => {
  if (!row) return null
  return {
    planTier: row.plan_tier || DEFAULT_CASH_BURN_PREFERENCES.planTier,
    weeklyReportDay: row.weekly_report_day || DEFAULT_CASH_BURN_PREFERENCES.weeklyReportDay,
    weeklyReportTime: row.weekly_report_time || DEFAULT_CASH_BURN_PREFERENCES.weeklyReportTime,
    quietHours: normalizeQuietHours(row.quiet_hours),
    alertThreshold:
      typeof row.alert_threshold === "number"
        ? row.alert_threshold
        : DEFAULT_CASH_BURN_PREFERENCES.alertThreshold,
    realtimeEnabled:
      typeof row.realtime_enabled === "boolean"
        ? row.realtime_enabled
        : DEFAULT_CASH_BURN_PREFERENCES.realtimeEnabled,
    pollIntervalMinutes:
      typeof row.poll_interval_minutes === "number"
        ? row.poll_interval_minutes
        : DEFAULT_CASH_BURN_PREFERENCES.pollIntervalMinutes,
    showSponsoredSlot:
      typeof row.show_sponsored_slot === "boolean"
        ? row.show_sponsored_slot
        : DEFAULT_CASH_BURN_PREFERENCES.showSponsoredSlot,
  }
}

const toSnakePreferences = (userId, preferences) => ({
  user_id: userId,
  plan_tier: preferences.planTier,
  weekly_report_day: preferences.weeklyReportDay,
  weekly_report_time: preferences.weeklyReportTime,
  quiet_hours: preferences.quietHours,
  alert_threshold: preferences.alertThreshold,
  realtime_enabled: preferences.realtimeEnabled,
  poll_interval_minutes: preferences.pollIntervalMinutes,
  show_sponsored_slot: preferences.showSponsoredSlot,
  updated_at: new Date().toISOString(),
})

const ensureDemoCashBurnPreferences = (userId) => {
  if (!demoCashBurnPreferences[userId]) {
    demoCashBurnPreferences[userId] = { ...DEFAULT_CASH_BURN_PREFERENCES }
  }
  return demoCashBurnPreferences[userId]
}

const calculateWeekRange = (date = new Date(), weekStartsOn = 1) => {
  const current = new Date(date)
  current.setHours(0, 0, 0, 0)
  const day = current.getDay()
  const normalizedWeekStart = Number.isInteger(weekStartsOn) ? weekStartsOn : 1
  const diff = (day < normalizedWeekStart ? 7 : 0) + day - normalizedWeekStart
  const weekStart = new Date(current)
  weekStart.setDate(current.getDate() - diff)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)
  return { weekStart, weekEnd }
}

const startOfPreviousWeek = (weekStart) => {
  const previous = new Date(weekStart)
  previous.setDate(previous.getDate() - 7)
  previous.setHours(0, 0, 0, 0)
  return previous
}

const endOfWeek = (weekStart) => {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

const toISODate = (date) => {
  const clone = new Date(date)
  clone.setHours(0, 0, 0, 0)
  return clone.toISOString()
}

const safeNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const parseTransactionDate = (value) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed
}

const getWeeklyTransactions = (budgets, start, end) => {
  const transactions = []
  budgets.forEach((budget) => {
    ;(budget.transactions || []).forEach((transaction) => {
      if (transaction.type !== "expense") return
      const transactionDate = parseTransactionDate(transaction.date)
      if (!transactionDate) return
      if (transactionDate >= start && transactionDate <= end) {
        transactions.push({
          ...transaction,
          amount: Math.abs(safeNumber(transaction.amount)),
          date: new Date(transactionDate),
        })
      }
    })
  })
  return transactions
}

const buildDailyBurnSeries = (transactions, weekStart) => {
  const series = new Array(7).fill(0)
  transactions.forEach((transaction) => {
    const dayIndex = Math.min(
      6,
      Math.max(0, Math.floor((transaction.date - weekStart) / (1000 * 60 * 60 * 24))),
    )
    series[dayIndex] += transaction.amount
  })
  return series
}

const buildCategorySummaries = (
  currentTransactions,
  previousTransactions,
  totalBurn,
  quietHours,
  alertThreshold,
  weekStart,
) => {
  const map = new Map()
  const previousMap = new Map()

  previousTransactions.forEach((transaction) => {
    const key = (transaction.category || "Uncategorized").toLowerCase()
    const previous = previousMap.get(key) || { amount: 0 }
    previous.amount += transaction.amount
    previousMap.set(key, previous)
  })

  currentTransactions.forEach((transaction) => {
    const key = (transaction.category || "Uncategorized").toLowerCase()
    const entry =
      map.get(key) || {
        name: transaction.category || "Uncategorized",
        amount: 0,
        transactions: 0,
        dailySeries: new Array(7).fill(0),
        previousAmount: previousMap.get(key)?.amount || 0,
      }

    entry.amount += transaction.amount
    entry.transactions += 1
    const dayIndex = Math.min(
      6,
      Math.max(0, Math.floor((transaction.date - weekStart) / (1000 * 60 * 60 * 24))),
    )
    entry.dailySeries[dayIndex] += transaction.amount
    map.set(key, entry)
  })

  const categories = Array.from(map.values()).map((entry) => {
    const share = totalBurn > 0 ? entry.amount / totalBurn : 0
    const trend = entry.previousAmount > 0 ? (entry.amount - entry.previousAmount) / entry.previousAmount : null
    const isLeak = share >= 0.2 || (trend !== null && trend > alertThreshold)
    return {
      name: entry.name,
      amount: Number(entry.amount.toFixed(2)),
      share: Number(share.toFixed(3)),
      previousAmount: Number(entry.previousAmount.toFixed(2)),
      trend: trend !== null ? Number(trend.toFixed(3)) : null,
      isLeak,
      sparkline: entry.dailySeries,
      transactions: entry.transactions,
      quietHoursRespected: Boolean(quietHours),
    }
  })

  return categories.sort((a, b) => b.amount - a.amount)
}

const sumBudgetedAmounts = (budgets) => {
  let total = 0
  budgets.forEach((budget) => {
    ;(budget.categoryBudgets || []).forEach((category) => {
      total += safeNumber(category.budgetedAmount || category.budgeted_amount)
    })
  })
  return total
}

const toReportRecord = (uiReport) => ({
  week_start: uiReport.weekRange.start,
  week_end: uiReport.weekRange.end,
  total_burn: uiReport.totalBurn,
  average_daily_burn: uiReport.averageDailyBurn,
  expected_daily_burn: uiReport.expectedDailyBurn,
  pace_status: uiReport.pace.status,
  pace_ratio: uiReport.pace.ratio,
  categories: uiReport.categories,
  daily_burn: uiReport.dailyBurn,
  leak_categories: uiReport.leakCategories,
  threshold_breached: uiReport.thresholdBreached,
  created_at: new Date().toISOString(),
})

const normalizeReportRecord = (record) => {
  if (!record) return null
  return {
    id: record.id,
    weekRange: {
      start: record.week_start,
      end: record.week_end,
    },
    totalBurn: safeNumber(record.total_burn),
    averageDailyBurn: safeNumber(record.average_daily_burn),
    expectedDailyBurn: safeNumber(record.expected_daily_burn),
    pace: {
      status: record.pace_status,
      ratio: safeNumber(record.pace_ratio),
    },
    categories: Array.isArray(record.categories) ? record.categories : [],
    dailyBurn: Array.isArray(record.daily_burn) ? record.daily_burn : [],
    leakCategories: Array.isArray(record.leak_categories) ? record.leak_categories : [],
    thresholdBreached: Boolean(record.threshold_breached),
    createdAt: record.created_at,
  }
}

export const calculateWeeklyCashBurn = (budgets = [], preferences = DEFAULT_CASH_BURN_PREFERENCES) => {
  const mergedPreferences = {
    ...DEFAULT_CASH_BURN_PREFERENCES,
    ...preferences,
    quietHours: normalizeQuietHours(preferences?.quietHours),
  }

  const weekStartsOn =
    dayNameToIndex[String(mergedPreferences.weeklyReportDay || "Monday").toLowerCase()] ?? 1
  const { weekStart, weekEnd } = calculateWeekRange(new Date(), weekStartsOn)
  const previousWeekStart = startOfPreviousWeek(weekStart)
  const previousWeekEnd = endOfWeek(previousWeekStart)

  const currentTransactions = getWeeklyTransactions(budgets, weekStart, weekEnd)
  const previousTransactions = getWeeklyTransactions(budgets, previousWeekStart, previousWeekEnd)

  const totalBurn = currentTransactions.reduce((sum, transaction) => sum + transaction.amount, 0)
  const dailyBurn = buildDailyBurnSeries(currentTransactions, weekStart)
  const categories = buildCategorySummaries(
    currentTransactions,
    previousTransactions,
    totalBurn,
    mergedPreferences.quietHours,
    mergedPreferences.alertThreshold,
    weekStart,
  )

  const leakCategories = categories.filter((category) => category.isLeak).slice(0, 3)

  const totalBudgeted = sumBudgetedAmounts(budgets)
  const now = new Date()
  const daysElapsed = Math.min(7, Math.max(1, Math.floor((now - weekStart) / (1000 * 60 * 60 * 24)) + 1))
  const expectedDailyBurn = totalBudgeted > 0 ? totalBudgeted / 7 : 0
  const expectedToDate = expectedDailyBurn * daysElapsed
  const paceRatio = expectedToDate > 0 ? totalBurn / expectedToDate : 1
  let paceStatus = "on_track"
  if (paceRatio > 1 + mergedPreferences.alertThreshold) {
    paceStatus = "overpace"
  } else if (paceRatio < 1 - mergedPreferences.alertThreshold) {
    paceStatus = "underpace"
  }

  const paceMessageLookup = {
    overpace: "Spending is running hotter than planned.",
    on_track: "You're right on track this week.",
    underpace: "You're pacing under budget—nice work!",
  }

  const uiReport = {
    weekRange: {
      start: toISODate(weekStart),
      end: toISODate(weekEnd),
    },
    totalBurn: Number(totalBurn.toFixed(2)),
    averageDailyBurn: Number((totalBurn / 7).toFixed(2)),
    expectedDailyBurn: Number(expectedDailyBurn.toFixed(2)),
    pace: {
      status: paceStatus,
      ratio: Number(paceRatio.toFixed(3)),
      message: paceMessageLookup[paceStatus],
      daysElapsed,
    },
    categories: categories.slice(0, 6),
    leakCategories,
    dailyBurn,
    thresholdBreached: paceStatus === "overpace",
    alertThreshold: mergedPreferences.alertThreshold,
  }

  const storageRecord = toReportRecord(uiReport)

  return { ui: uiReport, record: storageRecord }
}

export const getCashBurnPreferences = async (userId) => {
  if (userId === DEMO_ADMIN.user.id) {
    const data = ensureDemoCashBurnPreferences(userId)
    return { data, error: null }
  }

  const { data, error } = await supabase
    .from("cash_burn_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (error && error.code !== "PGRST116") {
    return { data: null, error }
  }

  const preferences = toCamelPreferences(data) || { ...DEFAULT_CASH_BURN_PREFERENCES }
  return { data: preferences, error: null }
}

export const upsertCashBurnPreferences = async (userId, preferences) => {
  const mergedPreferences = {
    ...DEFAULT_CASH_BURN_PREFERENCES,
    ...preferences,
    quietHours: normalizeQuietHours(preferences?.quietHours),
  }

  if (userId === DEMO_ADMIN.user.id) {
    demoCashBurnPreferences[userId] = mergedPreferences
    return { data: mergedPreferences, error: null }
  }

  const payload = toSnakePreferences(userId, mergedPreferences)
  const { data, error } = await supabase
    .from("cash_burn_preferences")
    .upsert([payload], { onConflict: "user_id" })
    .select()
    .single()

  if (error) {
    return { data: null, error }
  }

  return { data: toCamelPreferences(data), error: null }
}

export const getCashBurnReports = async (userId, { limit = 8 } = {}) => {
  if (userId === DEMO_ADMIN.user.id) {
    const sorted = [...demoCashBurnReports].sort((a, b) => (a.week_start < b.week_start ? 1 : -1))
    return { data: sorted.slice(0, limit).map(normalizeReportRecord), error: null }
  }

  const { data, error } = await supabase
    .from("cash_burn_reports")
    .select("*")
    .eq("user_id", userId)
    .order("week_start", { ascending: false })
    .limit(limit)

  if (error) {
    return { data: null, error }
  }

  return { data: data.map(normalizeReportRecord), error: null }
}

export const upsertCashBurnReport = async (userId, reportRecord) => {
  if (!reportRecord) {
    return { data: null, error: { message: "Missing report payload" } }
  }

  if (userId === DEMO_ADMIN.user.id) {
    const index = demoCashBurnReports.findIndex((report) => report.week_start === reportRecord.week_start)
    const normalizedRecord = {
      ...reportRecord,
      id: reportRecord.id || `demo-report-${Date.now()}`,
      user_id: userId,
    }
    if (index >= 0) {
      demoCashBurnReports[index] = { ...demoCashBurnReports[index], ...normalizedRecord }
    } else {
      demoCashBurnReports.push(normalizedRecord)
    }
    return { data: normalizeReportRecord(normalizedRecord), error: null }
  }

  const payload = { ...reportRecord, user_id: userId }
  const { data, error } = await supabase
    .from("cash_burn_reports")
    .upsert([payload], { onConflict: "user_id,week_start" })
    .select()
    .single()

  if (error) {
    return { data: null, error }
  }

  return { data: normalizeReportRecord(data), error: null }
}

export const getCashBurnAlerts = async (userId, { limit = 20 } = {}) => {
  if (userId === DEMO_ADMIN.user.id) {
    const sorted = [...demoCashBurnAlerts].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return { data: sorted.slice(0, limit), error: null }
  }

  const { data, error } = await supabase
    .from("cash_burn_alerts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  return { data, error }
}

export const logCashBurnAlert = async (userId, alertPayload) => {
  const payload = {
    id: alertPayload.id || `alert-${Date.now()}`,
    user_id: userId,
    message: alertPayload.message,
    severity: alertPayload.severity || "info",
    category: alertPayload.category || null,
    pace_ratio: alertPayload.paceRatio || null,
    quiet_hours_respected: alertPayload.quietHoursRespected ?? true,
    delivery: alertPayload.delivery || "realtime",
    created_at: alertPayload.createdAt || new Date().toISOString(),
    week_start: alertPayload.weekStart || null,
    week_end: alertPayload.weekEnd || null,
  }

  if (userId === DEMO_ADMIN.user.id) {
    demoCashBurnAlerts.unshift(payload)
    emitDemoAlertEvent(payload)
    return { data: payload, error: null }
  }

  const { data, error } = await supabase.from("cash_burn_alerts").insert([payload]).select().single()

  if (!error) {
    emitDemoAlertEvent(data)
  }

  return { data, error }
}

export const subscribeToCashBurnAlerts = (userId, callback) => {
  if (!userId || typeof callback !== "function") {
    return { unsubscribe: () => {} }
  }

  if (userId === DEMO_ADMIN.user.id) {
    const handler = (event) => {
      if (event.detail?.user_id === userId) {
        callback(event.detail)
      }
    }
    if (typeof window !== "undefined") {
      window.addEventListener(DEMO_ALERT_EVENT, handler)
    }
    return {
      unsubscribe: () => {
        if (typeof window !== "undefined") {
          window.removeEventListener(DEMO_ALERT_EVENT, handler)
        }
      },
    }
  }

  const channel = supabase
    .channel(`cash-burn-alerts-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "cash_burn_alerts",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload?.new) {
          callback(payload.new)
        }
      },
    )
    .subscribe()

  return {
    unsubscribe: () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    },
  }
}

export const getBudgets = async (userId) => {
  // For demo admin, return in-memory data
  if (userId === DEMO_ADMIN.user.id) {
    return { data: demoBudgets, error: null }
  }

  const { data, error } = await supabase
    .from("budgets")
    .select(`
      *,
      transactions (*)
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
  return { data, error }
}

export const createBudget = async (userId, budgetData) => {
  // For demo admin, store in memory
  if (userId === DEMO_ADMIN.user.id) {
    const newBudget = {
      id: `demo-budget-${Date.now()}`,
      user_id: userId,
      name: budgetData.name,
      category_budgets: budgetData.categoryBudgets || [],
      created_at: new Date().toISOString(),
      transactions: [],
    }
    demoBudgets.unshift(newBudget)
    return { data: [newBudget], error: null }
  }

  const { data, error } = await supabase
    .from("budgets")
    .insert([
      {
        user_id: userId,
        name: budgetData.name,
        category_budgets: budgetData.categoryBudgets || [],
        created_at: new Date().toISOString(),
      },
    ])
    .select()
  return { data, error }
}

export const updateBudget = async (budgetId, budgetData) => {
  // For demo admin, update in memory
  if (budgetId.startsWith("demo-budget-")) {
    const budgetIndex = demoBudgets.findIndex((b) => b.id === budgetId)
    if (budgetIndex !== -1) {
      demoBudgets[budgetIndex] = {
        ...demoBudgets[budgetIndex],
        name: budgetData.name,
        category_budgets: budgetData.categoryBudgets || [],
      }
      return { data: [demoBudgets[budgetIndex]], error: null }
    }
    return { data: null, error: { message: "Budget not found" } }
  }

  const { data, error } = await supabase
    .from("budgets")
    .update({
      name: budgetData.name,
      category_budgets: budgetData.categoryBudgets || [],
    })
    .eq("id", budgetId)
    .select()
  return { data, error }
}

export const deleteBudget = async (budgetId) => {
  // For demo admin, remove from memory
  if (budgetId.startsWith("demo-budget-")) {
    demoBudgets = demoBudgets.filter((b) => b.id !== budgetId)
    return { error: null }
  }

  const { error } = await supabase.from("budgets").delete().eq("id", budgetId)
  return { error }
}

export const createTransaction = async (budgetId, transactionData) => {
  // For demo admin, store in memory
  if (budgetId.startsWith("demo-budget-")) {
    const budgetIndex = demoBudgets.findIndex((b) => b.id === budgetId)
    if (budgetIndex !== -1) {
      const newTransaction = {
        id: `demo-tx-${Date.now()}`,
        budget_id: budgetId,
        name: transactionData.name,
        amount: transactionData.amount,
        budgeted_amount: transactionData.budgetedAmount,
        category: transactionData.category,
        type: transactionData.type,
        date: transactionData.date,
        receipt_url: transactionData.receipt,
        created_at: new Date().toISOString(),
      }

      if (!demoBudgets[budgetIndex].transactions) {
        demoBudgets[budgetIndex].transactions = []
      }
      demoBudgets[budgetIndex].transactions.push(newTransaction)

      return { data: [newTransaction], error: null }
    }
    return { data: null, error: { message: "Budget not found" } }
  }

  const { data, error } = await supabase
    .from("transactions")
    .insert([
      {
        budget_id: budgetId,
        name: transactionData.name,
        amount: transactionData.amount,
        budgeted_amount: transactionData.budgetedAmount,
        category: transactionData.category,
        type: transactionData.type,
        date: transactionData.date,
        receipt_url: transactionData.receipt,
        created_at: new Date().toISOString(),
      },
    ])
    .select()
  return { data, error }
}

export const updateTransaction = async (transactionId, transactionData) => {
  // For demo admin, update in memory
  if (transactionId.startsWith("demo-tx-")) {
    for (const budget of demoBudgets) {
      if (budget.transactions) {
        const txIndex = budget.transactions.findIndex((tx) => tx.id === transactionId)
        if (txIndex !== -1) {
          budget.transactions[txIndex] = {
            ...budget.transactions[txIndex],
            name: transactionData.name,
            amount: transactionData.amount,
            budgeted_amount: transactionData.budgetedAmount,
            category: transactionData.category,
            type: transactionData.type,
            date: transactionData.date,
            receipt_url: transactionData.receipt,
          }
          return { data: [budget.transactions[txIndex]], error: null }
        }
      }
    }
    return { data: null, error: { message: "Transaction not found" } }
  }

  const { data, error } = await supabase
    .from("transactions")
    .update({
      name: transactionData.name,
      amount: transactionData.amount,
      budgeted_amount: transactionData.budgetedAmount,
      category: transactionData.category,
      type: transactionData.type,
      date: transactionData.date,
      receipt_url: transactionData.receipt,
    })
    .eq("id", transactionId)
    .select()
  return { data, error }
}

export const deleteTransaction = async (transactionId) => {
  // For demo admin, remove from memory
  if (transactionId.startsWith("demo-tx-")) {
    for (const budget of demoBudgets) {
      if (budget.transactions) {
        budget.transactions = budget.transactions.filter((tx) => tx.id !== transactionId)
      }
    }
    return { error: null }
  }

  const { error } = await supabase.from("transactions").delete().eq("id", transactionId)
  return { error }
}

export const getUserCategories = async (userId) => {
  // For demo admin, return in-memory categories
  if (userId === DEMO_ADMIN.user.id) {
    return { data: { categories: demoCategories }, error: null }
  }

  const { data, error } = await supabase.from("user_categories").select("*").eq("user_id", userId).single()
  return { data, error }
}

export const updateUserCategories = async (userId, categories) => {
  // For demo admin, update in memory
  if (userId === DEMO_ADMIN.user.id) {
    demoCategories = categories
    return { data: [{ categories: demoCategories }], error: null }
  }

  const { data, error } = await supabase
    .from("user_categories")
    .upsert([
      {
        user_id: userId,
        categories: categories,
      },
    ])
    .select()
  return { data, error }
}
