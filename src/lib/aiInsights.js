import { getUserProfile, getAIDismissedItems, saveAIDismissal, removeAIDismissal } from "./supabase"

const CACHE_STORAGE_KEY = "ai-insights-cache"
const CACHE_TTL_MS = 1000 * 60 * 60 // 1 hour cache window per metrics set
const MAX_CACHE_ENTRIES = 10

const memoryCache = new Map()
let storageCache = null

const slugify = (value) =>
  value
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

const getCycleId = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`

const loadStorageCache = () => {
  if (storageCache) return storageCache
  if (typeof window === "undefined") {
    storageCache = {}
    return storageCache
  }

  try {
    const raw = window.localStorage.getItem(CACHE_STORAGE_KEY)
    storageCache = raw ? JSON.parse(raw) : {}
  } catch (error) {
    console.warn("Failed to parse AI insights cache, resetting", error)
    storageCache = {}
  }

  return storageCache
}

const persistStorageCache = () => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(storageCache))
  } catch (error) {
    console.warn("Failed to persist AI insights cache", error)
  }
}

const pruneCache = () => {
  const cacheEntries = Object.entries(storageCache || {})
  if (cacheEntries.length <= MAX_CACHE_ENTRIES) {
    return
  }

  cacheEntries.sort(([, a], [, b]) => a.generatedAt - b.generatedAt)
  const trimmed = cacheEntries.slice(cacheEntries.length - MAX_CACHE_ENTRIES)
  storageCache = Object.fromEntries(trimmed)
  persistStorageCache()
}

const cacheKeyFor = (userId, cycleId) => `${userId}:${cycleId}`

const getCachedRecord = (userId, cycleId) => {
  const key = cacheKeyFor(userId, cycleId)
  if (memoryCache.has(key)) {
    return memoryCache.get(key)
  }

  const cache = loadStorageCache()
  const record = cache[key]
  if (record) {
    memoryCache.set(key, record)
  }
  return record
}

const setCachedRecord = (userId, cycleId, record) => {
  const key = cacheKeyFor(userId, cycleId)
  memoryCache.set(key, record)

  loadStorageCache()
  storageCache[key] = record
  pruneCache()
  persistStorageCache()
}

const canonicalizeMetrics = (metrics) => {
  const { expensesByCategory, ...rest } = metrics
  const sortedExpenses = Object.entries(expensesByCategory || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, amount]) => ({ category, amount: Number(amount.toFixed(2)) }))

  const sanitized = {
    ...rest,
    totalIncome: Number(rest.totalIncome.toFixed(2)),
    totalExpenses: Number(rest.totalExpenses.toFixed(2)),
    balance: Number(rest.balance.toFixed(2)),
    savingsRate: Number(rest.savingsRate.toFixed(2)),
    avgTransactionAmount: Number(rest.avgTransactionAmount.toFixed(2)),
    expensesByCategory: sortedExpenses,
  }

  if (rest.topExpenseCategory) {
    sanitized.topExpenseCategory = {
      category: rest.topExpenseCategory[0],
      amount: Number(rest.topExpenseCategory[1].toFixed(2)),
    }
  }

  return sanitized
}

const metricsSignature = (metrics) => JSON.stringify(canonicalizeMetrics(metrics))

const calculateHealthScore = (metrics) => {
  let score = 5

  if (metrics.savingsRate > 20) score += 2
  else if (metrics.savingsRate > 10) score += 1
  else if (metrics.savingsRate < 0) score -= 2

  if (metrics.balance > 0) score += 1
  else score -= 1

  if (metrics.transactionCount > 10) score += 1

  const topCategoryPercentage = metrics.topExpenseCategory
    ? (metrics.topExpenseCategory[1] / metrics.totalExpenses) * 100
    : 0
  if (topCategoryPercentage > 50) score -= 1

  return Math.max(1, Math.min(10, score))
}

const generateSummary = (metrics, healthScore) => {
  if (healthScore >= 8) {
    return "Excellent financial health! You're demonstrating strong budgeting discipline with healthy savings and balanced spending."
  }
  if (healthScore >= 6) {
    return "Good financial foundation with room for optimization. A few adjustments could significantly improve your financial position."
  }
  if (healthScore >= 4) {
    return "Your finances need attention. Focus on increasing income, reducing expenses, or both to improve your financial stability."
  }
  return "Critical financial situation requiring immediate action. Consider seeking financial counseling and implementing strict budgeting measures."
}

const generateStrengths = (metrics) => {
  const strengths = []

  if (metrics.savingsRate > 15) {
    strengths.push("Strong savings discipline - you're saving above the recommended 15% rate")
  }

  if (metrics.transactionCount > 15) {
    strengths.push("Excellent expense tracking - you're consistently recording transactions")
  }

  if (metrics.balance > 0) {
    strengths.push("Positive cash flow - you're living within your means")
  }

  const categoryCount = Object.keys(metrics.expensesByCategory).length
  if (categoryCount >= 4) {
    strengths.push("Diversified spending across multiple categories shows balanced lifestyle")
  }

  if (strengths.length === 0) {
    strengths.push("You're taking the first step by tracking your finances - that's commendable!")
  }

  return strengths.map((text) => ({ id: `strength-${slugify(text)}`, text }))
}

const generateImprovements = (metrics) => {
  const improvements = []

  if (metrics.savingsRate < 10) {
    improvements.push({
      id: "improvement-increase-savings",
      area: "Increase Savings Rate",
      suggestion: `Aim to save at least 15-20% of income. Currently at ${metrics.savingsRate.toFixed(1)}%`,
      action: "Set up automatic transfers to savings account",
    })
  }

  if (metrics.balance < 0) {
    improvements.push({
      id: "improvement-negative-balance",
      area: "Address Negative Balance",
      suggestion: "You're spending more than you earn - immediate action needed",
      action: "Review and cut non-essential expenses immediately",
    })
  }

  const topCategoryPercentage = metrics.topExpenseCategory
    ? (metrics.topExpenseCategory[1] / metrics.totalExpenses) * 100
    : 0
  if (topCategoryPercentage > 40 && metrics.topExpenseCategory) {
    improvements.push({
      id: `improvement-${slugify(metrics.topExpenseCategory[0])}`,
      area: "Diversify Spending",
      suggestion: `${metrics.topExpenseCategory[0]} represents ${topCategoryPercentage.toFixed(1)}% of expenses`,
      action: "Look for ways to reduce this dominant expense category",
    })
  }

  if (metrics.transactionCount < 10) {
    improvements.push({
      id: "improvement-tracking",
      area: "Improve Expense Tracking",
      suggestion: "More consistent transaction recording will provide better insights",
      action: "Set daily reminders to log expenses",
    })
  }

  return improvements
}

const generateSpendingAnalysis = (metrics, trend, topCategory, percentage) => {
  return [
    {
      id: "spending-trend",
      text: trend === "increasing" ? "📈 Spending increased in the last week" : "📉 Spending decreased in the last week",
    },
    {
      id: "spending-top-category",
      text: `🏆 Highest expense category: ${topCategory} (${percentage.toFixed(1)}% of total)`,
    },
    {
      id: "spending-average-transaction",
      text: `💳 Average transaction: $${metrics.avgTransactionAmount.toFixed(2)}`,
    },
    {
      id: "spending-frequency",
      text: `📊 Transaction frequency: ${metrics.transactionCount} transactions recorded`,
    },
  ]
}

const generateSavingsTips = (metrics) => {
  const tips = []

  if (metrics.expensesByCategory["Groceries"] > metrics.totalExpenses * 0.15) {
    tips.push("🛒 Meal planning could reduce grocery costs by 15-20%")
  }

  if (metrics.expensesByCategory["Entertainment"] > metrics.totalExpenses * 0.1) {
    tips.push("🎮 Consider free entertainment alternatives to reduce costs")
  }

  if (metrics.expensesByCategory["Transportation"] > metrics.totalExpenses * 0.15) {
    tips.push("🚗 Explore carpooling or public transit options")
  }

  tips.push("💡 Try the 24-hour rule: wait a day before non-essential purchases")
  tips.push("🏦 Automate savings to make it effortless")

  return tips.map((text) => ({ id: `tip-${slugify(text)}`, text }))
}

const generateBudgetSuggestions = (metrics) => {
  const suggestions = []

  const needs = metrics.totalExpenses * 0.5
  const wants = metrics.totalExpenses * 0.3
  const savings = metrics.totalIncome * 0.2

  suggestions.push({
    id: "budget-rule-50-30-20",
    rule: "50/30/20 Budget Rule",
    needs: `Needs (50%): $${needs.toFixed(2)}`,
    wants: `Wants (30%): $${wants.toFixed(2)}`,
    savings: `Savings (20%): $${savings.toFixed(2)}`,
  })

  Object.entries(metrics.expensesByCategory).forEach(([category, amount]) => {
    const percentage = metrics.totalExpenses > 0 ? (amount / metrics.totalExpenses) * 100 : 0
    if (percentage > 30) {
      suggestions.push({
        id: `budget-${slugify(category)}`,
        category,
        current: `${percentage.toFixed(1)}%`,
        suggestion: "Consider reducing this category to below 25% of total expenses",
      })
    }
  })

  return suggestions
}

const generateGoals = (metrics) => {
  const shortTerm = []
  const longTerm = []

  if (metrics.savingsRate < 15) {
    shortTerm.push("Increase savings rate to 15% within 2 months")
  }

  if (metrics.balance < metrics.totalIncome * 0.25) {
    shortTerm.push("Build emergency fund equal to 1 month of expenses")
  }

  shortTerm.push("Track all expenses for 30 consecutive days")

  longTerm.push("Build emergency fund covering 3-6 months of expenses")
  longTerm.push("Achieve 20% savings rate consistently")
  longTerm.push("Diversify income sources")

  if (metrics.totalIncome > 0) {
    const emergencyFund = metrics.totalExpenses * 6
    longTerm.push(`Save $${emergencyFund.toFixed(2)} for full emergency fund`)
  }

  return {
    shortTerm: shortTerm.map((text) => ({ id: `goal-short-${slugify(text)}`, text })),
    longTerm: longTerm.map((text) => ({ id: `goal-long-${slugify(text)}`, text })),
  }
}

const buildInsights = (metrics) => {
  const healthScore = calculateHealthScore(metrics)
  const spendingTrend = metrics.last7Days > metrics.previous7Days ? "increasing" : "decreasing"
  const topCategory = metrics.topExpenseCategory?.[0] || "Unknown"
  const topCategoryAmount = metrics.topExpenseCategory?.[1] || 0
  const topCategoryPercentage = metrics.totalExpenses > 0 ? (topCategoryAmount / metrics.totalExpenses) * 100 : 0

  return {
    healthScore,
    summary: { id: "summary", text: generateSummary(metrics, healthScore) },
    strengths: generateStrengths(metrics),
    improvements: generateImprovements(metrics),
    spendingAnalysis: generateSpendingAnalysis(metrics, spendingTrend, topCategory, topCategoryPercentage),
    savingsTips: generateSavingsTips(metrics),
    budgetSuggestions: generateBudgetSuggestions(metrics),
    goals: generateGoals(metrics),
    totals: {
      totalIncome: metrics.totalIncome,
      totalExpenses: metrics.totalExpenses,
      balance: metrics.balance,
    },
  }
}

export const getAIInsights = async ({ userId, metrics, forceRefresh = false }) => {
  if (!userId) {
    throw new Error("User ID is required to fetch AI insights")
  }

  const cycleId = getCycleId()
  const signature = metricsSignature(metrics)
  const cached = getCachedRecord(userId, cycleId)
  const now = Date.now()

  const { data: profile, error: profileError } = await getUserProfile(userId)
  const plan = profile?.plan_tier || "free"

  if (profileError && profileError.code !== "PGRST116") {
    console.warn("Failed to load user profile for AI insights", profileError)
  }

  if (!forceRefresh && cached && cached.signature === signature && now - cached.generatedAt < CACHE_TTL_MS) {
    return {
      plan,
      insights: cached.payload,
      generatedAt: cached.generatedAt,
      cached: true,
      cycleId,
    }
  }

  const insights = buildInsights(metrics)
  const generatedAt = Date.now()

  console.info(`[AI] Generated financial insights for user ${userId} at ${new Date(generatedAt).toISOString()}`)

  setCachedRecord(userId, cycleId, {
    signature,
    generatedAt,
    payload: insights,
  })

  return {
    plan,
    insights,
    generatedAt,
    cached: false,
    cycleId,
  }
}

export const getDismissedInsightIds = async (userId, cycleId) => {
  const { data, error } = await getAIDismissedItems(userId, cycleId)
  if (error && error.code !== "PGRST116") {
    console.error("Failed to load dismissed AI insight ids", error)
    throw error
  }
  return data || []
}

export const dismissInsightForCycle = async (userId, cycleId, itemId) => {
  const { error } = await saveAIDismissal(userId, cycleId, itemId)
  if (error) {
    console.error("Failed to dismiss AI insight", error)
    throw error
  }
}

export const restoreInsightForCycle = async (userId, cycleId, itemId) => {
  const { error } = await removeAIDismissal(userId, cycleId, itemId)
  if (error) {
    console.error("Failed to restore AI insight", error)
    throw error
  }
}

export { getCycleId }
