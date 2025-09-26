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

let demoGoals = []
let demoGoalContributions = []

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

const withGoalRelations = (goal) => ({
  ...goal,
  goal_contributions: (goal.goal_contributions || goal.contributions || []).sort(
    (a, b) => new Date(b.contributed_at || b.date || b.created_at) - new Date(a.contributed_at || a.date || a.created_at),
  ),
})

export const getGoals = async (userId) => {
  if (userId === DEMO_ADMIN.user.id) {
    const goalsWithRelations = demoGoals.map((goal) => ({
      ...goal,
      goal_contributions: demoGoalContributions
        .filter((contribution) => contribution.goal_id === goal.id)
        .sort((a, b) => new Date(b.contributed_at) - new Date(a.contributed_at)),
    }))
    return { data: goalsWithRelations, error: null }
  }

  const { data, error } = await supabase
    .from("goals")
    .select(`
      *,
      goal_contributions (*)
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  return { data: data?.map(withGoalRelations) || [], error }
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

  if (userId === DEMO_ADMIN.user.id) {
    const newGoal = {
      ...payload,
      id: `demo-goal-${Date.now()}`,
    }
    demoGoals = [newGoal, ...demoGoals]
    return { data: [withGoalRelations(newGoal)], error: null }
  }

  const { data, error } = await supabase
    .from("goals")
    .insert([payload])
    .select(`
      *,
      goal_contributions (*)
    `)

  return { data: data?.map(withGoalRelations) || [], error }
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
    const goalIndex = demoGoals.findIndex((goal) => goal.id === goalId)
    if (goalIndex === -1) {
      return { data: null, error: { message: "Goal not found" } }
    }

    demoGoals[goalIndex] = {
      ...demoGoals[goalIndex],
      ...Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined)),
    }

    return { data: [withGoalRelations(demoGoals[goalIndex])], error: null }
  }

  const filteredUpdates = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined))

  const { data, error } = await supabase
    .from("goals")
    .update(filteredUpdates)
    .eq("id", goalId)
    .select(`
      *,
      goal_contributions (*)
    `)

  return { data: data?.map(withGoalRelations) || [], error }
}

export const deleteGoal = async (goalId) => {
  if (goalId.startsWith("demo-goal-")) {
    demoGoals = demoGoals.filter((goal) => goal.id !== goalId)
    demoGoalContributions = demoGoalContributions.filter((contribution) => contribution.goal_id !== goalId)
    return { error: null }
  }

  const { error } = await supabase.from("goals").delete().eq("id", goalId)
  return { error }
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
    const newContribution = {
      id: `demo-goal-contribution-${Date.now()}`,
      ...payload,
    }
    demoGoalContributions = [newContribution, ...demoGoalContributions]
    return { data: [newContribution], error: null }
  }

  const { data, error } = await supabase.from("goal_contributions").insert([payload]).select()
  return { data, error }
}

export const getGoalContributions = async (goalId) => {
  if (goalId.startsWith("demo-goal-")) {
    return {
      data: demoGoalContributions
        .filter((contribution) => contribution.goal_id === goalId)
        .sort((a, b) => new Date(b.contributed_at) - new Date(a.contributed_at)),
      error: null,
    }
  }

  const { data, error } = await supabase
    .from("goal_contributions")
    .select("*")
    .eq("goal_id", goalId)
    .order("contributed_at", { ascending: false })

  return { data, error }
}
