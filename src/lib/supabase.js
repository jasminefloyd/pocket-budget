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
  },
})

// Auth helper functions
export const signUp = async (email, password) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  })
  return { data, error }
}

export const signIn = async (email, password) => {
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
  const { error } = await supabase.auth.signOut()
  return { error }
}

export const getCurrentUser = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  return { user, error }
}

// Database helper functions
export const createUserProfile = async (userId, email, fullName) => {
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
  const { data, error } = await supabase.from("user_profiles").select("*").eq("id", userId).single()
  return { data, error }
}

export const getBudgets = async (userId) => {
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
  const { error } = await supabase.from("budgets").delete().eq("id", budgetId)
  return { error }
}

export const createTransaction = async (budgetId, transactionData) => {
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
  const { error } = await supabase.from("transactions").delete().eq("id", transactionId)
  return { error }
}

export const getUserCategories = async (userId) => {
  const { data, error } = await supabase.from("user_categories").select("*").eq("user_id", userId).single()
  return { data, error }
}

export const updateUserCategories = async (userId, categories) => {
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
