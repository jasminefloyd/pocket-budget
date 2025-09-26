import { createClient } from "@supabase/supabase-js"

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

const DEMO_ADMIN = {
  id: "demo-admin-user-id",
  email: "test@me.com",
  password: "pass123",
  name: "Demo Admin",
}

const createDemoProfile = () => ({
  id: DEMO_ADMIN.id,
  email: DEMO_ADMIN.email,
  full_name: DEMO_ADMIN.name,
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
}

const persistDemoSession = (session) => {
  demoStore.session = session
  if (storage) {
    if (session) {
      storage.setItem("demo-admin-session", JSON.stringify(session))
    } else {
      storage.removeItem("demo-admin-session")
    }
  }
}

const hydrateDemoSession = () => {
  if (demoStore.session) return demoStore.session
  if (!storage) return null
  try {
    const raw = storage.getItem("demo-admin-session")
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.user) return null
    demoStore.session = parsed
    return parsed
  } catch (error) {
    console.error("Failed to hydrate demo session", error)
    return null
  }
}

const demoUser = {
  id: DEMO_ADMIN.id,
  email: DEMO_ADMIN.email,
  user_metadata: {
    full_name: DEMO_ADMIN.name,
  },
  created_at: new Date().toISOString(),
}

const createDemoSession = () => ({
  user: demoUser,
  access_token: "demo-admin-token",
  refresh_token: "demo-admin-refresh",
  token_type: "bearer",
  expires_in: 3600,
})

const isDemoUser = (userId) => userId === DEMO_ADMIN.id

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

export const signUp = async (email, password) => {
  if (email === DEMO_ADMIN.email) {
    return signIn(email, password)
  }
  return supabase.auth.signUp({ email, password })
}

export const signIn = async (email, password) => {
  if (email === DEMO_ADMIN.email && password === DEMO_ADMIN.password) {
    const session = createDemoSession()
    persistDemoSession(session)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("demo-auth-change", { detail: { session, event: "SIGNED_IN" } }))
    }
    return { data: { user: session.user, session }, error: null }
  }
  return supabase.auth.signInWithPassword({ email, password })
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
