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
const SESSION_TIMESTAMP_KEY = "pb:last-session-timestamp"

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
  return Number.isNaN(parsed) ? null : parsed
}

export const signUp = async (email, password) => {
  const result = await supabase.auth.signUp({ email, password })
  if (!result.error && result.data?.session) {
    persistLoginTimestamp()
  }
  return result
}

export const signIn = async (email, password) => {
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
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    },
  })
}

export const signOut = async () => {
  clearLoginTimestamp()
  return supabase.auth.signOut()
}

export const getCurrentUser = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  return { user, error }
}

export const createUserProfile = async (userId, email, fullName) => {
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
  return supabase.from("user_profiles").select("*").eq("id", userId).single()
}

export const updateUserProfile = async (userId, updates) => {
  if (!userId) {
    return { data: null, error: { message: "User ID is required" } }
  }

  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .update(payload)
    .eq("id", userId)
    .select("*")
    .single()

  return { data, error }
}

const normalizeTransactionRecord = (transaction) => ({
  ...transaction,
  amount: Number(transaction.amount || 0),
  budgeted_amount: transaction.budgeted_amount ?? transaction.budgetedAmount ?? null,
  receipt_url: transaction.receipt_url ?? transaction.receipt ?? null,
})

const normalizeBudgetRecord = (budget) => ({
  ...budget,
  transactions: (budget.transactions || []).map(normalizeTransactionRecord),
})

export const getBudgets = async (userId) => {
  const { data, error } = await supabase
    .from("budgets")
    .select(`*, transactions (*)`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  return {
    data: (data || []).map(normalizeBudgetRecord),
    error,
  }
}

export const createBudget = async (userId, budgetData) => {
  const payload = {
    user_id: userId,
    name: budgetData.name,
    category_budgets: budgetData.categoryBudgets || [],
  }

  const result = await supabase
    .from("budgets")
    .insert([payload])
    .select(`*, transactions (*)`)

  if (result.error) {
    return { data: null, error: result.error }
  }

  let rows = result.data || []

  if (!rows.length) {
    const { data: latest, error: fetchError } = await supabase
      .from("budgets")
      .select(`*, transactions (*)`)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)

    if (!fetchError && latest?.length) {
      rows = latest
    } else {
      const fallbackId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `temp-budget-${Date.now()}`
      const now = new Date().toISOString()
      rows = [
        {
          id: fallbackId,
          user_id: userId,
          name: budgetData.name,
          category_budgets: budgetData.categoryBudgets || [],
          created_at: now,
          transactions: [],
          __optimistic: true,
        },
      ]
    }
  }

  const normalized = rows.map((row) => {
    const cleaned = { ...row }
    delete cleaned.__optimistic
    return normalizeBudgetRecord(cleaned)
  })

  return {
    data: normalized,
    error: null,
    optimistic: rows.some((row) => row.__optimistic),
  }
}

export const updateBudget = async (budgetId, updates) => {
  const filtered = {
    name: updates.name,
    category_budgets: updates.categoryBudgets,
  }

  const { data, error } = await supabase
    .from("budgets")
    .update(filtered)
    .eq("id", budgetId)
    .select(`*, transactions (*)`)

  return {
    data: (data || []).map(normalizeBudgetRecord),
    error,
  }
}

export const deleteBudget = async (budgetId) => {
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
  }

  const { data, error } = await supabase.from("transactions").insert([payload]).select()
  return { data: (data || []).map(normalizeTransactionRecord), error }
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

  const filtered = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined))

  const { data, error } = await supabase
    .from("transactions")
    .update(filtered)
    .eq("id", transactionId)
    .select()

  return {
    data: (data || []).map(normalizeTransactionRecord),
    error,
  }
}

export const deleteTransaction = async (transactionId) => {
  return supabase.from("transactions").delete().eq("id", transactionId)
}

export const getCashBurn = async (userId) => {
  if (!userId) {
    return { data: null, error: { message: "User ID is required" } }
  }

  const { data, error } = await supabase.rpc("get_cash_burn", { p_user_id: userId })
  if (error) {
    return { data: null, error }
  }

  const record = Array.isArray(data) ? data[0] : data
  return { data: record || null, error: null }
}

export const getUserCategories = async (userId) => {
  return supabase.from("user_categories").select("*").eq("user_id", userId).single()
}

export const updateUserCategories = async (userId, categories) => {
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

const DEFAULT_MILESTONES = [25, 50, 75, 100]

const normalizeGoal = (goal) => ({
  ...goal,
  milestones: goal.milestones && goal.milestones.length ? goal.milestones : DEFAULT_MILESTONES,
})

const withSortedContributions = (goal) => ({
  ...normalizeGoal(goal),
  goal_contributions: (goal.goal_contributions || [])
    .map((contribution) => ({
      ...contribution,
      amount: Number(contribution.amount || 0),
    }))
    .sort((a, b) => new Date(b.contributed_at) - new Date(a.contributed_at)),
})

export const getGoals = async (userId) => {
  const { data, error } = await supabase
    .from("goals")
    .select(`*, goal_contributions (*)`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  return {
    data: (data || []).map(withSortedContributions),
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
    milestones: goalData.milestones || DEFAULT_MILESTONES,
    linked_budget_id: goalData.linkedBudgetId || null,
    created_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from("goals")
    .insert([payload])
    .select(`*, goal_contributions (*)`)

  return {
    data: (data || []).map(withSortedContributions),
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

  const filtered = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined))

  const { data, error } = await supabase
    .from("goals")
    .update(filtered)
    .eq("id", goalId)
    .select(`*, goal_contributions (*)`)

  return {
    data: (data || []).map(withSortedContributions),
    error,
  }
}

export const deleteGoal = async (goalId) => {
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

  const { data, error } = await supabase.from("goal_contributions").insert([payload]).select()
  return { data, error }
}

export const getGoalContributions = async (goalId) => {
  return supabase
    .from("goal_contributions")
    .select("*")
    .eq("goal_id", goalId)
    .order("contributed_at", { ascending: false })
}

const normalizeInsightRecord = (record) => ({
  ...record,
  insights: record.insights || {},
})

export const getAIInsights = async (userId, budgetId, options = {}) => {
  const limit = options.limit ?? 10

  if (!userId || !budgetId) {
    return { data: [], error: null }
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

export const getLatestAIInsight = async (userId) => {
  if (!userId) {
    return { data: null, error: null }
  }

  const { data, error } = await supabase
    .from("ai_insights")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)

  if (error) {
    return { data: null, error }
  }

  const record = Array.isArray(data) ? data[0] : data
  return { data: record ? normalizeInsightRecord(record) : null, error: null }
}

export const generateAIInsight = async ({ userId, budgetId, metrics = {} }) => {
  if (!userId || !budgetId) {
    return { data: null, error: { message: "Missing user or budget context" } }
  }

  const { data, error } = await supabase.functions.invoke("ai-insights", {
    body: {
      budgetId,
      userId,
      metrics,
    },
  })

  if (error) {
    try {
      const fallback = await simulateAIResponse(metrics)
      const record = normalizeInsightRecord({
        id: `local-insight-${Date.now()}`,
        user_id: userId,
        budget_id: budgetId,
        insights: fallback,
        created_at: new Date().toISOString(),
        tier: "local",
      })
      return { data: record, error: null }
    } catch (simulationError) {
      console.error("Failed to generate fallback insight", simulationError)
      return { data: null, error }
    }
  }

  const insightRecord = data?.insight ? normalizeInsightRecord(data.insight) : null
  if (!insightRecord) {
    const fallback = await simulateAIResponse(metrics)
    const record = normalizeInsightRecord({
      id: `local-insight-${Date.now()}`,
      user_id: userId,
      budget_id: budgetId,
      insights: fallback,
      created_at: new Date().toISOString(),
      tier: "local",
    })
    return { data: record, error: null }
  }

  return { data: insightRecord, error: null }
}

export const shouldRefreshSession = () => {
  const timestamp = getStoredLoginTimestamp()
  return hasSessionExpired(timestamp)
}
