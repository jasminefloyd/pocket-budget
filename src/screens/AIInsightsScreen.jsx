import { useState, useEffect, useMemo, useCallback } from "react"
import { fetchAIInsights, persistDismissedInsights } from "../lib/aiInsights"

const calculateBudgetMetrics = (budget) => {
  const transactions = budget?.transactions || []
  const totalIncome = transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0)
  const totalExpenses = transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0)
  const balance = totalIncome - totalExpenses
  const savingsRate = totalIncome > 0 ? (balance / totalIncome) * 100 : 0

  const expensesByCategory = {}
  transactions
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount
    })

  const topExpenseCategory = Object.entries(expensesByCategory).sort(([, a], [, b]) => b - a)[0]

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

export default function AIInsightsScreen({ budget, setViewMode, userId }) {
  const [insights, setInsights] = useState(null)
  const [dismissedIds, setDismissedIds] = useState([])
  const [cycleId, setCycleId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const generateAIInsights = useCallback(
    async ({ forceRefresh = false, showSpinner = false } = {}) => {
      if (!budget?.id || !userId) {
        setError("Missing information needed to generate insights.")
        return
      }

      try {
        if (showSpinner) {
          setLoading(true)
        }

        const metrics = calculateBudgetMetrics(budget)
        const { insights: fetchedInsights, dismissedIds: storedDismissedIds, cycleId: fetchedCycleId } = await fetchAIInsights({
          userId,
          budgetId: budget.id,
          metrics,
          forceRefresh,
        })

        setInsights(fetchedInsights)
        setDismissedIds(storedDismissedIds)
        setCycleId(fetchedCycleId)
        setError(null)
      } catch (err) {
        console.error("AI Insights Error:", err)
        setError("Failed to generate AI insights. Please try again.")
      } finally {
        if (showSpinner) {
          setLoading(false)
        }
      }
    },
    [budget, userId]
  )

  useEffect(() => {
    if (!budget || !userId) {
      return
    }
    setInsights(null)
    setDismissedIds([])
    setCycleId(null)
    setError(null)
    generateAIInsights({ forceRefresh: false, showSpinner: true })
  }, [budget, userId, generateAIInsights])

  const handleDismiss = useCallback(
    async (insightId) => {
      if (!insightId || dismissedIds.includes(insightId) || !cycleId) {
        return
      }

      const updatedDismissed = [...dismissedIds, insightId]
      setDismissedIds(updatedDismissed)

      try {
        await persistDismissedInsights({
          userId,
          budgetId: budget.id,
          cycleId,
          dismissedIds: updatedDismissed,
        })
      } catch (err) {
        console.error("Failed to persist dismissed insight", err)
      }
    },
    [dismissedIds, userId, budget?.id, cycleId]
  )

  const visibleImprovements = useMemo(() => {
    return (insights?.improvements || []).filter((item) => !dismissedIds.includes(item.id))
  }, [insights, dismissedIds])

  const visibleSavingsTips = useMemo(() => {
    return (insights?.savingsTips || []).filter((item) => !dismissedIds.includes(item.id))
  }, [insights, dismissedIds])

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
          <button className="primary-button" onClick={() => generateAIInsights({ forceRefresh: true, showSpinner: true })}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (!insights) {
    return null
  }

  return (
    <div>
      <button className="cancelButton secondary-button" onClick={() => setViewMode("details")}>
        ← Back to Details
      </button>
      <h1 className="header">AI Financial Report</h1>

      <div className="compact-health-score">
        <div className="health-score-content">
          <div className="health-score-number">{insights.healthScore}/10</div>
          <div className="health-score-label">Financial Health</div>
        </div>
        <div className="health-score-bar">
          <div className="health-score-fill" style={{ width: `${(insights.healthScore / 10) * 100}%` }}></div>
        </div>
      </div>

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

      <div className="summary-callout">
        <div className="callout-icon">💡</div>
        <div className="callout-content">
          <h3 className="callout-title">Financial Overview</h3>
          <p className="callout-text">{insights.summary}</p>
        </div>
      </div>

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
            {visibleImprovements.length === 0 && (
              <div className="improvement-item-compact">
                <div className="improvement-title-compact">All set!</div>
                <div className="improvement-action-compact">You've handled every improvement for this cycle.</div>
              </div>
            )}
            {visibleImprovements.map((improvement) => (
              <div key={improvement.id} className="improvement-item-compact">
                <div className="improvement-title-compact">{improvement.area}</div>
                <div className="improvement-action-compact">{improvement.action}</div>
                {improvement.suggestion && <div>{improvement.suggestion}</div>}
                <button className="dismiss-button" onClick={() => handleDismiss(improvement.id)}>
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="report-section">
        <h2 className="section-title">📈 Spending Insights</h2>
        <div className="analysis-grid-compact">
          <div className="analysis-item-compact">{insights.spendingAnalysis.trend}</div>
          <div className="analysis-item-compact">{insights.spendingAnalysis.topCategory}</div>
          <div className="analysis-item-compact">{insights.spendingAnalysis.avgTransaction}</div>
          <div className="analysis-item-compact">{insights.spendingAnalysis.frequency}</div>
        </div>
      </div>

      <div className="report-section">
        <h2 className="section-title">💡 Quick Savings Tips</h2>
        <div className="tips-grid">
          {visibleSavingsTips.length === 0 && <div className="tip-item-compact">No active tips. Great job staying on top of things!</div>}
          {visibleSavingsTips.map((tip) => (
            <div key={tip.id} className="tip-item-compact">
              <div>{tip.text}</div>
              <button className="dismiss-button" onClick={() => handleDismiss(tip.id)}>
                Dismiss
              </button>
            </div>
          ))}
        </div>
      </div>

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

      <div className="report-actions">
        <button className="primary-button" onClick={() => generateAIInsights({ forceRefresh: true, showSpinner: true })}>
          🔄 Generate New Report
        </button>
      </div>
    </div>
  )
}
