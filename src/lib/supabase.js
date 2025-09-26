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
    plan: "paid",
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
      cycle_type: budgetData.cycleType ?? "monthly",
      cycle_settings: budgetData.cycleSettings ?? {},
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
        cycle_type: budgetData.cycleType ?? "monthly",
        cycle_settings: budgetData.cycleSettings ?? {},
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
      const updatedBudget = {
        ...demoBudgets[budgetIndex],
        name: budgetData.name,
        category_budgets: budgetData.categoryBudgets || [],
      }
      if (Object.prototype.hasOwnProperty.call(budgetData, "cycleType")) {
        updatedBudget.cycle_type = budgetData.cycleType ?? "monthly"
      }
      if (Object.prototype.hasOwnProperty.call(budgetData, "cycleSettings")) {
        updatedBudget.cycle_settings = budgetData.cycleSettings ?? {}
      }
      demoBudgets[budgetIndex] = updatedBudget
      return { data: [demoBudgets[budgetIndex]], error: null }
    }
    return { data: null, error: { message: "Budget not found" } }
  }

  const payload = {
    name: budgetData.name,
    category_budgets: budgetData.categoryBudgets || [],
  }

  if (Object.prototype.hasOwnProperty.call(budgetData, "cycleType")) {
    payload.cycle_type = budgetData.cycleType ?? "monthly"
  }

  if (Object.prototype.hasOwnProperty.call(budgetData, "cycleSettings")) {
    payload.cycle_settings = budgetData.cycleSettings ?? {}
  }

  const { data, error } = await supabase
    .from("budgets")
    .update(payload)
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
