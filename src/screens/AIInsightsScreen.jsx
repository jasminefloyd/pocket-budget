import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { dismissAIInsight, getAIInsightDismissals } from "../lib/supabase"

const SUMMARY_WINDOW_DAYS = 30

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const formatCurrency = (value) => {
  if (!Number.isFinite(value)) {
    return "$0"
  }
  return currencyFormatter.format(Math.round(value))
}

const getCycleId = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

const clampPercent = (value) => {
  if (!Number.isFinite(value)) return 0
  return value
}

const isWithinWindow = (txDate, start, end) => {
  if (!txDate) return false
  return (!start || txDate >= start) && (!end || txDate < end)
}

const aggregateCategoryTotals = (transactions, start, end) => {
  return transactions.reduce((totals, transaction) => {
    if (!transaction || transaction.type !== "expense") {
      return totals
    }

    const txDate = transaction.date ? new Date(transaction.date) : null
    if (!(txDate instanceof Date) || Number.isNaN(txDate.getTime())) {
      return totals
    }

    if (!isWithinWindow(txDate, start, end)) {
      return totals
    }

    const category = transaction.category || "Uncategorized"
    totals[category] = (totals[category] || 0) + Number(transaction.amount || 0)
    return totals
  }, {})
}

const buildInsights = (budget, cycleId) => {
  const transactions = Array.isArray(budget?.transactions) ? budget.transactions : []

  const now = new Date()
  const currentStart = new Date(now)
  currentStart.setDate(currentStart.getDate() - SUMMARY_WINDOW_DAYS)
  const previousStart = new Date(currentStart)
  previousStart.setDate(previousStart.getDate() - SUMMARY_WINDOW_DAYS)

  const currentTotals = aggregateCategoryTotals(transactions, currentStart, now)
  const previousTotals = aggregateCategoryTotals(transactions, previousStart, currentStart)

  const categories = new Set([
    ...Object.keys(currentTotals),
    ...Object.keys(previousTotals),
  ])

  const movements = Array.from(categories).map((category) => {
    const currentValue = currentTotals[category] || 0
    const previousValue = previousTotals[category] || 0
    const delta = currentValue - previousValue
    const percentChange = previousValue > 0 ? (delta / previousValue) * 100 : currentValue > 0 ? 100 : 0

    return {
      id: `summary-${cycleId}-${category.replace(/\s+/g, "-").toLowerCase()}`,
      category,
      currentValue,
      previousValue,
      delta,
      percentChange,
    }
  })

  const sortedMovements = movements.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  const topMovements = sortedMovements.slice(0, 3)

  const totalCurrent = Object.values(currentTotals).reduce((sum, value) => sum + value, 0)
  const totalPrevious = Object.values(previousTotals).reduce((sum, value) => sum + value, 0)
  const varianceValue = totalCurrent - totalPrevious
  const variancePercent = clampPercent(totalPrevious > 0 ? (varianceValue / totalPrevious) * 100 : totalCurrent > 0 ? 100 : 0)

  const leadMovement = topMovements[0]
  const varianceDirection = varianceValue > 0 ? "up" : varianceValue < 0 ? "down" : "flat"
  const varianceCopy =
    varianceDirection === "flat"
      ? "Overall spend matched the previous period."
      : [
          `Overall spend is ${varianceDirection} ${formatCurrency(Math.abs(varianceValue))}`,
          `(${Math.abs(variancePercent).toFixed(1)}%) vs last period.`,
        ].join(" ")

  const summaryCopyParts = ["Here's the quick pulse on your budget."]
  if (leadMovement) {
    const leadDirection = leadMovement.delta > 0 ? "up" : leadMovement.delta < 0 ? "down" : "steady"
    const leadAmount = formatCurrency(Math.abs(leadMovement.delta))
    summaryCopyParts.push(
      leadDirection === "steady"
        ? `${leadMovement.category} is holding steady compared with the last ${SUMMARY_WINDOW_DAYS} days.`
        : `${leadMovement.category} is ${leadDirection} ${leadAmount} versus the last ${SUMMARY_WINDOW_DAYS} days.`,
    )
  }
  summaryCopyParts.push(varianceCopy)

  const summary = {
    id: `summary-${cycleId}`,
    copy: summaryCopyParts.join(" "),
    highlights: topMovements.map((movement) => {
      if (movement.delta === 0) {
        return {
          id: movement.id,
          category: movement.category,
          description: `${movement.category}: → steady vs last period`,
        }
      }

      const directionIcon = movement.delta > 0 ? "↑" : "↓"
      return {
        id: movement.id,
        category: movement.category,
        description: `${movement.category}: ${directionIcon} ${formatCurrency(Math.abs(movement.delta))} vs last period`,
      }
    }),
    variance: {
      value: varianceValue,
      percent: variancePercent,
      copy: varianceCopy,
    },
  }

  const recommendations = topMovements.map((movement) => {
    const increased = movement.delta > 0
    const impact = Math.abs(movement.delta) * (increased ? 0.25 : 0.15)
    const impactLabel = increased ? "savings" : "to reallocate"

    const title = increased ? `Right-size ${movement.category}` : `Reinvest ${movement.category}`
    const description = increased
      ? `Trim ${movement.category} by 15% and free up about ${formatCurrency(impact)} this cycle. Pair it with a category alert so the cut sticks.`
      : `Keep ${movement.category} on pace and send ${formatCurrency(impact)} toward savings or debt. Schedule the transfer now to lock it in.`

    return {
      id: `recommendation-${cycleId}-${movement.category.replace(/\s+/g, "-").toLowerCase()}`,
      title,
      description,
      estimatedImpact: impact,
      impactLabel,
      category: movement.category,
    }
  })

  return { summary, recommendations }
}

const extractPlanTier = (profile) => {
  if (!profile) return "free"
  return profile.plan_tier || profile.planTier || "free"
}

const extractTrialEnd = (profile) => {
  if (!profile) return null
  return profile.trial_expires_at || profile.trialExpiresAt || profile.trial_end_at || profile.trialEndAt || null
}

export default function AIInsightsScreen({ budget, setViewMode }) {
  const { user, userProfile } = useAuth()
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dismissals, setDismissals] = useState({ summaries: [], recommendations: [] })
  const [dismissError, setDismissError] = useState(null)
  const [dismissalsLoading, setDismissalsLoading] = useState(false)
  const insightTimeoutRef = useRef(null)
  const isMountedRef = useRef(true)

  const cycleId = useMemo(() => getCycleId(), [])

  const planTier = extractPlanTier(userProfile)
  const trialEndsAt = extractTrialEnd(userProfile)
  const onTrial = useMemo(() => {
    if (!trialEndsAt) return false
    const trialEndDate = new Date(trialEndsAt)
    if (!(trialEndDate instanceof Date) || Number.isNaN(trialEndDate.getTime())) {
      return false
    }
    return trialEndDate > new Date()
  }, [trialEndsAt])
  const hasPaidAccess = planTier !== "free" || onTrial

  const regenerateInsights = useCallback(() => {
    if (insightTimeoutRef.current) {
      clearTimeout(insightTimeoutRef.current)
    }

    setLoading(true)
    setError(null)

    insightTimeoutRef.current = setTimeout(() => {
      try {
        const nextInsights = buildInsights(budget, cycleId)
        if (!isMountedRef.current) return
        setInsights(nextInsights)
        setLoading(false)
      } catch (err) {
        console.error("AI Insights build error", err)
        if (!isMountedRef.current) return
        setError("We couldn't generate insights right now. Please try again shortly.")
        setLoading(false)
      }
    }, 300)
  }, [budget, cycleId])

  useEffect(() => {
    regenerateInsights()

    return () => {
      if (insightTimeoutRef.current) {
        clearTimeout(insightTimeoutRef.current)
      }
    }
  }, [regenerateInsights])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (insightTimeoutRef.current) {
        clearTimeout(insightTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!user?.id) {
      setDismissals({ summaries: [], recommendations: [] })
      setDismissalsLoading(false)
      return
    }

    let active = true
    const loadDismissals = async () => {
      setDismissalsLoading(true)
      const { data, error: loadError } = await getAIInsightDismissals(user.id, cycleId)
      if (!active) return

      if (loadError) {
        console.error("Failed to load AI insight dismissals", loadError)
        setDismissals({ summaries: [], recommendations: [] })
      } else {
        const summaryIds = (data || [])
          .filter((item) => item.insight_type === "summary")
          .map((item) => item.insight_id)
        const recommendationIds = (data || [])
          .filter((item) => item.insight_type === "recommendation")
          .map((item) => item.insight_id)
        setDismissals({ summaries: summaryIds, recommendations: recommendationIds })
      }
      setDismissalsLoading(false)
    }

    loadDismissals()

    return () => {
      active = false
    }
  }, [user?.id, cycleId])

  const handleDismiss = async (insightId, type) => {
    if (!insightId) return

    setDismissError(null)
    setDismissals((prev) => {
      const next = { ...prev }
      const key = type === "recommendation" ? "recommendations" : "summaries"
      if (!next[key].includes(insightId)) {
        next[key] = [...next[key], insightId]
      }
      return next
    })

    if (!user?.id) {
      return
    }

    const { error: persistError } = await dismissAIInsight(user.id, cycleId, insightId, type)
    if (persistError) {
      console.error("Failed to persist dismissal", persistError)
      setDismissError("We couldn't save that dismissal. It'll reset after this session.")
    }
  }

  if (loading) {
    return (
      <div>
        <button className="cancelButton secondary-button" onClick={() => setViewMode("details")}>
          ← Back to Details
        </button>
        <h1 className="header">AI Insights</h1>
        <div className="ai-loading">
          <div className="loading-spinner"></div>
          <p>Analyzing your budget...</p>
          <p className="loading-subtext">Building fresh highlights for the last {SUMMARY_WINDOW_DAYS} days</p>
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
        <h1 className="header">AI Insights</h1>
        <div className="error-state">
          <p className="error-message">{error}</p>
          <button className="primary-button" onClick={regenerateInsights}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  const summaryVisible = insights && !dismissals.summaries.includes(insights.summary.id)
  const visibleRecommendations = (insights?.recommendations || []).filter(
    (recommendation) => !dismissals.recommendations.includes(recommendation.id),
  )

  return (
    <div>
      <button className="cancelButton secondary-button" onClick={() => setViewMode("details")}>
        ← Back to Details
      </button>
      <h1 className="header">AI Insights</h1>
      {dismissError && <div className="error-banner">{dismissError}</div>}
      {dismissalsLoading && <div className="info-banner">Syncing your preferences…</div>}

      {summaryVisible ? (
        <section className="ai-card ai-summary-card">
          <header className="ai-card-header">
            <span className="ai-tier-badge ai-tier-badge--free">Free</span>
            <div>
              <h2>Summary highlights</h2>
              <p className="ai-card-subtitle">Top movements from the last {SUMMARY_WINDOW_DAYS} days</p>
            </div>
          </header>
          <p className="ai-card-copy">{insights.summary.copy}</p>
          <ul className="ai-highlights-list">
            {insights.summary.highlights.map((highlight) => (
              <li key={highlight.id}>{highlight.description}</li>
            ))}
          </ul>
          <div className="ai-variance-callout">{insights.summary.variance.copy}</div>
          <div className="ai-card-actions">
            <button className="text-button" onClick={() => setViewMode("details")}>
              View details
            </button>
            <button className="tertiary-button" onClick={() => handleDismiss(insights.summary.id, "summary")}>
              Dismiss
            </button>
          </div>
        </section>
      ) : (
        <section className="ai-card ai-card--muted">
          <header className="ai-card-header">
            <span className="ai-tier-badge ai-tier-badge--free">Free</span>
            <h2>Summary hidden</h2>
          </header>
          <p>You dismissed this cycle's summary. It will return with the next cycle.</p>
        </section>
      )}

      {hasPaidAccess ? (
        <section className="ai-card ai-recommendations-card">
          <header className="ai-card-header">
            <span className="ai-tier-badge ai-tier-badge--pro">Pro</span>
            <div>
              <h2>Recommendations</h2>
              <p className="ai-card-subtitle">Personalized adjustments with estimated impact chips</p>
            </div>
          </header>
          {visibleRecommendations.length === 0 ? (
            <p>You've dismissed the recommendations for this cycle. They'll refresh next cycle.</p>
          ) : (
            <div className="ai-recommendations-list">
              {visibleRecommendations.map((recommendation) => (
                <article key={recommendation.id} className="ai-recommendation">
                  <div className="ai-recommendation-header">
                    <h3>{recommendation.title}</h3>
                    <span className="ai-impact-chip">
                      ≈ {formatCurrency(recommendation.estimatedImpact)} {recommendation.impactLabel}
                    </span>
                  </div>
                  <p className="ai-card-copy">{recommendation.description}</p>
                  <div className="ai-card-actions">
                    <button className="text-button" onClick={() => setViewMode("details")}>
                      View details
                    </button>
                    <button
                      className="tertiary-button"
                      onClick={() => handleDismiss(recommendation.id, "recommendation")}
                    >
                      Dismiss
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="ai-card ai-card--muted">
          <header className="ai-card-header">
            <span className="ai-tier-badge ai-tier-badge--pro">Pro</span>
            <h2>Recommendations locked</h2>
          </header>
          <p>
            Upgrade to Pocket Budget Pro or start a trial to unlock tailored recommendations with projected impact
            chips.
          </p>
        </section>
      )}
    </div>
  )
}
