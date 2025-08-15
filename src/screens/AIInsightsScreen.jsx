import { useState, useEffect } from "react"

export default function AIInsightsScreen({ budget, setViewMode }) {
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Calculate financial metrics
  const calculateMetrics = () => {
    const transactions = budget.transactions || []
    const totalIncome = transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0)

    const totalExpenses = transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0)

    const balance = totalIncome - totalExpenses
    const savingsRate = totalIncome > 0 ? (balance / totalIncome) * 100 : 0

    // Category breakdown
    const expensesByCategory = {}
    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount
      })

    const topExpenseCategory = Object.entries(expensesByCategory).sort(([, a], [, b]) => b - a)[0]

    // Recent spending trend (last 7 days vs previous 7 days)
    const now = new Date()
    const last7Days = transactions
      .filter((t) => {
        const txDate = new Date(t.date)
        const daysDiff = (now - txDate) / (1000 * 60 * 60 * 24)
        return daysDiff <= 7 && t.type === "expense"
      })
      .reduce((sum, t) => sum + t.amount, 0)

    const previous7Days = transactions
      .filter((t) => {
        const txDate = new Date(t.date)
        const daysDiff = (now - txDate) / (1000 * 60 * 60 * 24)
        return daysDiff > 7 && daysDiff <= 14 && t.type === "expense"
      })
      .reduce((sum, t) => sum + t.amount, 0)

    return {
      totalIncome,
      totalExpenses,
      balance,
      savingsRate,
      expensesByCategory,
      topExpenseCategory,
      last7Days,
      previous7Days,
      transactionCount: transactions.length,
      avgTransactionAmount: transactions.length > 0 ? (totalIncome + totalExpenses) / transactions.length : 0,
    }
  }

  // Generate AI insights
  const generateAIInsights = async () => {
    try {
      setLoading(true)
      const metrics = calculateMetrics()

      // Simulate AI response (replace with actual AI SDK call)
      const response = await simulateAIResponse(metrics)
      setInsights(response)
      setError(null)
    } catch (err) {
      setError("Failed to generate AI insights. Please try again.")
      console.error("AI Insights Error:", err)
    } finally {
      setLoading(false)
    }
  }

  // Simulate AI response (replace with actual AI SDK integration)
  const simulateAIResponse = async (metrics) => {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Generate realistic insights based on the data
    const healthScore = calculateHealthScore(metrics)
    const spendingTrend = metrics.last7Days > metrics.previous7Days ? "increasing" : "decreasing"
    const topCategory = metrics.topExpenseCategory?.[0] || "Unknown"
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

  const calculateHealthScore = (metrics) => {
    let score = 5 // Base score

    // Positive factors
    if (metrics.savingsRate > 20) score += 2
    else if (metrics.savingsRate > 10) score += 1
    else if (metrics.savingsRate < 0) score -= 2

    if (metrics.balance > 0) score += 1
    else score -= 1

    if (metrics.transactionCount > 10) score += 1 // Good tracking habits

    // Spending concentration risk
    const topCategoryPercentage = metrics.topExpenseCategory
      ? (metrics.topExpenseCategory[1] / metrics.totalExpenses) * 100
      : 0
    if (topCategoryPercentage > 50) score -= 1

    return Math.max(1, Math.min(10, score))
  }

  const generateSummary = (metrics, healthScore) => {
    if (healthScore >= 8) {
      return "Excellent financial health! You're demonstrating strong budgeting discipline with healthy savings and balanced spending."
    } else if (healthScore >= 6) {
      return "Good financial foundation with room for optimization. A few adjustments could significantly improve your financial position."
    } else if (healthScore >= 4) {
      return "Your finances need attention. Focus on increasing income, reducing expenses, or both to improve your financial stability."
    } else {
      return "Critical financial situation requiring immediate action. Consider seeking financial counseling and implementing strict budgeting measures."
    }
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

  const generateSpendingAnalysis = (metrics, trend, topCategory, percentage) => {
    return {
      trend:
        trend === "increasing" ? "📈 Spending increased in the last week" : "📉 Spending decreased in the last week",
      topCategory: `🏆 Highest expense category: ${topCategory} (${percentage.toFixed(1)}% of total)`,
      avgTransaction: `💳 Average transaction: $${metrics.avgTransactionAmount.toFixed(2)}`,
      frequency: `📊 Transaction frequency: ${metrics.transactionCount} transactions recorded`,
    }
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

    return tips
  }

  const generateBudgetSuggestions = (metrics) => {
    const suggestions = []

    // 50/30/20 rule suggestions
    const needs = metrics.totalExpenses * 0.5
    const wants = metrics.totalExpenses * 0.3
    const savings = metrics.totalIncome * 0.2

    suggestions.push({
      rule: "50/30/20 Budget Rule",
      needs: `Needs (50%): $${needs.toFixed(2)}`,
      wants: `Wants (30%): $${wants.toFixed(2)}`,
      savings: `Savings (20%): $${savings.toFixed(2)}`,
    })

    // Category-specific suggestions
    Object.entries(metrics.expensesByCategory).forEach(([category, amount]) => {
      const percentage = (amount / metrics.totalExpenses) * 100
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

    // Short-term goals (1-3 months)
    if (metrics.savingsRate < 15) {
      shortTerm.push("Increase savings rate to 15% within 2 months")
    }

    if (metrics.balance < metrics.totalIncome * 0.25) {
      shortTerm.push("Build emergency fund equal to 1 month of expenses")
    }

    shortTerm.push("Track all expenses for 30 consecutive days")

    // Long-term goals (6+ months)
    longTerm.push("Build emergency fund covering 3-6 months of expenses")
    longTerm.push("Achieve 20% savings rate consistently")
    longTerm.push("Diversify income sources")

    if (metrics.totalIncome > 0) {
      const emergencyFund = metrics.totalExpenses * 6
      longTerm.push(`Save $${emergencyFund.toFixed(2)} for full emergency fund`)
    }

    return { shortTerm, longTerm }
  }

  useEffect(() => {
    generateAIInsights()
  }, [budget])

  if (loading) {
    return (
      <div>
        <button className="cancelButton secondary-button" onClick={() => setViewMode("details")}>
          ← Back to Details
        </button>
        <h1 className="header">AI Financial Report</h1>
        <div className="ai-loading">
          <div className="loading-spinner"></div>
          <p>Analyzing your financial data...</p>
          <p className="loading-subtext">Generating personalized insights and recommendations</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <button className="cancelButton secondary-button" onClick={() => setViewMode("details")}>
          ← Back to Details
        </button>
        <h1 className="header">AI Financial Report</h1>
        <div className="error-state">
          <p className="error-message">{error}</p>
          <button className="primary-button" onClick={generateAIInsights}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <button className="cancelButton secondary-button" onClick={() => setViewMode("details")}>
        ← Back to Details
      </button>
      <h1 className="header">AI Financial Report</h1>

      {/* Compact Health Score */}
      <div className="compact-health-score">
        <div className="health-score-content">
          <div className="health-score-number">{insights.healthScore}/10</div>
          <div className="health-score-label">Financial Health</div>
        </div>
        <div className="health-score-bar">
          <div className="health-score-fill" style={{ width: `${(insights.healthScore / 10) * 100}%` }}></div>
        </div>
      </div>

      {/* Budget Optimization */}
      <div className="report-section">
        <h2 className="section-title">📋 Budget Optimization</h2>
        {insights.budgetSuggestions.map((suggestion, idx) => (
          <div key={idx} className="budget-suggestion">
            {suggestion.rule && (
              <div className="budget-rule">
                <h3>{suggestion.rule}</h3>
                <div className="budget-breakdown">
                  <div>{suggestion.needs}</div>
                  <div>{suggestion.wants}</div>
                  <div>{suggestion.savings}</div>
                </div>
              </div>
            )}
            {suggestion.category && (
              <div className="category-suggestion">
                <strong>{suggestion.category}:</strong> Currently {suggestion.current} - {suggestion.suggestion}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary Callout */}
      <div className="summary-callout">
        <div className="callout-icon">💡</div>
        <div className="callout-content">
          <h3 className="callout-title">Financial Overview</h3>
          <p className="callout-text">{insights.summary}</p>
        </div>
      </div>

      {/* Combined Strengths & Improvements */}
      <div className="report-section">
        <h2 className="section-title">⚖️ Strengths & Areas for Growth</h2>

        <div className="strengths-improvements-grid">
          <div className="strengths-column">
            <h3 className="column-title">✅ Your Strengths</h3>
            {insights.strengths.map((strength, idx) => (
              <div key={idx} className="strength-item-compact">
                <span className="strength-icon">✓</span>
                <span>{strength}</span>
              </div>
            ))}
          </div>

          <div className="improvements-column">
            <h3 className="column-title">🎯 Growth Areas</h3>
            {insights.improvements.map((improvement, idx) => (
              <div key={idx} className="improvement-item-compact">
                <div className="improvement-title-compact">{improvement.area}</div>
                <div className="improvement-action-compact">{improvement.action}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Spending Analysis */}
      <div className="report-section">
        <h2 className="section-title">📈 Spending Insights</h2>
        <div className="analysis-grid-compact">
          <div className="analysis-item-compact">{insights.spendingAnalysis.trend}</div>
          <div className="analysis-item-compact">{insights.spendingAnalysis.topCategory}</div>
          <div className="analysis-item-compact">{insights.spendingAnalysis.avgTransaction}</div>
          <div className="analysis-item-compact">{insights.spendingAnalysis.frequency}</div>
        </div>
      </div>

      {/* Quick Tips */}
      <div className="report-section">
        <h2 className="section-title">💡 Quick Savings Tips</h2>
        <div className="tips-grid">
          {insights.savingsTips.slice(0, 4).map((tip, idx) => (
            <div key={idx} className="tip-item-compact">
              {tip}
            </div>
          ))}
        </div>
      </div>

      {/* Goals */}
      <div className="report-section">
        <h2 className="section-title">🎯 Recommended Goals</h2>
        <div className="goals-container-compact">
          <div className="goals-column">
            <h3>Next 3 Months</h3>
            {insights.goals.shortTerm.slice(0, 3).map((goal, idx) => (
              <div key={idx} className="goal-item-compact short-term">
                <span>📅</span>
                {goal}
              </div>
            ))}
          </div>
          <div className="goals-column">
            <h3>6+ Months</h3>
            {insights.goals.longTerm.slice(0, 3).map((goal, idx) => (
              <div key={idx} className="goal-item-compact long-term">
                <span>📆</span>
                {goal}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Refresh Button */}
      <div className="report-actions">
        <button className="primary-button" onClick={generateAIInsights}>
          🔄 Generate New Report
        </button>
      </div>
    </div>
  )
}
