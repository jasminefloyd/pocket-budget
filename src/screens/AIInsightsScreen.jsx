import { useState, useEffect, useCallback, useMemo } from "react"
import PropTypes from "prop-types"
import { useAuth } from "../contexts/AuthContext"
import { generateAIInsight, getAIInsights } from "../lib/supabase"
import useRenderTimer from "../hooks/useRenderTimer"
import { buildAIRecommendations, buildReadableSummary, calculateGradeLevel } from "../lib/recommendations"

export default function AIInsightsScreen({ budget, setViewMode }) {
  const { user } = useAuth()
  const userId = user?.id

  const [history, setHistory] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [showFullSummary, setShowFullSummary] = useState(false)

  const calculateMetrics = useCallback(() => {
    const transactions = budget.transactions || []

    const toAmount = (value) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value
      }
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? parsed : 0
    }

    const sumByType = (type) =>
      transactions
        .filter((transaction) => transaction.type === type)
        .reduce((sum, transaction) => sum + toAmount(transaction.amount), 0)

    const totalIncome = sumByType("income")
    const totalExpenses = sumByType("expense")
    const balance = totalIncome - totalExpenses
    const savingsRate = totalIncome > 0 ? (balance / totalIncome) * 100 : 0

    const expensesByCategory = {}
    transactions
      .filter((transaction) => transaction.type === "expense")
      .forEach((transaction) => {
        const amount = toAmount(transaction.amount)
        const categoryKey = transaction.category?.trim() || "Uncategorized"
        expensesByCategory[categoryKey] = (expensesByCategory[categoryKey] || 0) + amount
      })

    const topExpenseCategory = Object.entries(expensesByCategory).sort(([, a], [, b]) => b - a)[0]

    const now = new Date()
    const sumExpensesInRange = (minDaysInclusive, maxDaysExclusive) =>
      transactions
        .filter((transaction) => {
          if (transaction.type !== "expense") return false
          const txDate = new Date(transaction.date)
          if (Number.isNaN(txDate.getTime())) return false
          const daysDiff = (now - txDate) / (1000 * 60 * 60 * 24)
          return daysDiff >= minDaysInclusive && daysDiff < maxDaysExclusive
        })
        .reduce((sum, transaction) => sum + toAmount(transaction.amount), 0)

    const last7Days = sumExpensesInRange(0, 7)
    const previous7Days = sumExpensesInRange(7, 14)
    const totalTransactionVolume = transactions.reduce(
      (sum, transaction) => sum + Math.abs(toAmount(transaction.amount)),
      0,
    )

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
      avgTransactionAmount: transactions.length > 0 ? totalTransactionVolume / transactions.length : 0,
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
  const metricsSnapshot = useMemo(() => calculateMetrics(), [calculateMetrics])
  const readableSummary = useMemo(
    () => buildReadableSummary(metricsSnapshot, insightPayload),
    [metricsSnapshot, insightPayload],
  )
  const recommendations = useMemo(
    () => buildAIRecommendations(metricsSnapshot, insightPayload),
    [metricsSnapshot, insightPayload],
  )
  const summaryGrade = useMemo(() => calculateGradeLevel(readableSummary), [readableSummary])
  const showDetailedSummary = Boolean(
    insightPayload?.summary && insightPayload.summary.trim() && insightPayload.summary !== readableSummary,
  )
  const renderPerf = useRenderTimer({
    name: "ai-insights-cards",
    thresholds: [{ limit: generating ? 1500 : 700, label: generating ? "recompute" : "cached" }],
    dependencies: [generating, selectedEntry?.id],
    enabled: Boolean(insightPayload),
  })

  const hasDetailedGuidance = useMemo(
    () =>
      Boolean(
        (insightPayload?.budgetSuggestions || []).length ||
          (insightPayload?.strengths || []).length ||
          (insightPayload?.improvements || []).length,
      ),
    [insightPayload],
  )

  const loadInsights = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const { data, error: fetchError } = await getAIInsights(userId, budget.id, { limit: 10 })
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
  }, [userId, budget.id])

  useEffect(() => {
    loadInsights()
  }, [loadInsights])

  useEffect(() => {
    setShowFullSummary(false)
  }, [selectedEntry?.id])

  const handleGenerate = useCallback(async () => {
    if (!userId) return
    setGenerating(true)
    setError(null)
    try {
      const metrics = calculateMetrics()
      const { data, error: invokeError } = await generateAIInsight({
        userId,
        budgetId: budget.id,
        metrics,
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
        setShowFullSummary(false)
      }
    } catch (invokeError) {
      console.error("Unexpected error generating insights", invokeError)
      setError(invokeError.message || "Unexpected error generating insights")
    } finally {
      setGenerating(false)
      setLoading(false)
    }
  }, [userId, budget.id, calculateMetrics])

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
          <div className={`insight-tier-badge tier-${hasDetailedGuidance ? "full" : "summary"}`}>
            {hasDetailedGuidance ? "Detailed guidance" : "Summary insight"}
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
        <div className="insight-content" {...renderPerf.dataAttributes}>
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

          <div
            className="summary-callout"
            data-reading-grade={summaryGrade}
            aria-live="polite"
            aria-label="Financial overview summary"
          >
            <div className="callout-icon">💡</div>
            <div className="callout-content">
              <h3 className="callout-title">Financial Overview</h3>
              <p className="callout-text">{showFullSummary && showDetailedSummary ? insightPayload.summary : readableSummary}</p>
              {showDetailedSummary && (
                <button type="button" className="link-button" onClick={() => setShowFullSummary((prev) => !prev)}>
                  {showFullSummary ? "Show simple view" : "Learn more"}
                </button>
              )}
            </div>
          </div>

          {recommendations.length > 0 && (
            <div className="report-section">
              <h2 className="section-title">✅ Actionable recommendations</h2>
              <div className="recommendations-grid">
                {recommendations.map((recommendation) => (
                  <div key={recommendation.id} className="recommendation-card">
                    <div className="recommendation-header">
                      <h3>{recommendation.title}</h3>
                      <span className="impact-badge">{recommendation.impact}</span>
                    </div>
                    <p className="recommendation-summary">{recommendation.summary}</p>
                    <details className="recommendation-details">
                      <summary>Learn more</summary>
                      <p>{recommendation.details}</p>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="report-section">
            <h2 className="section-title">📈 Spending Insights</h2>
            <div className="analysis-grid-compact">
              <div className="analysis-item-compact">{insightPayload.spendingAnalysis?.trend}</div>
              <div className="analysis-item-compact">{insightPayload.spendingAnalysis?.topCategory}</div>
              <div className="analysis-item-compact">{insightPayload.spendingAnalysis?.avgTransaction}</div>
              <div className="analysis-item-compact">{insightPayload.spendingAnalysis?.frequency}</div>
            </div>
          </div>

          {!hasDetailedGuidance && (
            <div className="empty-state small">Log more activity to unlock personalized recommendations.</div>
          )}

          {hasDetailedGuidance && (
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
        </div>
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
