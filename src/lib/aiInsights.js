import { getCachedAIInsights, storeAIInsightsResult, updateDismissedInsightIds } from "./supabase"

const getCycleId = (date = new Date()) => {
  const cycleDate = new Date(date)
  const year = cycleDate.getUTCFullYear()
  const month = String(cycleDate.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

const createStableId = (prefix, value) => {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return `${prefix}:${normalized}`
}

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

  return strengths
}

const generateImprovements = (metrics) => {
  const improvements = []

  if (metrics.savingsRate < 10) {
    const area = "Increase Savings Rate"
    improvements.push({
      id: createStableId("improvement", area),
      area,
      suggestion: `Aim to save at least 15-20% of income. Currently at ${metrics.savingsRate.toFixed(1)}%`,
      action: "Set up automatic transfers to savings account",
    })
  }

  if (metrics.balance < 0) {
    const area = "Address Negative Balance"
    improvements.push({
      id: createStableId("improvement", area),
      area,
      suggestion: "You're spending more than you earn - immediate action needed",
      action: "Review and cut non-essential expenses immediately",
    })
  }

  const topCategoryPercentage = metrics.topExpenseCategory
    ? (metrics.topExpenseCategory[1] / metrics.totalExpenses) * 100
    : 0
  if (topCategoryPercentage > 40) {
    const area = "Diversify Spending"
    improvements.push({
      id: createStableId("improvement", `${area}-${metrics.topExpenseCategory[0]}`),
      area,
      suggestion: `${metrics.topExpenseCategory[0]} represents ${topCategoryPercentage.toFixed(1)}% of expenses`,
      action: "Look for ways to reduce this dominant expense category",
    })
  }

  if (metrics.transactionCount < 10) {
    const area = "Improve Expense Tracking"
    improvements.push({
      id: createStableId("improvement", area),
      area,
      suggestion: "More consistent transaction recording will provide better insights",
      action: "Set daily reminders to log expenses",
    })
  }

  return improvements
}

const generateSpendingAnalysis = (metrics) => {
  const spendingTrend = metrics.last7Days > metrics.previous7Days ? "increasing" : "decreasing"
  const topCategory = metrics.topExpenseCategory?.[0] || "Unknown"
  const topCategoryAmount = metrics.topExpenseCategory?.[1] || 0
  const topCategoryPercentage = metrics.totalExpenses > 0 ? (topCategoryAmount / metrics.totalExpenses) * 100 : 0

  return {
    trend:
      spendingTrend === "increasing"
        ? "📈 Spending increased in the last week"
        : "📉 Spending decreased in the last week",
    topCategory: `🏆 Highest expense category: ${topCategory} (${topCategoryPercentage.toFixed(1)}% of total)`,
    avgTransaction: `💳 Average transaction: $${metrics.avgTransactionAmount.toFixed(2)}`,
    frequency: `📊 Transaction frequency: ${metrics.transactionCount} transactions recorded`,
  }
}

const generateSavingsTips = (metrics) => {
  const tips = []

  if (metrics.expensesByCategory["Groceries"] > metrics.totalExpenses * 0.15) {
    tips.push({
      id: createStableId("tip", "groceries"),
      text: "🛒 Meal planning could reduce grocery costs by 15-20%",
    })
  }

  if (metrics.expensesByCategory["Entertainment"] > metrics.totalExpenses * 0.1) {
    tips.push({
      id: createStableId("tip", "entertainment"),
      text: "🎮 Consider free entertainment alternatives to reduce costs",
    })
  }

  if (metrics.expensesByCategory["Transportation"] > metrics.totalExpenses * 0.15) {
    tips.push({
      id: createStableId("tip", "transportation"),
      text: "🚗 Explore carpooling or public transit options",
    })
  }

  tips.push({ id: createStableId("tip", "24-hour-rule"), text: "💡 Try the 24-hour rule: wait a day before non-essential purchases" })
  tips.push({ id: createStableId("tip", "automate-savings"), text: "🏦 Automate savings to make it effortless" })

  return tips
}

const generateBudgetSuggestions = (metrics) => {
  const suggestions = []

  const needs = metrics.totalExpenses * 0.5
  const wants = metrics.totalExpenses * 0.3
  const savings = metrics.totalIncome * 0.2

  suggestions.push({
    rule: "50/30/20 Budget Rule",
    needs: `Needs (50%): $${needs.toFixed(2)}`,
    wants: `Wants (30%): $${wants.toFixed(2)}`,
    savings: `Savings (20%): $${savings.toFixed(2)}`,
  })

  Object.entries(metrics.expensesByCategory).forEach(([category, amount]) => {
    const percentage = metrics.totalExpenses > 0 ? (amount / metrics.totalExpenses) * 100 : 0
    if (percentage > 30) {
      suggestions.push({
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

  return { shortTerm, longTerm }
}

const callAIProvider = async (metrics) => {
  await new Promise((resolve) => setTimeout(resolve, 2000))

  const healthScore = calculateHealthScore(metrics)

  return {
    healthScore,
    summary: generateSummary(metrics, healthScore),
    strengths: generateStrengths(metrics),
    improvements: generateImprovements(metrics),
    spendingAnalysis: generateSpendingAnalysis(metrics),
    savingsTips: generateSavingsTips(metrics),
    budgetSuggestions: generateBudgetSuggestions(metrics),
    goals: generateGoals(metrics),
  }
}

export const fetchAIInsights = async ({ userId, budgetId, metrics, forceRefresh = false }) => {
  if (!userId || !budgetId) {
    throw new Error("Missing user or budget information for AI insights fetch")
  }

  const cycleId = getCycleId()
  const { data: cached, error } = await getCachedAIInsights(userId, budgetId, cycleId)

  if (error) {
    console.error("Failed to load cached AI insights", error)
  }

  const dismissedIds = cached?.dismissed_ids || []

  if (!forceRefresh && cached?.insights) {
    return {
      insights: cached.insights,
      dismissedIds,
      generatedAt: cached.generated_at,
      fromCache: true,
      cycleId,
    }
  }

  const generatedAt = new Date().toISOString()
  const insights = await callAIProvider(metrics)

  await storeAIInsightsResult({
    userId,
    budgetId,
    cycleId,
    insights,
    dismissedIds,
    generatedAt,
  })

  return {
    insights,
    dismissedIds,
    generatedAt,
    fromCache: false,
    cycleId,
  }
}

export const persistDismissedInsights = async ({ userId, budgetId, cycleId, dismissedIds }) => {
  if (!userId || !budgetId || !cycleId) {
    return
  }

  await updateDismissedInsightIds({ userId, budgetId, cycleId, dismissedIds })
}

export { getCycleId }
