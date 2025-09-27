import { useState, useEffect, useCallback, useMemo } from "react"
import PropTypes from "prop-types"
import { useAuth } from "../contexts/AuthContext"
import { generateAIInsight, getAIInsights } from "../lib/supabase"

const PAID_PLAN_TIERS = ["trial", "paid", "pro", "premium", "plus"]

export default function AIInsightsScreen({ budget, setViewMode }) {
  const { user, userProfile } = useAuth()
  const planTier = userProfile?.plan_tier || userProfile?.planTier || "free"
  const normalizedTier = String(planTier).toLowerCase()
  const isPaidTier = PAID_PLAN_TIERS.includes(normalizedTier)

  const [history, setHistory] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)

  const calculateMetrics = useCallback(() => {
    const transactions = budget.transactions || []
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
  }, [budget])

  const selectedEntry = useMemo(() => {
    if (!history.length) return null
    if (selectedId) {
      const existing = history.find((entry) => entry.id === selectedId)
      if (existing) return existing
    }
    return history[0]
  }, [history, selectedId])

  const insightPayload = selectedEntry?.insights || null
  const insightTier = selectedEntry?.tier || (isPaidTier ? "paid" : "free")
  const showRecommendations = insightTier !== "free"

  const loadInsights = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const { data, error: fetchError } = await getAIInsights(user.id, budget.id, { limit: 10 })
      if (fetchError) {
        console.error("Failed to load AI insights", fetchError)
        setError(fetchError.message || "Unable to load AI insights")
        setHistory([])
        setSelectedId(null)
        return
      }

      setHistory(data || [])
      setSelectedId((current) => {
        if (!data?.length) return null
        if (current && data.some((entry) => entry.id === current)) {
          return current
        }
        return data[0].id
      })
      setError(null)
    } catch (loadError) {
      console.error("Unexpected error loading insights", loadError)
      setError(loadError.message || "Unexpected error loading insights")
      setHistory([])
      setSelectedId(null)
    } finally {
      setLoading(false)
    }
  }, [user, budget.id])

  useEffect(() => {
    loadInsights()
  }, [loadInsights])

  const handleGenerate = useCallback(async () => {
    if (!user) return
    setGenerating(true)
    setError(null)
    try {
      const metrics = calculateMetrics()
      const { data, error: invokeError } = await generateAIInsight({
        userId: user.id,
        budgetId: budget.id,
        metrics,
        tier: isPaidTier ? "paid" : "free",
      })

      if (invokeError) {
        console.error("Failed to generate AI insight", invokeError)
        setError(invokeError.message || "Failed to generate insight")
        return
      }

      if (data) {
        setHistory((prev) => {
          const withoutDuplicate = prev.filter((entry) => entry.id !== data.id)
          return [data, ...withoutDuplicate]
        })
        setSelectedId(data.id)
      }
    } catch (invokeError) {
      console.error("Unexpected error generating insights", invokeError)
      setError(invokeError.message || "Unexpected error generating insights")
    } finally {
      setGenerating(false)
      setLoading(false)
    }
  }, [user, budget.id, calculateMetrics, isPaidTier])

  if (loading && !history.length) {
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

  if (!loading && !history.length) {
    return (
      <div>
        <button className="cancelButton secondary-button" onClick={() => setViewMode("details")}>
          ← Back to Details
        </button>
        <h1 className="header">AI Financial Report</h1>
        <div className="empty-state">
          <p>Run your first AI analysis to unlock a personalized report for this budget.</p>
          <button className="primary-button" onClick={handleGenerate} disabled={generating}>
            {generating ? "Generating..." : "Generate AI Report"}
          </button>
          {error && <p className="error-message">{error}</p>}
        </div>
      </div>
    )
  }

  if (error && !generating && !insightPayload) {
    return (
      <div>
        <button className="cancelButton secondary-button" onClick={() => setViewMode("details")}>
          ← Back to Details
        </button>
        <h1 className="header">AI Financial Report</h1>
        <div className="error-state">
          <p className="error-message">{error}</p>
          <button className="primary-button" onClick={loadInsights}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const generatedAt = selectedEntry?.created_at
    ? new Date(selectedEntry.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : ""

  return (
    <div>
      <button className="cancelButton secondary-button" onClick={() => setViewMode("details")}>
        ← Back to Details
      </button>
      <h1 className="header">AI Financial Report</h1>

      <div className="insight-run-meta">
        <div>
          <div className="insight-run-time">Generated {generatedAt || "recently"}</div>
          <div className={`insight-tier-badge tier-${showRecommendations ? "paid" : "free"}`}>
            {showRecommendations ? "Recommendations enabled" : "Summary insight"}
          </div>
        </div>
        {history.length > 1 && (
          <label className="history-selector">
            <span>Previous reports</span>
            <select value={selectedEntry?.id || ""} onChange={(event) => setSelectedId(event.target.value)}>
              {history.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {new Date(entry.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && !generating && <p className="error-message" role="alert">{error}</p>}

      {insightPayload && (
        <>
          <div className="compact-health-score">
            <div className="health-score-content">
              <div className="health-score-number">{insightPayload.healthScore}/10</div>
              <div className="health-score-label">Financial Health</div>
            </div>
            <div className="health-score-bar">
              <div
                className="health-score-fill"
                style={{ width: `${Math.min((Number(insightPayload.healthScore || 0) / 10) * 100, 100)}%` }}
              ></div>
            </div>
          </div>

          <div className="summary-callout">
            <div className="callout-icon">💡</div>
            <div className="callout-content">
              <h3 className="callout-title">Financial Overview</h3>
              <p className="callout-text">{insightPayload.summary}</p>
            </div>
          </div>

          <div className="report-section">
            <h2 className="section-title">📈 Spending Insights</h2>
            <div className="analysis-grid-compact">
              <div className="analysis-item-compact">{insightPayload.spendingAnalysis?.trend}</div>
              <div className="analysis-item-compact">{insightPayload.spendingAnalysis?.topCategory}</div>
              <div className="analysis-item-compact">{insightPayload.spendingAnalysis?.avgTransaction}</div>
              <div className="analysis-item-compact">{insightPayload.spendingAnalysis?.frequency}</div>
            </div>
          </div>

          {!showRecommendations && (
            <div className="plan-teaser">
              Upgrade to unlock personalized recommendations, savings tips, and goal coaching.
            </div>
          )}

          {showRecommendations && (
            <>
              <div className="report-section">
                <h2 className="section-title">📋 Budget Optimization</h2>
                {(insightPayload.budgetSuggestions || []).map((suggestion, idx) => (
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

              <div className="report-section">
                <h2 className="section-title">⚖️ Strengths & Areas for Growth</h2>
                <div className="strengths-improvements-grid">
                  <div className="strengths-column">
                    <h3 className="column-title">✅ Your Strengths</h3>
                    {(insightPayload.strengths || []).map((strength, idx) => (
                      <div key={idx} className="strength-item-compact">
                        <span className="strength-icon">✓</span>
                        <span>{strength}</span>
                      </div>
                    ))}
                  </div>
                  <div className="improvements-column">
                    <h3 className="column-title">🎯 Growth Areas</h3>
                    {(insightPayload.improvements || []).map((improvement, idx) => (
                      <div key={idx} className="improvement-item-compact">
                        <div className="improvement-title-compact">{improvement.area}</div>
                        <div className="improvement-action-compact">{improvement.action}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="report-section">
                <h2 className="section-title">💡 Quick Savings Tips</h2>
                <div className="tips-grid">
                  {(insightPayload.savingsTips || []).slice(0, 4).map((tip, idx) => (
                    <div key={idx} className="tip-item-compact">
                      {tip}
                    </div>
                  ))}
                </div>
              </div>

              <div className="report-section">
                <h2 className="section-title">🎯 Recommended Goals</h2>
                <div className="goals-container-compact">
                  <div className="goals-column">
                    <h3>Next 3 Months</h3>
                    {(insightPayload.goals?.shortTerm || []).slice(0, 3).map((goal, idx) => (
                      <div key={idx} className="goal-item-compact short-term">
                        <span>📅</span>
                        {goal}
                      </div>
                    ))}
                  </div>
                  <div className="goals-column">
                    <h3>6+ Months</h3>
                    {(insightPayload.goals?.longTerm || []).slice(0, 3).map((goal, idx) => (
                      <div key={idx} className="goal-item-compact long-term">
                        <span>📆</span>
                        {goal}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <div className="report-actions">
        <button className="primary-button" onClick={handleGenerate} disabled={generating}>
          {generating ? "Generating..." : "🔄 Generate New Report"}
        </button>
      </div>
    </div>
  )
}

const transactionShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  amount: PropTypes.number.isRequired,
  budgetedAmount: PropTypes.number,
  category: PropTypes.string.isRequired,
  type: PropTypes.oneOf(["income", "expense"]).isRequired,
  date: PropTypes.string.isRequired,
  receipt: PropTypes.string,
})

AIInsightsScreen.propTypes = {
  budget: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    transactions: PropTypes.arrayOf(transactionShape),
  }).isRequired,
  setViewMode: PropTypes.func.isRequired,
}
