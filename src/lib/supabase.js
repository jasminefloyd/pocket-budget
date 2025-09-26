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

// Cash burn analytics demo storage
let demoCashBurnReports = []
let demoCashBurnAlerts = []
let demoCashBurnPreferences = null
const demoCashBurnAlertSubscribers = new Set()

const seedDemoCashBurnReports = () => {
  if (demoCashBurnReports.length > 0) return

  const now = new Date()
  const startOfWeek = (weeksAgo = 0) => {
    const date = new Date(now)
    const day = date.getUTCDay()
    const diff = (day === 0 ? -6 : 1) - day - weeksAgo * 7
    date.setUTCDate(date.getUTCDate() + diff)
    date.setUTCHours(0, 0, 0, 0)
    return date
  }

  const makeReport = (weeksAgo, overrides = {}) => {
    const start = startOfWeek(weeksAgo)
    const end = new Date(start)
    end.setUTCDate(start.getUTCDate() + 6)

    return {
      id: `demo-report-${weeksAgo}`,
      user_id: DEMO_ADMIN.user.id,
      week_start: start.toISOString(),
      week_end: end.toISOString(),
      total_burn: overrides.total_burn ?? 740 - weeksAgo * 25,
      planned_burn: overrides.planned_burn ?? 680,
      pace: overrides.pace ?? (weeksAgo === 0 ? "over" : weeksAgo === 1 ? "on-track" : "under"),
      top_leak_categories:
        overrides.top_leak_categories ?? [
          {
            name: "Dining Out",
            amount: 210 - weeksAgo * 10,
            delta: weeksAgo === 0 ? 18 : weeksAgo === 1 ? -6 : -12,
            sparkline: [120, 150, 170, 210 - weeksAgo * 10],
          },
          {
            name: "Rideshare",
            amount: 128 - weeksAgo * 8,
            delta: weeksAgo === 0 ? 22 : 10 - weeksAgo * 4,
            sparkline: [60, 80, 96, 128 - weeksAgo * 8],
          },
          {
            name: "Subscriptions",
            amount: 112,
            delta: 0,
            sparkline: [112, 112, 112, 112],
          },
        ],
      narrative: overrides.narrative ?? "Restaurant spending is trending up compared to your plan.",
    }
  }

  demoCashBurnReports = [makeReport(0), makeReport(1), makeReport(2)]
}

const seedDemoCashBurnAlerts = () => {
  if (demoCashBurnAlerts.length > 0) return

  const now = new Date()
  const soon = new Date(now.getTime() + 15 * 60 * 1000)

  demoCashBurnAlerts = [
    {
      id: "demo-alert-1",
      user_id: DEMO_ADMIN.user.id,
      category: "Dining Out",
      current_burn: 210,
      threshold: 180,
      status: "ready",
      scheduled_for: soon.toISOString(),
      last_triggered_at: null,
      channel: "in-app",
      message: "Dining Out is pacing $30 over your weekly goal.",
      created_at: now.toISOString(),
    },
    {
      id: "demo-alert-2",
      user_id: DEMO_ADMIN.user.id,
      category: "Rideshare",
      current_burn: 128,
      threshold: 90,
      status: "ready",
      scheduled_for: now.toISOString(),
      last_triggered_at: null,
      channel: "in-app",
      message: "Rideshare is trending 42% above last week.",
      created_at: now.toISOString(),
    },
  ]
}

const getDefaultCashBurnPreferences = (userId) => ({
  user_id: userId,
  plan_tier: userId === DEMO_ADMIN.user.id ? "pro" : "free",
  cadence: "weekly",
  tracked_categories: ["Dining Out", "Rideshare", "Subscriptions"],
  quiet_hours: { start: "21:00", end: "07:00" },
  alert_thresholds: {
    default: 150,
    "dining out": 180,
    rideshare: 90,
  },
  sponsor_slot: {
    label: "Upgrade to Pocket Budget Pro",
    message: "Unlock proactive nudges and unlimited cash burn history.",
    cta: "See plans",
    href: "https://pocketbudget.example.com/upgrade",
  },
})

const notifyDemoAlertSubscribers = (payload) => {
  demoCashBurnAlertSubscribers.forEach((callback) => {
    try {
      callback(payload)
    } catch (error) {
      console.error("Error notifying demo cash burn subscribers", error)
    }
  })
}

const normalizeReport = (report) => {
  if (!report) return null

  return {
    id: report.id,
    userId: report.user_id,
    weekStart: report.week_start,
    weekEnd: report.week_end,
    totalBurn: report.total_burn,
    plannedBurn: report.planned_burn,
    pace: report.pace,
    topCategories: report.top_leak_categories || report.topCategories || [],
    narrative: report.narrative,
    createdAt: report.created_at,
  }
}

const normalizePreferences = (preferences) => {
  if (!preferences) return null

  return {
    userId: preferences.user_id,
    planTier: preferences.plan_tier,
    cadence: preferences.cadence,
    trackedCategories: preferences.tracked_categories || [],
    quietHours: preferences.quiet_hours || { start: "21:00", end: "07:00" },
    alertThresholds: preferences.alert_thresholds || {},
    sponsorSlot: preferences.sponsor_slot,
  }
}

const denormalizePreferences = (preferences) => ({
  user_id: preferences.userId,
  plan_tier: preferences.planTier,
  cadence: preferences.cadence,
  tracked_categories: preferences.trackedCategories,
  quiet_hours: preferences.quietHours,
  alert_thresholds: preferences.alertThresholds,
  sponsor_slot: preferences.sponsorSlot,
})

const normalizeAlert = (alert) => {
  if (!alert) return null

  return {
    id: alert.id,
    userId: alert.user_id,
    category: alert.category,
    currentBurn: alert.current_burn ?? alert.currentBurn,
    threshold: alert.threshold,
    status: alert.status,
    scheduledFor: alert.scheduled_for,
    lastTriggeredAt: alert.last_triggered_at,
    channel: alert.channel || "in-app",
    message: alert.message,
    createdAt: alert.created_at,
  }
}

export const getCashBurnReports = async (userId, { limit = 6 } = {}) => {
  if (!userId) {
    return { data: [], error: new Error("userId is required") }
  }

  if (userId === DEMO_ADMIN.user.id) {
    seedDemoCashBurnReports()
    const reports = demoCashBurnReports.slice(0, limit).map(normalizeReport)
    return { data: reports, error: null }
  }

  const { data, error } = await supabase
    .from("cash_burn_reports")
    .select("*")
    .eq("user_id", userId)
    .order("week_start", { ascending: false })
    .limit(limit)

  return { data: data?.map(normalizeReport) ?? [], error }
}

export const upsertCashBurnReport = async (userId, report) => {
  if (!userId) {
    return { data: null, error: new Error("userId is required") }
  }

  const payload = {
    id: report.id,
    user_id: userId,
    week_start: report.weekStart,
    week_end: report.weekEnd,
    total_burn: report.totalBurn,
    planned_burn: report.plannedBurn,
    pace: report.pace,
    top_leak_categories: report.topCategories,
    narrative: report.narrative,
  }

  if (userId === DEMO_ADMIN.user.id) {
    seedDemoCashBurnReports()
    if (payload.id) {
      demoCashBurnReports = demoCashBurnReports.map((existing) =>
        existing.id === payload.id ? { ...existing, ...payload } : existing,
      )
    } else {
      const newReport = { ...payload, id: `demo-report-${Date.now()}` }
      demoCashBurnReports = [newReport, ...demoCashBurnReports]
      return { data: [normalizeReport(newReport)], error: null }
    }
    const updated = demoCashBurnReports.find((existing) => existing.id === payload.id)
    return { data: [normalizeReport(updated)], error: null }
  }

  const { data, error } = await supabase.from("cash_burn_reports").upsert(payload).select()
  return { data: data?.map(normalizeReport) ?? null, error }
}

export const deleteCashBurnReport = async (reportId) => {
  if (!reportId) {
    return { error: new Error("reportId is required") }
  }

  if (reportId.startsWith("demo-report-")) {
    demoCashBurnReports = demoCashBurnReports.filter((report) => report.id !== reportId)
    return { error: null }
  }

  const { error } = await supabase.from("cash_burn_reports").delete().eq("id", reportId)
  return { error }
}

export const getCashBurnPreferences = async (userId) => {
  if (!userId) {
    return { data: null, error: new Error("userId is required") }
  }

  if (userId === DEMO_ADMIN.user.id) {
    if (!demoCashBurnPreferences) {
      demoCashBurnPreferences = getDefaultCashBurnPreferences(userId)
    }
    return { data: normalizePreferences(demoCashBurnPreferences), error: null }
  }

  const { data, error } = await supabase
    .from("cash_burn_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (error && error.code !== "PGRST116") {
    return { data: null, error }
  }

  if (!data) {
    return { data: null, error: null }
  }

  return { data: normalizePreferences(data), error: null }
}

export const updateCashBurnPreferences = async (userId, preferences) => {
  if (!userId) {
    return { data: null, error: new Error("userId is required") }
  }

  const payload = denormalizePreferences({ ...preferences, userId })

  if (userId === DEMO_ADMIN.user.id) {
    demoCashBurnPreferences = payload
    return { data: normalizePreferences(payload), error: null }
  }

  const { data, error } = await supabase.from("cash_burn_preferences").upsert(payload).select()
  return { data: data?.map(normalizePreferences)?.[0] ?? null, error }
}

export const getCashBurnAlerts = async (userId) => {
  if (!userId) {
    return { data: [], error: new Error("userId is required") }
  }

  if (userId === DEMO_ADMIN.user.id) {
    seedDemoCashBurnAlerts()
    return { data: demoCashBurnAlerts.map(normalizeAlert), error: null }
  }

  const { data, error } = await supabase
    .from("cash_burn_alerts")
    .select("*")
    .eq("user_id", userId)
    .order("scheduled_for", { ascending: true })

  return { data: data?.map(normalizeAlert) ?? [], error }
}

export const createCashBurnAlert = async (userId, alert) => {
  if (!userId) {
    return { data: null, error: new Error("userId is required") }
  }

  const payload = {
    id: alert.id,
    user_id: userId,
    category: alert.category,
    current_burn: alert.currentBurn,
    threshold: alert.threshold,
    status: alert.status ?? "pending",
    scheduled_for: alert.scheduledFor,
    last_triggered_at: alert.lastTriggeredAt,
    channel: alert.channel || "in-app",
    message: alert.message,
  }

  if (userId === DEMO_ADMIN.user.id) {
    const newAlert = { ...payload, id: payload.id || `demo-alert-${Date.now()}` }
    demoCashBurnAlerts = [newAlert, ...demoCashBurnAlerts]
    notifyDemoAlertSubscribers({ type: "INSERT", new: newAlert })
    return { data: normalizeAlert(newAlert), error: null }
  }

  const { data, error } = await supabase.from("cash_burn_alerts").insert(payload).select().single()
  if (!error && data) {
    return { data: normalizeAlert(data), error: null }
  }
  return { data: null, error }
}

export const updateCashBurnAlert = async (alertId, updates) => {
  if (!alertId) {
    return { data: null, error: new Error("alertId is required") }
  }

  const payload = {
    category: updates.category,
    current_burn: updates.currentBurn,
    threshold: updates.threshold,
    status: updates.status,
    scheduled_for: updates.scheduledFor,
    last_triggered_at: updates.lastTriggeredAt,
    channel: updates.channel,
    message: updates.message,
  }

  if (alertId.startsWith("demo-alert-")) {
    demoCashBurnAlerts = demoCashBurnAlerts.map((alert) =>
      alert.id === alertId ? { ...alert, ...payload } : alert,
    )
    const updated = demoCashBurnAlerts.find((alert) => alert.id === alertId)
    notifyDemoAlertSubscribers({ type: "UPDATE", new: updated })
    return { data: normalizeAlert(updated), error: null }
  }

  const { data, error } = await supabase
    .from("cash_burn_alerts")
    .update(payload)
    .eq("id", alertId)
    .select()
    .single()

  return { data: data ? normalizeAlert(data) : null, error }
}

export const deleteCashBurnAlert = async (alertId) => {
  if (!alertId) {
    return { error: new Error("alertId is required") }
  }

  if (alertId.startsWith("demo-alert-")) {
    const existing = demoCashBurnAlerts.find((alert) => alert.id === alertId)
    demoCashBurnAlerts = demoCashBurnAlerts.filter((alert) => alert.id !== alertId)
    notifyDemoAlertSubscribers({ type: "DELETE", old: existing })
    return { error: null }
  }

  const { error } = await supabase.from("cash_burn_alerts").delete().eq("id", alertId)
  return { error }
}

export const recordCashBurnAlertEvent = async (alertId) => {
  if (!alertId) {
    return { error: new Error("alertId is required") }
  }

  const payload = { last_triggered_at: new Date().toISOString(), status: "delivered" }

  if (alertId.startsWith("demo-alert-")) {
    demoCashBurnAlerts = demoCashBurnAlerts.map((alert) =>
      alert.id === alertId ? { ...alert, ...payload } : alert,
    )
    const updated = demoCashBurnAlerts.find((alert) => alert.id === alertId)
    notifyDemoAlertSubscribers({ type: "UPDATE", new: updated })
    return { error: null }
  }

  const { error } = await supabase
    .from("cash_burn_alerts")
    .update(payload)
    .eq("id", alertId)
  return { error }
}

export const subscribeToCashBurnAlerts = (userId, callback) => {
  if (!userId || typeof callback !== "function") {
    return () => {}
  }

  if (userId === DEMO_ADMIN.user.id) {
    demoCashBurnAlertSubscribers.add(callback)
    return () => {
      demoCashBurnAlertSubscribers.delete(callback)
    }
  }

  const channel = supabase
    .channel(`cash-burn-alerts-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "cash_burn_alerts",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => callback(payload),
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
