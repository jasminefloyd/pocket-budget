// Mock Supabase implementation using localStorage
let currentUser = null
const authListeners = []

// Simulate network delay
const delay = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms))

// Mock user data
const mockUsers = typeof localStorage !== "undefined"
  ? JSON.parse(localStorage.getItem("mockUsers") || "{}")
  : {}

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

    getSession: async () => {
      await delay(100)
      const storedUser = localStorage.getItem("currentUser")
      if (storedUser) {
        currentUser = JSON.parse(storedUser)
        return { data: { session: { user: currentUser } }, error: null }
      }
      return { data: { session: null }, error: null }
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

  rpc: async () => {
    await delay()
    return { data: null, error: null }
  },

  functions: {
    invoke: async () => {
      await delay()
      return { data: null, error: { message: "Edge functions not available in demo mode" } }
    },
  },

  from: (table) => {
    // Helper to get stored data for the current user
    const getStored = (key) =>
      JSON.parse(localStorage.getItem(`${key || table}_${currentUser?.id}`) || "[]")
    const setStored = (key, value) =>
      localStorage.setItem(`${key || table}_${currentUser?.id}`, JSON.stringify(value))

    // Chainable query builder that supports the patterns used by supabase.js
    const buildChain = (data, opts = {}) => {
      const chain = {
        eq: (_col, _val) => buildChain(data, { ...opts, eqCol: _col, eqVal: _val }),
        order: (_col, _orderOpts) => buildChain(data, opts),
        limit: (_n) => buildChain(data, opts),
        range: (_from, _to) => buildChain(data, opts),
        single: async () => {
          await delay()
          let stored = null
          if (opts.eqCol === "id" || opts.eqCol === "user_id") {
            stored = JSON.parse(
              localStorage.getItem(`${table}_${opts.eqVal}`) || "null"
            )
          }
          if (!stored) {
            stored = JSON.parse(
              localStorage.getItem(`${table}_${currentUser?.id}`) || "null"
            )
          }
          return { data: stored, error: stored ? null : { code: "PGRST116" } }
        },
        select: (_cols) => buildChain(data, opts),
        then: async (resolve) => {
          await delay()
          let allData = getStored(null)

          // For budgets, attach transactions
          if (table === "budgets") {
            const txs = getStored("transactions")
            allData = allData.map((b) => ({
              ...b,
              transactions: (txs || []).filter((tx) => tx.budget_id === b.id),
            }))
          }

          // For goals, attach contributions
          if (table === "goals") {
            const contribs = getStored("goal_contributions")
            allData = allData.map((g) => ({
              ...g,
              goal_contributions: (contribs || []).filter((c) => c.goal_id === g.id),
            }))
          }

          const result = { data: allData, error: null }
          resolve(result)
          return result
        },
      }
      return chain
    }

    return {
      select: (_columns = "*") => buildChain(null),

      insert: (records) => ({
        select: (_cols) => ({
          then: async (resolve) => {
            await delay()
            const items = (Array.isArray(records) ? records : [records]).map((r) => ({
              ...r,
              id: r.id || generateId(),
              created_at: r.created_at || new Date().toISOString(),
            }))
            const existing = getStored(null)
            const merged = [...items, ...existing]
            setStored(null, merged)

            // For budgets, attach empty transactions
            const result = {
              data: items.map((item) => ({
                ...item,
                ...(table === "budgets" ? { transactions: [] } : {}),
                ...(table === "goals" ? { goal_contributions: [] } : {}),
              })),
              error: null,
            }
            resolve(result)
            return result
          },
        }),
      }),

      update: (updates) => ({
        eq: (_column, value) => ({
          select: (_cols) => ({
            single: async () => {
              await delay()
              const existing = getStored(null)
              const index = existing.findIndex((item) => item.id === value)
              if (index > -1) {
                existing[index] = { ...existing[index], ...updates }
                setStored(null, existing)
                return { data: existing[index], error: null }
              }
              return { data: null, error: { message: "Not found" } }
            },
            then: async (resolve) => {
              await delay()
              const existing = getStored(null)
              const index = existing.findIndex((item) => item.id === value)
              if (index > -1) {
                existing[index] = { ...existing[index], ...updates }
                setStored(null, existing)
              }
              const result = { data: [existing[index] || updates], error: null }
              resolve(result)
              return result
            },
          }),
        }),
      }),

      delete: () => ({
        eq: (_column, value) => ({
          then: async (resolve) => {
            await delay()
            const existing = getStored(null)
            const filtered = existing.filter((item) => item.id !== value)
            setStored(null, filtered)
            const result = { error: null }
            resolve(result)
            return result
          },
        }),
      }),

      upsert: (records) => ({
        select: (_cols) => ({
          then: async (resolve) => {
            await delay()
            const items = Array.isArray(records) ? records : [records]
            if (items.length === 1 && items[0].user_id) {
              // For user_categories-style upserts, store as single record
              localStorage.setItem(
                `${table}_${items[0].user_id}`,
                JSON.stringify(items[0])
              )
            } else {
              setStored(null, items)
            }
            const result = { data: items, error: null }
            resolve(result)
            return result
          },
        }),
      }),
    }
  },
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

export const updateUserProfile = async (userId, updates) => {
  await delay()
  const existing = JSON.parse(localStorage.getItem(`user_profiles_${userId}`) || "null")
  if (!existing) {
    return { data: null, error: { message: "Profile not found" } }
  }
  const merged = { ...existing, ...updates, updated_at: new Date().toISOString() }
  localStorage.setItem(`user_profiles_${userId}`, JSON.stringify(merged))
  return { data: merged, error: null }
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
    ...budgetData,
    id: generateId(),
    user_id: userId,
    created_at: new Date().toISOString(),
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
    existingBudgets[index] = { ...existingBudgets[index], ...budgetData }
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

export const getLatestAIInsight = async (userId) => {
  await delay()
  if (!userId) {
    return { data: null, error: null }
  }
  const insights = JSON.parse(localStorage.getItem(`ai_insights_${userId}`) || "[]")
  if (!Array.isArray(insights) || insights.length === 0) {
    return { data: null, error: null }
  }
  const sorted = [...insights].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return { data: sorted[0], error: null }
}
