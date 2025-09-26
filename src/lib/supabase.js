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
    subscription_status: "trial",
    trial_ends_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
    entitlements: { goals: true },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
}

const DEFAULT_GOAL_MILESTONES = [25, 50, 75, 100]

const buildDefaultMilestones = (targetAmount = 0) => {
  const amount = Number(targetAmount) || 0
  if (amount <= 0) {
    return []
  }

  return DEFAULT_GOAL_MILESTONES.map((percentage) => ({
    label: `${percentage}%`,
    amount: Number((amount * (percentage / 100)).toFixed(2)),
    achieved_at: null,
  }))
}

const transformContributionRecord = (contribution) => {
  if (!contribution) {
    return null
  }

  return {
    id: contribution.id,
    goalId: contribution.goal_id,
    userId: contribution.user_id,
    amount: Number(contribution.amount || 0),
    contributedAt: contribution.contributed_at || contribution.created_at,
    createdAt: contribution.created_at,
  }
}

export const transformGoalRecord = (goal) => {
  if (!goal) {
    return null
  }

  const contributions = Array.isArray(goal.goal_contributions)
    ? goal.goal_contributions
        .map(transformContributionRecord)
        .filter(Boolean)
        .sort((a, b) => new Date(b.contributedAt) - new Date(a.contributedAt))
    : []

  return {
    id: goal.id,
    userId: goal.user_id,
    name: goal.name,
    targetAmount: Number(goal.target_amount || 0),
    targetDate: goal.target_date,
    currentAmount: Number(goal.current_amount || 0),
    milestones: goal.milestones || [],
    createdAt: goal.created_at,
    updatedAt: goal.updated_at,
    contributions,
  }
}

const evaluateMilestones = (milestones = [], newAmount, timestamp = new Date().toISOString()) => {
  const achieved = []
  const updated = milestones.map((milestone) => {
    if (!milestone) return milestone
    const amountTarget = Number(milestone.amount || 0)
    const alreadyAchieved = Boolean(milestone.achieved_at)
    if (!alreadyAchieved && Number(newAmount || 0) >= amountTarget && amountTarget > 0) {
      achieved.push({ label: milestone.label, amount: amountTarget })
      return { ...milestone, achieved_at: timestamp }
    }
    return milestone
  })

  return { updatedMilestones: updated, achievedMilestones: achieved }
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

  const trialEndsAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString()
  const defaultEntitlements = { goals: true }

  const { data, error } = await supabase
    .from("user_profiles")
    .insert([
      {
        id: userId,
        email,
        full_name: fullName,
        subscription_status: "trial",
        trial_ends_at: trialEndsAt,
        entitlements: defaultEntitlements,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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
let demoGoals = []
let demoGoalContributions = []
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

const getDemoGoalContributions = (goalId) =>
  demoGoalContributions
    .filter((contribution) => contribution.goal_id === goalId)
    .sort((a, b) => new Date(b.contributed_at) - new Date(a.contributed_at))

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

export const getGoals = async (userId) => {
  if (!userId) {
    return { data: [], error: null }
  }

  if (userId === DEMO_ADMIN.user.id) {
    const goals = demoGoals
      .filter((goal) => goal.user_id === userId)
      .map((goal) =>
        transformGoalRecord({
          ...goal,
          goal_contributions: getDemoGoalContributions(goal.id),
        }),
      )
    return { data: goals, error: null }
  }

  const { data, error } = await supabase
    .from("goals")
    .select(`
      *,
      goal_contributions (*)
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) {
    return { data: null, error }
  }

  return { data: (data || []).map(transformGoalRecord), error: null }
}

export const createGoal = async (userId, goalData) => {
  const nowIso = new Date().toISOString()
  const targetAmount = Number(goalData?.targetAmount || 0)
  const milestones =
    Array.isArray(goalData?.milestones) && goalData.milestones.length > 0
      ? goalData.milestones
      : buildDefaultMilestones(targetAmount)

  if (userId === DEMO_ADMIN.user.id) {
    const newGoal = {
      id: `demo-goal-${Date.now()}`,
      user_id: userId,
      name: goalData?.name || "New Goal",
      target_amount: targetAmount,
      target_date: goalData?.targetDate,
      current_amount: Number(goalData?.currentAmount || 0),
      milestones,
      created_at: nowIso,
      updated_at: nowIso,
    }

    demoGoals = [newGoal, ...demoGoals]

    return {
      data: transformGoalRecord({ ...newGoal, goal_contributions: [] }),
      error: null,
    }
  }

  const { data, error } = await supabase
    .from("goals")
    .insert([
      {
        user_id: userId,
        name: goalData?.name,
        target_amount: targetAmount,
        target_date: goalData?.targetDate,
        current_amount: Number(goalData?.currentAmount || 0),
        milestones,
        created_at: nowIso,
        updated_at: nowIso,
      },
    ])
    .select(`
      *,
      goal_contributions (*)
    `)
    .single()

  if (error) {
    return { data: null, error }
  }

  return { data: transformGoalRecord(data), error: null }
}

export const updateGoal = async (goalId, updates = {}) => {
  if (!goalId) {
    return { data: null, error: { message: "Missing goal id" } }
  }

  const payload = { updated_at: new Date().toISOString() }

  if (Object.prototype.hasOwnProperty.call(updates, "name")) {
    payload.name = updates.name
  }
  if (Object.prototype.hasOwnProperty.call(updates, "targetAmount")) {
    payload.target_amount = Number(updates.targetAmount)
  }
  if (Object.prototype.hasOwnProperty.call(updates, "targetDate")) {
    payload.target_date = updates.targetDate
  }
  if (Object.prototype.hasOwnProperty.call(updates, "currentAmount")) {
    payload.current_amount = Number(updates.currentAmount)
  }
  if (Object.prototype.hasOwnProperty.call(updates, "milestones")) {
    payload.milestones = updates.milestones
  }

  if (goalId.startsWith("demo-goal-")) {
    const goalIndex = demoGoals.findIndex((goal) => goal.id === goalId)
    if (goalIndex === -1) {
      return { data: null, error: { message: "Goal not found" } }
    }

    demoGoals[goalIndex] = {
      ...demoGoals[goalIndex],
      ...payload,
    }

    return {
      data: transformGoalRecord({
        ...demoGoals[goalIndex],
        goal_contributions: getDemoGoalContributions(goalId),
      }),
      error: null,
    }
  }

  const { data, error } = await supabase
    .from("goals")
    .update(payload)
    .eq("id", goalId)
    .select(`
      *,
      goal_contributions (*)
    `)
    .single()

  if (error) {
    return { data: null, error }
  }

  return { data: transformGoalRecord(data), error: null }
}

export const deleteGoal = async (goalId) => {
  if (!goalId) {
    return { error: { message: "Missing goal id" } }
  }

  if (goalId.startsWith("demo-goal-")) {
    demoGoals = demoGoals.filter((goal) => goal.id !== goalId)
    demoGoalContributions = demoGoalContributions.filter((contribution) => contribution.goal_id !== goalId)
    return { error: null }
  }

  const { error } = await supabase.from("goals").delete().eq("id", goalId)
  return { error }
}

export const logGoalContribution = async (userId, goal, amount) => {
  const contributionAmount = Number(amount)
  if (!goal || !goal.id) {
    return { data: null, error: { message: "Goal not found" } }
  }

  if (!contributionAmount || contributionAmount <= 0) {
    return { data: null, error: { message: "Invalid contribution amount" } }
  }

  const timestamp = new Date().toISOString()

  if (goal.id.startsWith("demo-goal-")) {
    const contribution = {
      id: `demo-goal-contribution-${Date.now()}`,
      goal_id: goal.id,
      user_id: userId,
      amount: contributionAmount,
      contributed_at: timestamp,
      created_at: timestamp,
    }

    demoGoalContributions = [contribution, ...demoGoalContributions]

    const goalIndex = demoGoals.findIndex((item) => item.id === goal.id)
    if (goalIndex === -1) {
      return { data: null, error: { message: "Goal not found" } }
    }

    const newAmount = Number(demoGoals[goalIndex].current_amount || 0) + contributionAmount
    const { updatedMilestones, achievedMilestones } = evaluateMilestones(
      demoGoals[goalIndex].milestones || [],
      newAmount,
      timestamp,
    )

    demoGoals[goalIndex] = {
      ...demoGoals[goalIndex],
      current_amount: newAmount,
      milestones: updatedMilestones,
      updated_at: timestamp,
    }

    return {
      data: {
        goal: transformGoalRecord({
          ...demoGoals[goalIndex],
          goal_contributions: getDemoGoalContributions(goal.id),
        }),
        contribution: transformContributionRecord(contribution),
        celebratedMilestones: achievedMilestones,
      },
      error: null,
    }
  }

  const { data: contributionData, error: contributionError } = await supabase
    .from("goal_contributions")
    .insert([
      {
        goal_id: goal.id,
        user_id: userId,
        amount: contributionAmount,
        contributed_at: timestamp,
        created_at: timestamp,
      },
    ])
    .select()
    .single()

  if (contributionError) {
    return { data: null, error: contributionError }
  }

  const { updatedMilestones, achievedMilestones } = evaluateMilestones(
    goal.milestones || [],
    Number(goal.currentAmount || 0) + contributionAmount,
    timestamp,
  )

  const { data: updatedGoalData, error: updateError } = await supabase
    .from("goals")
    .update({
      current_amount: Number(goal.currentAmount || 0) + contributionAmount,
      milestones: updatedMilestones,
      updated_at: timestamp,
    })
    .eq("id", goal.id)
    .select(`
      *,
      goal_contributions (*)
    `)
    .single()

  if (updateError) {
    return { data: null, error: updateError }
  }

  return {
    data: {
      goal: transformGoalRecord(updatedGoalData),
      contribution: transformContributionRecord(contributionData),
      celebratedMilestones: achievedMilestones,
    },
    error: null,
  }
}
