const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const USE_MOCK = !SUPABASE_URL || !SUPABASE_ANON_KEY

let _module

if (USE_MOCK) {
  console.warn(
    "Supabase environment variables are missing. Running in demo mode with local storage.",
  )
  _module = await import("./supabase-mock.js")
} else {
  _module = await import("./supabase-real.js")
}

export const supabase = _module.supabase
export const signUp = _module.signUp
export const signIn = _module.signIn
export const signInWithGoogle = _module.signInWithGoogle
export const signOut = _module.signOut
export const getCurrentUser = _module.getCurrentUser
export const createUserProfile = _module.createUserProfile
export const getUserProfile = _module.getUserProfile
export const updateUserProfile = _module.updateUserProfile
export const getBudgets = _module.getBudgets
export const createBudget = _module.createBudget
export const updateBudget = _module.updateBudget
export const deleteBudget = _module.deleteBudget
export const createTransaction = _module.createTransaction
export const updateTransaction = _module.updateTransaction
export const deleteTransaction = _module.deleteTransaction
export const getCashBurn = _module.getCashBurn
export const getUserCategories = _module.getUserCategories
export const updateUserCategories = _module.updateUserCategories
export const getGoals = _module.getGoals
export const createGoal = _module.createGoal
export const updateGoal = _module.updateGoal
export const deleteGoal = _module.deleteGoal
export const addGoalContribution = _module.addGoalContribution
export const getGoalContributions = _module.getGoalContributions
export const getAIInsights = _module.getAIInsights
export const getLatestAIInsight = _module.getLatestAIInsight
export const generateAIInsight = _module.generateAIInsight
export const persistLoginTimestamp = _module.persistLoginTimestamp
export const clearLoginTimestamp = _module.clearLoginTimestamp
export const getStoredLoginTimestamp = _module.getStoredLoginTimestamp
export const shouldRefreshSession = _module.shouldRefreshSession
