import { useEffect, useMemo, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import {
  getAIInsights,
  getDismissedInsightIds,
  dismissInsightForCycle,
  restoreInsightForCycle,
} from "../lib/aiInsights"

const formatCurrency = (value) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

const formatCycleLabel = (cycleId) => {
  if (!cycleId) return "this cycle"
  const [year, month] = cycleId.split("-")
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleString(undefined, { month: "long", year: "numeric" })
}

const FREE_PLAN = "free"

const isPaidPlan = (plan) => plan && plan.toLowerCase() !== FREE_PLAN

export default function AIInsightsScreen({ budget, setViewMode }) {
  const { user } = useAuth()
  const [insights, setInsights] = useState(null)
  const [plan, setPlan] = useState(FREE_PLAN)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [generatedAt, setGeneratedAt] = useState(null)
  const [cached, setCached] = useState(false)
  const [cycleId, setCycleId] = useState(null)
  const [dismissedIds, setDismissedIds] = useState(new Set())
  const [recentDismissal, setRecentDismissal] = useState(null)

  const calculateMetrics = () => {
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
  }

  const findInsightLabel = (itemId) => {
    if (!insights) return ""
    if (insights.summary.id === itemId) return "Summary"

    const collections = [
      insights.strengths,
      insights.improvements,
      insights.spendingAnalysis,
      insights.savingsTips,
      insights.budgetSuggestions,
      insights.goals.shortTerm,
      insights.goals.longTerm,
    ]

    for (const collection of collections) {
      const match = collection?.find((item) => item.id === itemId)
      if (match) {
        return match.area || match.rule || match.category || match.text || "Insight"
      }
    }

    return "Insight"
  }

  const loadInsights = async ({ forceRefresh = false } = {}) => {
    if (!user) {
      setError("You need to be signed in to view AI insights.")
      setLoading(false)
      return
    }

    try {
      if (forceRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)

      const metrics = calculateMetrics()
      const { plan: planTier, insights: aiInsights, generatedAt, cached, cycleId } = await getAIInsights({
        userId: user.id,
        metrics,
        forceRefresh,
      })

      const dismissed = await getDismissedInsightIds(user.id, cycleId)

      setPlan(planTier || FREE_PLAN)
      setInsights(aiInsights)
      setGeneratedAt(generatedAt)
      setCached(cached)
      setCycleId(cycleId)
      setDismissedIds(new Set(dismissed))
    } catch (err) {
      console.error("AI Insights Error:", err)
      setError("Failed to generate AI insights. Please try again.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (!budget || !user) {
      setLoading(false)
      return
    }
    setRecentDismissal(null)
    setDismissedIds(new Set())
    setInsights(null)
    setLoading(true)
    loadInsights()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget?.id, budget?.transactions?.length, user?.id])

  const handleDismiss = async (itemId) => {
    if (!user || !cycleId) return
    try {
      await dismissInsightForCycle(user.id, cycleId, itemId)
      setDismissedIds((prev) => {
        const updated = new Set(prev)
        updated.add(itemId)
        return updated
      })
      setRecentDismissal({ id: itemId, label: findInsightLabel(itemId) })
    } catch (err) {
      console.error("Failed to dismiss insight", err)
      setError("Couldn't update your AI feed preferences.")
    }
  }

  const handleUndoDismiss = async () => {
    if (!user || !cycleId || !recentDismissal) return
    try {
      await restoreInsightForCycle(user.id, cycleId, recentDismissal.id)
      setDismissedIds((prev) => {
        const updated = new Set(prev)
        updated.delete(recentDismissal.id)
        return updated
      })
      setRecentDismissal(null)
    } catch (err) {
      console.error("Failed to restore insight", err)
      setError("Couldn't restore that insight. Please refresh.")
    }
  }

  const filteredInsights = useMemo(() => {
    if (!insights) return null
    const hidden = dismissedIds
    return {
      ...insights,
      strengths: insights.strengths.filter((item) => !hidden.has(item.id)),
      improvements: insights.improvements.filter((item) => !hidden.has(item.id)),
      spendingAnalysis: insights.spendingAnalysis.filter((item) => !hidden.has(item.id)),
      savingsTips: insights.savingsTips.filter((item) => !hidden.has(item.id)),
      budgetSuggestions: insights.budgetSuggestions.filter((item) => !hidden.has(item.id)),
      goals: {
        shortTerm: insights.goals.shortTerm.filter((item) => !hidden.has(item.id)),
        longTerm: insights.goals.longTerm.filter((item) => !hidden.has(item.id)),
      },
    }
  }, [insights, dismissedIds])

  if (error) {
    return (
      <div>
        <button className="cancelButton secondary-button" onClick={() => setViewMode("details")}>
          ← Back to Details
        </button>
        <h1 className="header">AI Financial Report</h1>
        <div className="error-state">
          <p className="error-message">{error}</p>
          <button className="primary-button" onClick={() => loadInsights({ forceRefresh: true })}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (loading || !filteredInsights) {
    return (
      <div>
        <button className="cancelButton secondary-button" onClick={() => setViewMode("details")}>
          ← Back to Details
        </button>
        <h1 className="header">AI Financial Report</h1>
        <div className="ai-loading">
          <div className="loading-spinner"></div>
          <p>{refreshing ? "Refreshing your insights..." : "Analyzing your financial data..."}</p>
          <p className="loading-subtext">Generating personalized insights and recommendations</p>
        </div>
      </div>
    )
  }

  const cycleLabel = formatCycleLabel(cycleId)
  const paid = isPaidPlan(plan)
  const { strengths, improvements, spendingAnalysis, savingsTips, budgetSuggestions, goals } = filteredInsights

  return (
    <div>
      <button className="cancelButton secondary-button" onClick={() => setViewMode("details")}>
        ← Back to Details
      </button>
      <h1 className="header">AI Financial Report</h1>

      <div className="summary-callout">
        <div className="callout-icon">🤖</div>
        <div className="callout-content">
          <h3 className="callout-title">Plan overview</h3>
          <p className="callout-text">
            You are on the <strong>{plan?.toUpperCase()}</strong> plan. {cached ? "Instant summary served from cache." : "Fresh insights generated just now."}
          </p>
          {generatedAt && (
            <p className="loading-subtext">Last generated {new Date(generatedAt).toLocaleString()}</p>
          )}
        </div>
      </div>

      {recentDismissal && (
        <div className="summary-callout" style={{ background: "var(--color-surface-02)", marginTop: "1rem" }}>
          <div className="callout-icon">🧹</div>
          <div className="callout-content">
            <h3 className="callout-title">Hidden for {cycleLabel}</h3>
            <p className="callout-text">
              "{recentDismissal.label}" won't appear again this cycle.
            </p>
            <button className="secondary-button" onClick={handleUndoDismiss}>
              Undo dismiss
            </button>
          </div>
        </div>
      )}

      <div className="report-section">
        <h2 className="section-title">Free AI summaries</h2>
        <div className="compact-health-score">
          <div className="health-score-content">
            <div className="health-score-number">{filteredInsights.healthScore}/10</div>
            <div className="health-score-label">Financial Health</div>
          </div>
          <div className="health-score-bar">
            <div className="health-score-fill" style={{ width: `${(filteredInsights.healthScore / 10) * 100}%` }}></div>
          </div>
        </div>

        <div className="summary-callout">
          <div className="callout-icon">💡</div>
          <div className="callout-content">
            <h3 className="callout-title">Financial Overview</h3>
            <p className="callout-text">{filteredInsights.summary.text}</p>
          </div>
        </div>

        {strengths.length > 0 && (
          <div className="report-section">
            <h3 className="section-title">✅ Your Strengths</h3>
            {strengths.map((item) => (
              <div key={item.id} className="strength-item-compact" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                <span>{item.text}</span>
                <button className="dismiss-button" title={`Hide until ${cycleLabel}`} onClick={() => handleDismiss(item.id)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {spendingAnalysis.length > 0 && (
          <div className="report-section">
            <h3 className="section-title">📈 Spending Insights</h3>
            <div className="analysis-grid-compact">
              {spendingAnalysis.map((item) => (
                <div key={item.id} className="analysis-item-compact" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <span>{item.text}</span>
                  <button className="dismiss-button" title={`Hide until ${cycleLabel}`} onClick={() => handleDismiss(item.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="report-section">
        <h2 className="section-title">Paid recommendations</h2>
        {paid ? (
          <>
            {improvements.length > 0 && (
              <div className="report-section">
                <h3 className="section-title">🎯 Growth Areas</h3>
                {improvements.map((item) => (
                  <div key={item.id} className="improvement-item-compact">
                    <div className="improvement-title-compact">{item.area}</div>
                    <div className="improvement-action-compact">{item.suggestion}</div>
                    <div className="improvement-action-compact">{item.action}</div>
                    <button className="dismiss-button" title={`Hide until ${cycleLabel}`} onClick={() => handleDismiss(item.id)}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {savingsTips.length > 0 && (
              <div className="report-section">
                <h3 className="section-title">💡 Savings Tips</h3>
                <div className="tips-grid">
                  {savingsTips.map((item) => (
                    <div key={item.id} className="tip-item-compact" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                      <span>{item.text}</span>
                      <button className="dismiss-button" title={`Hide until ${cycleLabel}`} onClick={() => handleDismiss(item.id)}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {budgetSuggestions.length > 0 && (
              <div className="report-section">
                <h3 className="section-title">📋 Budget Optimization</h3>
                {budgetSuggestions.map((item) => (
                  <div key={item.id} className="budget-suggestion" style={{ position: "relative" }}>
                    {item.rule && (
                      <div className="budget-rule">
                        <h3>{item.rule}</h3>
                        <div className="budget-breakdown">
                          <div>{item.needs}</div>
                          <div>{item.wants}</div>
                          <div>{item.savings}</div>
                        </div>
                      </div>
                    )}
                    {item.category && (
                      <div className="category-suggestion">
                        <strong>{item.category}:</strong> Currently {item.current} - {item.suggestion}
                      </div>
                    )}
                    <button
                      className="dismiss-button"
                      style={{ position: "absolute", top: "0.5rem", right: "0.5rem" }}
                      title={`Hide until ${cycleLabel}`}
                      onClick={() => handleDismiss(item.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {(goals.shortTerm.length > 0 || goals.longTerm.length > 0) && (
              <div className="report-section">
                <h3 className="section-title">🎯 Recommended Goals</h3>
                <div className="goals-container-compact">
                  <div className="goals-column">
                    <h3>Next 3 Months</h3>
                    {goals.shortTerm.map((item) => (
                      <div key={item.id} className="goal-item-compact short-term" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                        <span>📅 {item.text}</span>
                        <button className="dismiss-button" title={`Hide until ${cycleLabel}`} onClick={() => handleDismiss(item.id)}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="goals-column">
                    <h3>6+ Months</h3>
                    {goals.longTerm.map((item) => (
                      <div key={item.id} className="goal-item-compact long-term" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                        <span>📆 {item.text}</span>
                        <button className="dismiss-button" title={`Hide until ${cycleLabel}`} onClick={() => handleDismiss(item.id)}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="summary-callout" style={{ background: "var(--color-surface-02)" }}>
            <div className="callout-icon">🚀</div>
            <div className="callout-content">
              <h3 className="callout-title">Unlock personalized recommendations</h3>
              <p className="callout-text">
                Upgrade to a paid plan to receive targeted savings tips, budget optimizations, and actionable goals tailored to your spending.
              </p>
              <button className="primary-button">Upgrade plan</button>
            </div>
          </div>
        )}
      </div>

      <div className="report-section">
        <h2 className="section-title">Spending snapshot</h2>
        <div className="analysis-grid-compact">
          <div className="analysis-item-compact">Total income: {formatCurrency(filteredInsights.totals?.totalIncome || 0)}</div>
          <div className="analysis-item-compact">Total expenses: {formatCurrency(filteredInsights.totals?.totalExpenses || 0)}</div>
          <div className="analysis-item-compact">Balance: {formatCurrency(filteredInsights.totals?.balance || 0)}</div>
        </div>
      </div>

      <div className="report-actions">
        <button className="primary-button" disabled={refreshing} onClick={() => loadInsights({ forceRefresh: true })}>
          {refreshing ? "Refreshing..." : "🔄 Regenerate"}
        </button>
      </div>
    </div>
  )
}
