export async function simulateAIResponse(metrics) {
  // Simulate processing time to mimic remote call latency
  await new Promise((resolve) => setTimeout(resolve, 600))

  const healthScore = calculateHealthScore(metrics)
  const spendingTrend = metrics.last7Days > metrics.previous7Days ? "increasing" : "decreasing"
  const topCategory = metrics.topExpenseCategory?.[0] || "Uncategorized"
  const topCategoryAmount = metrics.topExpenseCategory?.[1] || 0
  const topCategoryPercentage = metrics.totalExpenses > 0 ? (topCategoryAmount / metrics.totalExpenses) * 100 : 0

  return {
    healthScore,
    summary: generateSummary(metrics, healthScore),
    strengths: generateStrengths(metrics),
    improvements: generateImprovements(metrics),
    spendingAnalysis: generateSpendingAnalysis(metrics, spendingTrend, topCategory, topCategoryPercentage),
    savingsTips: generateSavingsTips(metrics),
    budgetSuggestions: generateBudgetSuggestions(metrics),
    goals: generateGoals(metrics),
  }
}

function calculateHealthScore(metrics) {
  let score = 5

  if (metrics.savingsRate > 20) score += 2
  else if (metrics.savingsRate > 10) score += 1
  else if (metrics.savingsRate < 0) score -= 2

  if (metrics.balance > 0) {
    score += 1
  } else {
    score -= 1
  }

  if (metrics.transactionCount > 10) {
    score += 1
  }

  const topCategoryPercentage = metrics.topExpenseCategory
    ? (metrics.topExpenseCategory[1] / metrics.totalExpenses) * 100
    : 0
  if (topCategoryPercentage > 50) {
    score -= 1
  }

  return Math.max(1, Math.min(10, score))
}

function generateSummary(metrics, healthScore) {
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

function generateStrengths(metrics) {
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

function generateImprovements(metrics) {
  const improvements = []

  if (metrics.savingsRate < 10) {
    improvements.push({
      area: "Increase Savings Rate",
      suggestion: `Aim to save at least 15-20% of income. Currently at ${metrics.savingsRate.toFixed(1)}%`,
      action: "Set up automatic transfers to savings account",
    })
  }

  if (metrics.balance < 0) {
    improvements.push({
      area: "Address Negative Balance",
      suggestion: "You're spending more than you earn - immediate action needed",
      action: "Review and cut non-essential expenses immediately",
    })
  }

  const topCategoryPercentage = metrics.topExpenseCategory
    ? (metrics.topExpenseCategory[1] / metrics.totalExpenses) * 100
    : 0
  if (topCategoryPercentage > 40) {
    improvements.push({
      area: "Diversify Spending",
      suggestion: `${metrics.topExpenseCategory[0]} represents ${topCategoryPercentage.toFixed(1)}% of expenses`,
      action: "Look for ways to reduce this dominant expense category",
    })
  }

  if (metrics.transactionCount < 10) {
    improvements.push({
      area: "Improve Expense Tracking",
      suggestion: "More consistent transaction recording will provide better insights",
      action: "Set daily reminders to log expenses",
    })
  }

  return improvements
}

function generateSpendingAnalysis(metrics, trend, topCategory, percentage) {
  return {
    trend: trend === "increasing" ? "📈 Spending increased in the last week" : "📉 Spending decreased in the last week",
    topCategory: `🏆 Highest expense category: ${topCategory} (${percentage.toFixed(1)}% of total)`,
    avgTransaction: `💳 Average transaction: $${metrics.avgTransactionAmount.toFixed(2)}`,
    frequency: `📊 Transaction frequency: ${metrics.transactionCount} transactions recorded`,
  }
}

function generateSavingsTips(metrics) {
  const tips = []

  if (metrics.savingsRate < 10) {
    tips.push("Automate a 10% transfer from each paycheck to savings")
  }

  if (metrics.topExpenseCategory?.[0]) {
    tips.push(`Set a mini-challenge to cut ${metrics.topExpenseCategory[0]} spending by 10% next month`)
  }

  if (metrics.avgTransactionAmount > 50) {
    tips.push("Review subscriptions and recurring charges for quick wins")
  }

  tips.push("Allocate unexpected income (refunds, bonuses) directly toward goals")
  tips.push("Do a weekly 10-minute expense review to stay proactive")

  return tips
}

function generateBudgetSuggestions(metrics) {
  const suggestions = []

  const totalIncome = metrics.totalIncome || 1
  const needs = Math.min(metrics.totalExpenses, totalIncome * 0.5)
  const wants = Math.max(0, metrics.totalExpenses - needs)
  const savings = Math.max(0, totalIncome - metrics.totalExpenses)

  suggestions.push({
    rule: "50 / 30 / 20 Check-in",
    needs: `Needs · $${needs.toFixed(2)} (${((needs / totalIncome) * 100).toFixed(1)}%)`,
    wants: `Wants · $${wants.toFixed(2)} (${((wants / totalIncome) * 100).toFixed(1)}%)`,
    savings: `Savings · $${savings.toFixed(2)} (${((savings / totalIncome) * 100).toFixed(1)}%)`,
  })

  if (metrics.topExpenseCategory) {
    suggestions.push({
      category: metrics.topExpenseCategory[0],
      current: `$${metrics.topExpenseCategory[1].toFixed(2)} spent`,
      suggestion: "Challenge yourself to reduce this category by 5% next cycle",
    })
  }

  return suggestions
}

function generateGoals(metrics) {
  const goals = {
    shortTerm: [],
    longTerm: [],
  }

  if (metrics.balance > 0) {
    goals.shortTerm.push("Direct extra cash flow toward your top savings goal this month")
  } else {
    goals.shortTerm.push("Pause discretionary spending for one week to rebuild balance")
  }

  if (metrics.savingsRate < 15) {
    goals.longTerm.push("Build a 3-month emergency fund by saving a little every paycheck")
  } else {
    goals.longTerm.push("Accelerate long-term investing with automated monthly transfers")
  }

  goals.longTerm.push("Review and refresh your goals quarterly to stay motivated")

  return goals
}
