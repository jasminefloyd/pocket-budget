import { createClient } from "@supabase/supabase-js"
import { simulateAIResponse } from "./insightSimulator"

import { hasSessionExpired } from "./session"

const REQUIRED_ENV_VARS = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]

const missing = REQUIRED_ENV_VARS.filter((key) => !import.meta.env[key])
if (missing.length) {
  throw new Error(`Missing Supabase environment variables: ${missing.join(", ")}`)
}

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
})

const storage = typeof window !== "undefined" ? window.localStorage : null

const SESSION_TIMESTAMP_KEY = "fulltest-session-timestamp"
const DEMO_SESSION_KEY = "fulltest-demo-session"

export const persistLoginTimestamp = () => {
  if (!storage) return
  storage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString())
}

export const clearLoginTimestamp = () => {
  if (!storage) return
  storage.removeItem(SESSION_TIMESTAMP_KEY)
}

export const getStoredLoginTimestamp = () => {
  if (!storage) return null
  const raw = storage.getItem(SESSION_TIMESTAMP_KEY)
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed)) return null
  return parsed
}

const FULLTEST_DEMO_ACCOUNT = {
  id: "fulltest-demo-user-id",
  email: "fulltest@test.com",
  password: "fullpass123",
  name: "Full Test Demo",
}

const createDemoProfile = () => ({
  id: FULLTEST_DEMO_ACCOUNT.id,
  email: FULLTEST_DEMO_ACCOUNT.email,
  full_name: FULLTEST_DEMO_ACCOUNT.name,
  created_at: new Date().toISOString(),
})

const DEMO_CATEGORIES = {
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

const cloneCategories = (categories) => ({
  income: [...(categories?.income || [])].map((category) => ({ ...category })),
  expense: [...(categories?.expense || [])].map((category) => ({ ...category })),
})

const demoStore = {
  session: null,
  profile: createDemoProfile(),
  categories: cloneCategories(DEMO_CATEGORIES),
  budgets: [],
  goals: [],
  contributions: [],
  aiInsights: [],
}

export const clearStoredDemoSession = () => {
  const hadSession = Boolean(demoStore.session)
  let storedSessionDetected = false
  if (storage) {
    storedSessionDetected = Boolean(storage.getItem(DEMO_SESSION_KEY))
  }
  demoStore.session = null
  if (storage) {
    storage.removeItem(DEMO_SESSION_KEY)
  }
  return hadSession || storedSessionDetected
}

const persistDemoSession = (session) => {
  if (!session) {
    clearStoredDemoSession()
    clearLoginTimestamp()
    return
  }

  demoStore.session = session
  if (storage) {
    storage.setItem(DEMO_SESSION_KEY, JSON.stringify(session))
  }
  persistLoginTimestamp()
}

const hydrateDemoSession = () => {
  if (demoStore.session) return demoStore.session
  if (!storage) return null
  try {
    const raw = storage.getItem(DEMO_SESSION_KEY)
    if (!raw) return null
    const timestamp = getStoredLoginTimestamp()
    if (hasSessionExpired(timestamp)) {
      clearStoredDemoSession()
      clearLoginTimestamp()
      return null
    }
    const parsed = JSON.parse(raw)
    if (!parsed?.user) {
      clearStoredDemoSession()
      clearLoginTimestamp()
      return null
    }
    demoStore.session = parsed
    return parsed
  } catch (error) {
    console.error("Failed to hydrate demo session", error)
    clearStoredDemoSession()
    clearLoginTimestamp()
    return null
  }
}

const demoUser = {
  id: FULLTEST_DEMO_ACCOUNT.id,
  email: FULLTEST_DEMO_ACCOUNT.email,
  user_metadata: {
    full_name: FULLTEST_DEMO_ACCOUNT.name,
  },
  created_at: new Date().toISOString(),
}

const createDemoSession = () => ({
  user: demoUser,
  access_token: "fulltest-demo-token",
  refresh_token: "fulltest-demo-refresh",
  token_type: "bearer",
  expires_in: 3600,
})

const isDemoUser = (userId) => userId === FULLTEST_DEMO_ACCOUNT.id

const ensureDemoBudgetShape = (budget) => ({
  ...budget,
  transactions: [...(budget.transactions || [])],
  category_budgets: [...(budget.category_budgets || [])],
})

const normalizeTransactionRecord = (transaction) => ({
  ...transaction,
  budgeted_amount: transaction.budgeted_amount ?? transaction.budgetedAmount ?? null,
  receipt_url: transaction.receipt_url ?? transaction.receipt ?? null,
})

const normalizeGoal = (goal) => ({
  ...goal,
  milestones: goal.milestones && goal.milestones.length ? goal.milestones : [25, 50, 75, 100],
})

const selectGoalWithRelations = (goal) => ({
  ...normalizeGoal(goal),
  goal_contributions: (demoStore.contributions || [])
    .filter((contribution) => contribution.goal_id === goal.id)
    .sort((a, b) => new Date(b.contributed_at) - new Date(a.contributed_at)),
})

const ensureDemoInsightShape = (insight) => ({
  ...insight,
  insights: insight.insights || {},
})

const normalizeInsightRecord = (record) => ({
  ...record,
  insights: record.insights || {},
})

const DEFAULT_BURN_SUMMARY = {
  burnPerDay: 0,
  burnPerWeek: 0,
  burnPerMonth: 0,
  daysLeft: null,
  projectionDate: null,
  status: "safe",
  badgeLabel: "Safe Zone",
  sampleStart: null,
  sampleEnd: null,
  totalExpense: 0,
  safeBalance: 0,
}

const asNumber = (value) => (value === null || value === undefined ? 0 : Number(value))

const computeBurnMetrics = (transactions = []) => {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return { ...DEFAULT_BURN_SUMMARY }
  }

  const expenseTransactions = transactions.filter((tx) => tx?.type === "expense")
  const totalIncome = transactions
    .filter((tx) => tx?.type === "income")
    .reduce((sum, tx) => sum + asNumber(tx.amount), 0)
  const totalExpensesAll = transactions
    .filter((tx) => tx?.type === "expense")
    .reduce((sum, tx) => sum + asNumber(tx.amount), 0)
  const safeBalance = Math.max(0, totalIncome - totalExpensesAll)

  if (expenseTransactions.length === 0) {
    return { ...DEFAULT_BURN_SUMMARY, safeBalance }
  }

  const DAY_MS = 1000 * 60 * 60 * 24
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)

  const windowedExpenses = expenseTransactions.filter((tx) => {
    const txDate = tx?.date ? new Date(tx.date) : null
    return txDate && !Number.isNaN(txDate.getTime()) && txDate >= cutoff
  })

  const sample = windowedExpenses.length > 0 ? windowedExpenses : expenseTransactions

  let earliest = Number.POSITIVE_INFINITY
  let latest = 0
  let total = 0

  sample.forEach((tx) => {
    const timestamp = tx?.date ? new Date(tx.date).getTime() : Number.NaN
    if (!Number.isFinite(timestamp)) return
    earliest = Math.min(earliest, timestamp)
    latest = Math.max(latest, timestamp)
    total += asNumber(tx.amount)
  })

  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) {
    return { ...DEFAULT_BURN_SUMMARY, safeBalance }
  }

  const spanDays = Math.max(1, Math.round((latest - earliest) / DAY_MS) + 1)
  const burnPerDay = spanDays > 0 ? total / spanDays : 0
  const daysLeft = burnPerDay > 0 ? Math.floor(safeBalance / burnPerDay) : null
  const projectionDate =
    typeof daysLeft === "number" ? new Date(Date.now() + daysLeft * DAY_MS) : null
  const status = typeof daysLeft === "number" && daysLeft < 15 ? "critical" : "safe"

  return {
    burnPerDay,
    burnPerWeek: burnPerDay * 7,
    burnPerMonth: burnPerDay * 30,
    daysLeft,
    projectionDate,
    status,
    badgeLabel: status === "critical" ? "Critical Burn" : "Safe Zone",
    sampleStart: new Date(earliest),
    sampleEnd: new Date(latest),
    totalExpense: total,
    safeBalance,
  }
}

const normalizeBurnRecord = (record) => {
  if (!record) return null

  const normalizedStatus = record.status || "safe"
  const badgeLabel =
    record.badge_label || (normalizedStatus === "critical" ? "Critical Burn" : "Safe Zone")

  return {
    burnPerDay: asNumber(record.burn_per_day),
    burnPerWeek: asNumber(record.burn_per_week),
    burnPerMonth: asNumber(record.burn_per_month),
    daysLeft: record.days_left === null || record.days_left === undefined ? null : Number(record.days_left),
    projectionDate: record.projection_date ? new Date(record.projection_date) : null,
    status: normalizedStatus,
    badgeLabel,
    sampleStart: record.sample_start ? new Date(record.sample_start) : null,
    sampleEnd: record.sample_end ? new Date(record.sample_end) : null,
    totalExpense: asNumber(record.total_expense),
    safeBalance: asNumber(record.safe_balance),
  }
}

export const signUp = async (email, password) => {
  if (email === FULLTEST_DEMO_ACCOUNT.email) {
    return signIn(email, password)
  }
  return supabase.auth.signUp({ email, password })
}

export const signIn = async (email, password) => {
  if (email === FULLTEST_DEMO_ACCOUNT.email && password === FULLTEST_DEMO_ACCOUNT.password) {
    const session = createDemoSession()
    persistDemoSession(session)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("demo-auth-change", { detail: { session, event: "SIGNED_IN" } }))
    }
    return { data: { user: session.user, session }, error: null }
  }
  const result = await supabase.auth.signInWithPassword({ email, password })
  if (!result.error && result.data?.session) {
    persistLoginTimestamp()
  }
  return result
}

export const signInWithGoogle = async () => {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
    },
  })
}

export const signOut = async () => {
  persistDemoSession(null)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("demo-auth-change", { detail: { session: null, event: "SIGNED_OUT" } }))
  }
  return supabase.auth.signOut()
}

export const getCurrentUser = async () => {
  const demoSession = hydrateDemoSession()
  if (demoSession?.user) {
    return { user: demoSession.user, error: null }
  }
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  return { user, error }
}

export const createUserProfile = async (userId, email, fullName) => {
  if (isDemoUser(userId)) {
    demoStore.profile = {
      id: userId,
      email,
      full_name: fullName,
      created_at: new Date().toISOString(),
    }
    return { data: [demoStore.profile], error: null }
  }

  return supabase
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
}

export const getUserProfile = async (userId) => {
  if (isDemoUser(userId)) {
    return { data: demoStore.profile, error: null }
  }
  return supabase.from("user_profiles").select("*").eq("id", userId).single()
}

const demoBudgets = () => demoStore.budgets

const findDemoBudget = (budgetId) => demoBudgets().find((budget) => budget.id === budgetId)

export const getBudgets = async (userId) => {
  if (isDemoUser(userId)) {
    return { data: demoBudgets().map(ensureDemoBudgetShape), error: null }
  }

  const { data, error } = await supabase
    .from("budgets")
    .select(`*, transactions (*)`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  return {
    data: (data || []).map((budget) => ({
      ...budget,
      transactions: (budget.transactions || []).map(normalizeTransactionRecord),
    })),
    error,
  }
}

export const createBudget = async (userId, budgetData) => {
  const payload = {
    user_id: userId,
    name: budgetData.name,
    category_budgets: budgetData.categoryBudgets || [],
    created_at: new Date().toISOString(),
    transactions: [],
  }

  if (isDemoUser(userId)) {
    const demoBudget = { ...payload, id: `demo-budget-${Date.now()}` }
    demoStore.budgets = [demoBudget, ...demoStore.budgets]
    return { data: [ensureDemoBudgetShape(demoBudget)], error: null }
  }

  const { data, error } = await supabase
    .from("budgets")
    .insert([
      {
        user_id: userId,
        name: budgetData.name,
        category_budgets: budgetData.categoryBudgets || [],
      },
    ])
    .select(`*, transactions (*)`)

  return {
    data: (data || []).map((budget) => ({
      ...budget,
      transactions: (budget.transactions || []).map(normalizeTransactionRecord),
    })),
    error,
  }
}

export const updateBudget = async (budgetId, budgetData) => {
  if (budgetId.startsWith("demo-budget-")) {
    const target = findDemoBudget(budgetId)
    if (!target) {
      return { data: null, error: { message: "Budget not found" } }
    }
    Object.assign(target, {
      name: budgetData.name ?? target.name,
      category_budgets: budgetData.categoryBudgets ?? target.category_budgets,
    })
    return { data: [ensureDemoBudgetShape(target)], error: null }
  }

  const updates = {
    name: budgetData.name,
    category_budgets: budgetData.categoryBudgets,
  }

  const filteredUpdates = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined))

  const { data, error } = await supabase
    .from("budgets")
    .update(filteredUpdates)
    .eq("id", budgetId)
    .select(`*, transactions (*)`)

  return {
    data: (data || []).map((budget) => ({
      ...budget,
      transactions: (budget.transactions || []).map(normalizeTransactionRecord),
    })),
    error,
  }
}

export const deleteBudget = async (budgetId) => {
  if (budgetId.startsWith("demo-budget-")) {
    demoStore.budgets = demoStore.budgets.filter((budget) => budget.id !== budgetId)
    demoStore.contributions = demoStore.contributions.filter((contribution) => contribution.linked_budget_id !== budgetId)
    return { error: null }
  }
  return supabase.from("budgets").delete().eq("id", budgetId)
}

export const createTransaction = async (budgetId, transactionData) => {
  const payload = {
    budget_id: budgetId,
    name: transactionData.name,
    amount: transactionData.amount,
    budgeted_amount: transactionData.budgetedAmount ?? null,
    category: transactionData.category,
    type: transactionData.type,
    date: transactionData.date,
    receipt_url: transactionData.receipt ?? null,
    created_at: new Date().toISOString(),
  }

  if (budgetId.startsWith("demo-budget-")) {
    const budget = findDemoBudget(budgetId)
    if (!budget) {
      return { data: null, error: { message: "Budget not found" } }
    }
    const demoTransaction = { ...payload, id: `demo-tx-${Date.now()}` }
    budget.transactions = [...(budget.transactions || []), demoTransaction]
    return { data: [normalizeTransactionRecord(demoTransaction)], error: null }
  }

  const { data, error } = await supabase.from("transactions").insert([payload]).select()
  return {
    data: (data || []).map(normalizeTransactionRecord),
    error,
  }
}

export const updateTransaction = async (transactionId, transactionData) => {
  const updates = {
    name: transactionData.name,
    amount: transactionData.amount,
    budgeted_amount: transactionData.budgetedAmount ?? null,
    category: transactionData.category,
    type: transactionData.type,
    date: transactionData.date,
    receipt_url: transactionData.receipt ?? null,
  }

  if (transactionId.startsWith("demo-tx-")) {
    const budget = demoBudgets().find((candidate) => (candidate.transactions || []).some((tx) => tx.id === transactionId))
    if (!budget) {
      return { data: null, error: { message: "Transaction not found" } }
    }
    budget.transactions = (budget.transactions || []).map((tx) => (tx.id === transactionId ? { ...tx, ...updates } : tx))
    const updated = budget.transactions.find((tx) => tx.id === transactionId)
    return { data: [normalizeTransactionRecord(updated)], error: null }
  }

  const filteredUpdates = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined))

  const { data, error } = await supabase
    .from("transactions")
    .update(filteredUpdates)
    .eq("id", transactionId)
    .select()

  return {
    data: (data || []).map(normalizeTransactionRecord),
    error,
  }
}

export const deleteTransaction = async (transactionId) => {
  if (transactionId.startsWith("demo-tx-")) {
    demoStore.budgets = demoStore.budgets.map((budget) => ({
      ...budget,
      transactions: (budget.transactions || []).filter((tx) => tx.id !== transactionId),
    }))
    return { error: null }
  }
  return supabase.from("transactions").delete().eq("id", transactionId)
}

export const getCashBurn = async (userId) => {
  if (!userId) {
    return { data: null, error: { message: "User ID is required" } }
  }

  if (isDemoUser(userId)) {
    const transactions = demoBudgets().flatMap((budget) => budget.transactions || [])
    return { data: computeBurnMetrics(transactions), error: null }
  }

  const { data, error } = await supabase.rpc("get_cash_burn", { p_user_id: userId })
  if (error) {
    return { data: null, error }
  }

  const record = Array.isArray(data) ? data[0] : data
  const normalized = normalizeBurnRecord(record)

  return { data: normalized ?? { ...DEFAULT_BURN_SUMMARY }, error: null }
}

export const getUserCategories = async (userId) => {
  if (isDemoUser(userId)) {
    return { data: { categories: cloneCategories(demoStore.categories) }, error: null }
  }
  return supabase.from("user_categories").select("*").eq("user_id", userId).single()
}

export const updateUserCategories = async (userId, categories) => {
  if (isDemoUser(userId)) {
    demoStore.categories = cloneCategories(categories)
    return { data: [{ categories: cloneCategories(demoStore.categories) }], error: null }
  }

  return supabase
    .from("user_categories")
    .upsert([
      {
        user_id: userId,
        categories,
      },
    ])
    .select()
}

export const getGoals = async (userId) => {
  if (isDemoUser(userId)) {
    return {
      data: demoStore.goals.map((goal) => selectGoalWithRelations(goal)),
      error: null,
    }
  }

  const { data, error } = await supabase
    .from("goals")
    .select(`*, goal_contributions (*)`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  return {
    data: (data || []).map((goal) => ({
      ...normalizeGoal(goal),
      goal_contributions: (goal.goal_contributions || []).sort(
        (a, b) => new Date(b.contributed_at) - new Date(a.contributed_at),
      ),
    })),
    error,
  }
}

export const createGoal = async (userId, goalData) => {
  const payload = {
    user_id: userId,
    name: goalData.name,
    target_amount: goalData.targetAmount,
    target_date: goalData.targetDate,
    status: goalData.status || "active",
    milestones: goalData.milestones || [25, 50, 75, 100],
    linked_budget_id: goalData.linkedBudgetId || null,
    created_at: new Date().toISOString(),
  }

  if (isDemoUser(userId)) {
    const goal = { ...payload, id: `demo-goal-${Date.now()}` }
    demoStore.goals = [goal, ...demoStore.goals]
    return { data: [selectGoalWithRelations(goal)], error: null }
  }

  const { data, error } = await supabase
    .from("goals")
    .insert([payload])
    .select(`*, goal_contributions (*)`)

  return {
    data: (data || []).map((goal) => ({
      ...normalizeGoal(goal),
      goal_contributions: (goal.goal_contributions || []).sort(
        (a, b) => new Date(b.contributed_at) - new Date(a.contributed_at),
      ),
    })),
    error,
  }
}

export const updateGoal = async (goalId, goalData) => {
  const updates = {
    name: goalData.name,
    target_amount: goalData.targetAmount,
    target_date: goalData.targetDate,
    status: goalData.status,
    milestones: goalData.milestones,
    linked_budget_id: goalData.linkedBudgetId ?? null,
  }

  if (goalId.startsWith("demo-goal-")) {
    const index = demoStore.goals.findIndex((goal) => goal.id === goalId)
    if (index === -1) {
      return { data: null, error: { message: "Goal not found" } }
    }
    const filtered = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined))
    demoStore.goals[index] = { ...demoStore.goals[index], ...filtered }
    return { data: [selectGoalWithRelations(demoStore.goals[index])], error: null }
  }

  const filteredUpdates = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined))

  const { data, error } = await supabase
    .from("goals")
    .update(filteredUpdates)
    .eq("id", goalId)
    .select(`*, goal_contributions (*)`)

  return {
    data: (data || []).map((goal) => ({
      ...normalizeGoal(goal),
      goal_contributions: (goal.goal_contributions || []).sort(
        (a, b) => new Date(b.contributed_at) - new Date(a.contributed_at),
      ),
    })),
    error,
  }
}

export const deleteGoal = async (goalId) => {
  if (goalId.startsWith("demo-goal-")) {
    demoStore.goals = demoStore.goals.filter((goal) => goal.id !== goalId)
    demoStore.contributions = demoStore.contributions.filter((contribution) => contribution.goal_id !== goalId)
    return { error: null }
  }
  return supabase.from("goals").delete().eq("id", goalId)
}

export const addGoalContribution = async (goalId, contributionData) => {
  const payload = {
    goal_id: goalId,
    amount: contributionData.amount,
    contributed_at: contributionData.date || new Date().toISOString(),
    note: contributionData.note || null,
    created_at: new Date().toISOString(),
  }

  if (goalId.startsWith("demo-goal-")) {
    const contribution = { ...payload, id: `demo-goal-contribution-${Date.now()}` }
    demoStore.contributions = [contribution, ...demoStore.contributions]
    return { data: [contribution], error: null }
  }

  const { data, error } = await supabase.from("goal_contributions").insert([payload]).select()
  return { data, error }
}

export const getGoalContributions = async (goalId) => {
  if (goalId.startsWith("demo-goal-")) {
    return {
      data: demoStore.contributions
        .filter((contribution) => contribution.goal_id === goalId)
        .sort((a, b) => new Date(b.contributed_at) - new Date(a.contributed_at)),
      error: null,
    }
  }

  return supabase
    .from("goal_contributions")
    .select("*")
    .eq("goal_id", goalId)
    .order("contributed_at", { ascending: false })
}

export const getAIInsights = async (userId, budgetId, options = {}) => {
  const limit = options.limit ?? 10

  if (!userId || !budgetId) {
    return { data: [], error: null }
  }

  if (isDemoUser(userId) || budgetId.startsWith("demo-budget-")) {
    const entries = demoStore.aiInsights
      .filter((entry) => entry.user_id === userId && entry.budget_id === budgetId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit)
      .map(ensureDemoInsightShape)

    return { data: entries, error: null }
  }

  let query = supabase
    .from("ai_insights")
    .select("*")
    .eq("user_id", userId)
    .eq("budget_id", budgetId)
    .order("created_at", { ascending: false })

  if (limit) {
    query = query.limit(limit)
  }

  const { data, error } = await query
  return { data: (data || []).map(normalizeInsightRecord), error }
}

export const generateAIInsight = async ({ userId, budgetId, metrics = {}, tier = "free" }) => {
  if (!userId || !budgetId) {
    return { data: null, error: { message: "Missing user or budget context" } }
  }

  const normalizedTier = ["paid", "trial", "pro", "premium", "plus"].includes(String(tier).toLowerCase())
    ? "paid"
    : "free"

  if (isDemoUser(userId) || budgetId.startsWith("demo-budget-")) {
    const insights = await simulateAIResponse(metrics)
    const record = ensureDemoInsightShape({
      id: `demo-insight-${Date.now()}`,
      user_id: userId,
      budget_id: budgetId,
      tier: normalizedTier,
      model: normalizedTier === "paid" ? "gpt-4o" : "gpt-4o-mini",
      prompt: { tier: normalizedTier, metrics },
      insights,
      raw_response: JSON.stringify(insights),
      usage: null,
      created_at: new Date().toISOString(),
    })

    demoStore.aiInsights = [record, ...demoStore.aiInsights].slice(0, 20)
    return { data: record, error: null }
  }

  const { data, error } = await supabase.functions.invoke("ai-insights", {
    body: {
      budgetId,
      userId,
      tier: normalizedTier,
      metrics,
    },
  })

  if (error) {
    return { data: null, error }
  }

  const insightRecord = data?.insight ? normalizeInsightRecord(data.insight) : null
  if (!insightRecord) {
    return { data: null, error: { message: "No insight was returned" } }
  }

  return { data: insightRecord, error: null }
}
