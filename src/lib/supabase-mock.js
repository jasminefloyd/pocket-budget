// Mock Supabase implementation using localStorage
let currentUser = null
const authListeners = []

// Simulate network delay
const delay = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms))

// Mock user data
const mockUsers = JSON.parse(localStorage.getItem("mockUsers") || "{}")

// Save mock users to localStorage
const saveMockUsers = () => {
  localStorage.setItem("mockUsers", JSON.stringify(mockUsers))
}

// Generate mock UUID
const generateId = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c == "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Mock Supabase client
export const supabase = {
  auth: {
    signUp: async ({ email, password }) => {
      await delay()

      if (mockUsers[email]) {
        return {
          data: null,
          error: { message: "User already registered" },
        }
      }

      const user = {
        id: generateId(),
        email,
        user_metadata: { full_name: email.split("@")[0] },
        created_at: new Date().toISOString(),
      }

      mockUsers[email] = { ...user, password }
      saveMockUsers()

      return {
        data: { user },
        error: null,
      }
    },

    signInWithPassword: async ({ email, password }) => {
      await delay()

      const mockUser = mockUsers[email]
      if (!mockUser || mockUser.password !== password) {
        return {
          data: null,
          error: { message: "Invalid login credentials" },
        }
      }

      const user = {
        id: mockUser.id,
        email: mockUser.email,
        user_metadata: mockUser.user_metadata,
      }

      currentUser = user
      localStorage.setItem("currentUser", JSON.stringify(user))

      // Notify listeners
      authListeners.forEach((callback) => {
        callback("SIGNED_IN", { user })
      })

      return {
        data: { user },
        error: null,
      }
    },

    signInWithOAuth: async ({ provider }) => {
      await delay()

      if (provider === "google") {
        // Simulate Google OAuth
        const user = {
          id: generateId(),
          email: "demo@google.com",
          user_metadata: { full_name: "Demo User" },
        }

        currentUser = user
        localStorage.setItem("currentUser", JSON.stringify(user))

        // Notify listeners
        authListeners.forEach((callback) => {
          callback("SIGNED_IN", { user })
        })

        return { data: { user }, error: null }
      }

      return { data: null, error: { message: "Provider not supported" } }
    },

    signOut: async () => {
      await delay()

      currentUser = null
      localStorage.removeItem("currentUser")

      // Notify listeners
      authListeners.forEach((callback) => {
        callback("SIGNED_OUT", { user: null })
      })

      return { error: null }
    },

    getUser: async () => {
      await delay(100)

      const storedUser = localStorage.getItem("currentUser")
      if (storedUser) {
        currentUser = JSON.parse(storedUser)
        return { data: { user: currentUser }, error: null }
      }

      return { data: { user: null }, error: null }
    },

    onAuthStateChange: (callback) => {
      authListeners.push(callback)

      // Return subscription object
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              const index = authListeners.indexOf(callback)
              if (index > -1) {
                authListeners.splice(index, 1)
              }
            },
          },
        },
      }
    },
  },

  from: (table) => ({
    select: (columns = "*") => ({
      eq: (column, value) => ({
        single: async () => {
          await delay()
          const data = JSON.parse(localStorage.getItem(`${table}_${currentUser?.id}`) || "null")
          return { data, error: data ? null : { code: "PGRST116" } }
        },
        order: (column, options) => ({
          async then(resolve) {
            await delay()
            const allData = JSON.parse(localStorage.getItem(`${table}_${currentUser?.id}`) || "[]")
            const result = { data: allData, error: null }
            resolve(result)
            return result
          },
        }),
      }),
      order: (column, options) => ({
        async then(resolve) {
          await delay()
          const allData = JSON.parse(localStorage.getItem(`${table}_${currentUser?.id}`) || "[]")
          const result = { data: allData, error: null }
          resolve(result)
          return result
        },
      }),
    }),

    insert: (data) => ({
      select: () => ({
        async then(resolve) {
          await delay()

          const newItem = Array.isArray(data) ? data[0] : data
          newItem.id = generateId()
          newItem.created_at = new Date().toISOString()

          if (table === "budgets") {
            const existingBudgets = JSON.parse(localStorage.getItem(`budgets_${currentUser?.id}`) || "[]")
            existingBudgets.unshift(newItem)
            localStorage.setItem(`budgets_${currentUser?.id}`, JSON.stringify(existingBudgets))
          } else if (table === "transactions") {
            const existingTransactions = JSON.parse(localStorage.getItem(`transactions_${currentUser?.id}`) || "[]")
            existingTransactions.push(newItem)
            localStorage.setItem(`transactions_${currentUser?.id}`, JSON.stringify(existingTransactions))
          }

          const result = { data: [newItem], error: null }
          resolve(result)
          return result
        },
      }),
    }),

    update: (data) => ({
      eq: (column, value) => ({
        select: () => ({
          async then(resolve) {
            await delay()

            if (table === "budgets") {
              const existingBudgets = JSON.parse(localStorage.getItem(`budgets_${currentUser?.id}`) || "[]")
              const index = existingBudgets.findIndex((item) => item.id === value)
              if (index > -1) {
                existingBudgets[index] = { ...existingBudgets[index], ...data }
                localStorage.setItem(`budgets_${currentUser?.id}`, JSON.stringify(existingBudgets))
              }
            }

            const result = { data: [data], error: null }
            resolve(result)
            return result
          },
        }),
      }),
    }),

    delete: () => ({
      eq: (column, value) => ({
        async then(resolve) {
          await delay()

          if (table === "budgets") {
            const existingBudgets = JSON.parse(localStorage.getItem(`budgets_${currentUser?.id}`) || "[]")
            const filtered = existingBudgets.filter((item) => item.id !== value)
            localStorage.setItem(`budgets_${currentUser?.id}`, JSON.stringify(filtered))
          }

          const result = { error: null }
          resolve(result)
          return result
        },
      }),
    }),

    upsert: (data) => ({
      select: () => ({
        async then(resolve) {
          await delay()
          localStorage.setItem(`${table}_${currentUser?.id}`, JSON.stringify(data))
          const result = { data: [data], error: null }
          resolve(result)
          return result
        },
      }),
    }),
  }),
}

// Auth helper functions
export const signUp = async (email, password) => {
  return await supabase.auth.signUp({ email, password })
}

export const signIn = async (email, password) => {
  return await supabase.auth.signInWithPassword({ email, password })
}

export const signInWithGoogle = async () => {
  return await supabase.auth.signInWithOAuth({ provider: "google" })
}

export const signOut = async () => {
  return await supabase.auth.signOut()
}

export const getCurrentUser = async () => {
  return await supabase.auth.getUser()
}

// Database helper functions
export const createUserProfile = async (userId, email, fullName) => {
  await delay()
  const profile = {
    id: userId,
    email,
    full_name: fullName,
    created_at: new Date().toISOString(),
  }
  localStorage.setItem(`user_profiles_${userId}`, JSON.stringify(profile))
  return { data: [profile], error: null }
}

export const getUserProfile = async (userId) => {
  await delay()
  const profile = JSON.parse(localStorage.getItem(`user_profiles_${userId}`) || "null")
  return { data: profile, error: profile ? null : { code: "PGRST116" } }
}

export const getBudgets = async (userId) => {
  await delay()
  const budgets = JSON.parse(localStorage.getItem(`budgets_${userId}`) || "[]")
  const transactions = JSON.parse(localStorage.getItem(`transactions_${userId}`) || "[]")

  // Attach transactions to budgets
  const budgetsWithTransactions = budgets.map((budget) => ({
    ...budget,
    transactions: transactions.filter((tx) => tx.budget_id === budget.id),
  }))

  return { data: budgetsWithTransactions, error: null }
}

export const createBudget = async (userId, budgetData) => {
  await delay()
  const newBudget = {
    id: generateId(),
    user_id: userId,
    name: budgetData.name,
    category_budgets: budgetData.categoryBudgets || [],
    cycle_type: budgetData.cycleType ?? "monthly",
    cycle_settings: budgetData.cycleSettings ?? {},
    created_at: new Date().toISOString(),
    transactions: [],
  }

  const existingBudgets = JSON.parse(localStorage.getItem(`budgets_${userId}`) || "[]")
  existingBudgets.unshift(newBudget)
  localStorage.setItem(`budgets_${userId}`, JSON.stringify(existingBudgets))

  return { data: [newBudget], error: null }
}

export const updateBudget = async (budgetId, budgetData) => {
  await delay()
  const userId = currentUser?.id
  const existingBudgets = JSON.parse(localStorage.getItem(`budgets_${userId}`) || "[]")
  const index = existingBudgets.findIndex((budget) => budget.id === budgetId)

  if (index > -1) {
    const updated = {
      ...existingBudgets[index],
      name: budgetData.name,
      category_budgets: budgetData.categoryBudgets || existingBudgets[index].category_budgets || [],
    }

    if (Object.prototype.hasOwnProperty.call(budgetData, "cycleType")) {
      updated.cycle_type = budgetData.cycleType ?? "monthly"
    }

    if (Object.prototype.hasOwnProperty.call(budgetData, "cycleSettings")) {
      updated.cycle_settings = budgetData.cycleSettings ?? {}
    }

    existingBudgets[index] = updated
    localStorage.setItem(`budgets_${userId}`, JSON.stringify(existingBudgets))
    return { data: [existingBudgets[index]], error: null }
  }

  return { data: null, error: { message: "Budget not found" } }
}

export const deleteBudget = async (budgetId) => {
  await delay()
  const userId = currentUser?.id
  const existingBudgets = JSON.parse(localStorage.getItem(`budgets_${userId}`) || "[]")
  const filtered = existingBudgets.filter((budget) => budget.id !== budgetId)
  localStorage.setItem(`budgets_${userId}`, JSON.stringify(filtered))

  // Also delete associated transactions
  const existingTransactions = JSON.parse(localStorage.getItem(`transactions_${userId}`) || "[]")
  const filteredTransactions = existingTransactions.filter((tx) => tx.budget_id !== budgetId)
  localStorage.setItem(`transactions_${userId}`, JSON.stringify(filteredTransactions))

  return { error: null }
}

export const createTransaction = async (budgetId, transactionData) => {
  await delay()
  const userId = currentUser?.id
  const newTransaction = {
    ...transactionData,
    id: generateId(),
    budget_id: budgetId,
    created_at: new Date().toISOString(),
  }

  const existingTransactions = JSON.parse(localStorage.getItem(`transactions_${userId}`) || "[]")
  existingTransactions.push(newTransaction)
  localStorage.setItem(`transactions_${userId}`, JSON.stringify(existingTransactions))

  return { data: [newTransaction], error: null }
}

export const updateTransaction = async (transactionId, transactionData) => {
  await delay()
  const userId = currentUser?.id
  const existingTransactions = JSON.parse(localStorage.getItem(`transactions_${userId}`) || "[]")
  const index = existingTransactions.findIndex((tx) => tx.id === transactionId)

  if (index > -1) {
    existingTransactions[index] = { ...existingTransactions[index], ...transactionData }
    localStorage.setItem(`transactions_${userId}`, JSON.stringify(existingTransactions))
    return { data: [existingTransactions[index]], error: null }
  }

  return { data: null, error: { message: "Transaction not found" } }
}

export const deleteTransaction = async (transactionId) => {
  await delay()
  const userId = currentUser?.id
  const existingTransactions = JSON.parse(localStorage.getItem(`transactions_${userId}`) || "[]")
  const filtered = existingTransactions.filter((tx) => tx.id !== transactionId)
  localStorage.setItem(`transactions_${userId}`, JSON.stringify(filtered))

  return { error: null }
}

export const getUserCategories = async (userId) => {
  await delay()
  const categories = JSON.parse(localStorage.getItem(`user_categories_${userId}`) || "null")
  return { data: categories, error: categories ? null : { code: "PGRST116" } }
}

export const updateUserCategories = async (userId, categories) => {
  await delay()
  const categoryData = { user_id: userId, categories }
  localStorage.setItem(`user_categories_${userId}`, JSON.stringify(categoryData))
  return { data: [categoryData], error: null }
}
