import { useEffect, useMemo, useState } from "react"
import PropTypes from "prop-types"
import { useAuth } from "../contexts/AuthContext"
import { abbreviateCurrency, formatCurrency, summarizeReport, getPeriodRange, flattenTransactions } from "../lib/reporting"
import { getLatestAIInsight } from "../lib/supabase"

const PERIOD_OPTIONS = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "custom", label: "Custom" },
]

const COLOR_PALETTE = ["#5B8DEF", "#3ED1B7", "#FF9F43", "#FF6B6B", "#9D7DFF", "#54D3FF", "#FFB8D2"]

const getCategoryIcon = (categoryName, categories) => {
  if (!categoryName) return "💸"
  const key = categoryName.trim().toLowerCase()
  const collections = [categories?.expense || [], categories?.income || []]
  for (const collection of collections) {
    const match = collection.find((category) => category.name?.trim().toLowerCase() === key)
    if (match?.icon) return match.icon
  }
  return "💸"
}

const buildPieBackground = (breakdown) => {
  if (!breakdown?.length) return "conic-gradient(#E5E7EB 0deg 360deg)"
  let start = 0
  const segments = breakdown.map((entry, index) => {
    const sweep = (entry.percent / 100) * 360
    const end = start + sweep
    const color = COLOR_PALETTE[index % COLOR_PALETTE.length]
    const segment = `${color} ${start}deg ${end}deg`
    start = end
    return segment
  })
  return `conic-gradient(${segments.join(", ")})`
}

const buildLinePath = (series, key, width, height) => {
  if (!series?.length) return ""
  const maxValue = Math.max(
    1,
    ...series.map((point) => Math.max(0, Number.isFinite(point[key]) ? point[key] : 0)),
  )
  const step = series.length > 1 ? width / (series.length - 1) : width
  return series
    .map((point, index) => {
      const x = Math.round(index * step)
      const value = Number.isFinite(point[key]) ? Math.max(0, point[key]) : 0
      const normalized = value / maxValue
      const y = Math.round(height - normalized * height)
      return `${x},${y}`
    })
    .join(" ")
}

const buildChartLabels = (series) => {
  if (!series?.length) return []
  const step = Math.max(1, Math.floor(series.length / 6))
  return series.map((point, index) => ({ label: point.label, index })).filter((item, idx) => idx % step === 0)
}

export default function ReportsScreen({ budgets, categories, onViewInsights }) {
  const { userProfile, user } = useAuth()
  const [period, setPeriod] = useState("week")
  const [chartPeriod, setChartPeriod] = useState("week")
  const [insightPreview, setInsightPreview] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)

  const currency = userProfile?.preferences?.currency || "USD"

  const report = useMemo(() => summarizeReport(budgets, period), [budgets, period])
  const chartSeries = useMemo(() => {
    if (chartPeriod === period) {
      return report.incomeExpenseSeries
    }
    const scoped = summarizeReport(budgets, chartPeriod)
    return scoped.incomeExpenseSeries
  }, [budgets, chartPeriod, period, report.incomeExpenseSeries])

  const chartRange = useMemo(() => getPeriodRange(chartPeriod), [chartPeriod])
  const transactions = useMemo(() => flattenTransactions(budgets), [budgets])

  useEffect(() => {
    if (!user?.id) return
    let isActive = true
    setAiLoading(true)
    setAiError(null)

    const loadLatest = async () => {
      try {
        const { data, error } = await getLatestAIInsight(user.id)
        if (!isActive) return
        if (error) {
          console.error("Failed to load AI insights", error)
          setAiError(error.message || "Unable to load insights")
          setInsightPreview(null)
          return
        }
        setInsightPreview(data || null)
      } catch (insightError) {
        if (!isActive) return
        console.error("Unexpected AI insight error", insightError)
        setAiError(insightError.message || "Unable to load insights")
        setInsightPreview(null)
      } finally {
        if (isActive) {
          setAiLoading(false)
        }
      }
    }

    loadLatest()

    return () => {
      isActive = false
    }
  }, [user?.id])

  useEffect(() => {
    setChartPeriod(period)
  }, [period])

  const handleViewInsights = () => {
    if (!insightPreview) {
      onViewInsights?.(null)
      return
    }
    onViewInsights?.(insightPreview.budget_id || null)
  }

  const breakdown = report.categoryBreakdown
  const cashBurn = report.cashBurn
  const trends = report.trends.slice(0, 3)

  const chartWidth = 360
  const chartHeight = 160
  const incomePath = buildLinePath(chartSeries, "income", chartWidth, chartHeight)
  const expensePath = buildLinePath(chartSeries, "expense", chartWidth, chartHeight)
  const chartLabels = buildChartLabels(chartSeries)

  const aiSummary = insightPreview?.insights?.summary
  const aiBudgetName = useMemo(() => {
    if (!insightPreview?.budget_id) return null
    const budget = budgets.find((entry) => entry.id === insightPreview.budget_id)
    return budget?.name || insightPreview.budget_id
  }, [budgets, insightPreview?.budget_id])

  const trendStatements = trends.length
    ? trends.map((entry) => {
        const direction = entry.percentChange < 0 ? "less" : "more"
        const absolute = Math.abs(entry.percentChange)
        const formatted = Number.isFinite(absolute) ? absolute.toFixed(1) : "0"
        return `You spent ${formatted}% ${direction} on ${entry.label}.`
      })
    : ["We need a bit more data to highlight category trends. Keep logging transactions!"]

  const upcomingRangeLabel = report.range?.label || ""

  const totalTransactions = transactions.length

  return (
    <div className="reports-screen">
      <header className="reports-header">
        <div>
          <h1>Reports</h1>
          <p className="reports-subtitle">
            Explore spending patterns, cash burn, and income trends for {upcomingRangeLabel.toLowerCase()}.
          </p>
        </div>
        <label className="reports-period-select">
          <span className="sr-only">Select reporting period</span>
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {totalTransactions === 0 && (
        <div className="report-empty">
          <p>
            We&apos;ll start charting insights as soon as you add transactions to your budgets. Create a budget and begin
            tracking spending to unlock detailed analytics.
          </p>
        </div>
      )}

      <section className="report-grid">
        <article className="report-card">
          <header>
            <h2>Average Daily Spend</h2>
            <span className="metric-tag">{report.range?.label}</span>
          </header>
          <p className="metric-value">{formatCurrency(report.avgDailySpend, currency)}</p>
          <p className="metric-subtext">Across all logged expenses</p>
        </article>

        <article className="report-card">
          <header>
            <h2>Total Expenses</h2>
            <span className="metric-tag">{report.range?.label}</span>
          </header>
          <p className="metric-value expense">{abbreviateCurrency(report.totalExpenses, currency)}</p>
          <p className="metric-subtext">
            Income: <strong>{abbreviateCurrency(report.totalIncome, currency)}</strong>
          </p>
        </article>

        <article className="report-card">
          <header>
            <h2>Net Balance</h2>
            <span className={`metric-tag ${report.balance >= 0 ? "success" : "warning"}`}>
              {report.balance >= 0 ? "Surplus" : "Deficit"}
            </span>
          </header>
          <p className={`metric-value ${report.balance >= 0 ? "income" : "expense"}`}>
            {abbreviateCurrency(report.balance, currency)}
          </p>
          <p className="metric-subtext">
            {report.balance >= 0 ? "Great job staying ahead" : "Review discretionary categories"}
          </p>
        </article>
      </section>

      <section className="report-card cash-burn-card">
        <header>
          <div>
            <h2>Cash Burn</h2>
            <p className="metric-subtext">Monitoring current month budgets</p>
          </div>
          <span className="metric-tag accent">{cashBurn.projectedDaysLeft ? `${Math.floor(cashBurn.projectedDaysLeft)} days left` : "Stable"}</span>
        </header>
        <div className="cash-burn-body">
          <div className="cash-burn-number">{formatCurrency(cashBurn.avgDailySpend, currency)}</div>
          <div className="cash-burn-label">Average daily spend</div>
          <div className="progress-bar">
            <div className="progress-bar__track" aria-hidden="true">
              <div
                className="progress-bar__fill"
                style={{ width: `${Math.min(100, Math.round((cashBurn.progress || 0) * 100))}%` }}
              />
            </div>
            <div className="progress-bar__legend">
              <span>Spent {formatCurrency(cashBurn.spent, currency)}</span>
              <span>Budgeted {formatCurrency(cashBurn.totalBudgeted, currency)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="report-card category-card">
        <header>
          <h2>Category Breakdown</h2>
          <p className="metric-subtext">Expense mix for {report.range?.label}</p>
        </header>
        <div className="category-content">
          <div className="category-pie" style={{ background: buildPieBackground(breakdown) }} aria-hidden="true" />
          <ul className="category-list">
            {breakdown.length ? (
              breakdown.map((entry, index) => (
                <li key={entry.key}>
                  <span className="category-icon" aria-hidden="true">
                    {getCategoryIcon(entry.label, categories)}
                  </span>
                  <div className="category-info">
                    <span className="category-name">{entry.label}</span>
                    <span className="category-amount">{formatCurrency(entry.amount, currency)}</span>
                  </div>
                  <span className="category-percent">{entry.percent.toFixed(1)}%</span>
                  <span
                    className="category-color"
                    aria-hidden="true"
                    style={{ backgroundColor: COLOR_PALETTE[index % COLOR_PALETTE.length] }}
                  />
                </li>
              ))
            ) : (
              <li className="category-empty">Log expenses to populate category analytics.</li>
            )}
          </ul>
        </div>
      </section>

      <section className="report-card chart-card">
        <header className="chart-header">
          <div>
            <h2>Income vs Expenses</h2>
            <p className="metric-subtext">Daily totals ({chartRange.label.toLowerCase()})</p>
          </div>
          <div className="chart-toggle" role="group" aria-label="Select chart period">
            {PERIOD_OPTIONS.filter((option) => option.value !== "custom").map((option) => (
              <button
                key={option.value}
                type="button"
                className={chartPeriod === option.value ? "is-active" : ""}
                onClick={() => setChartPeriod(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>
        <div className="chart-wrapper" role="img" aria-label="Line chart comparing income and expenses">
          {chartSeries.length ? (
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
              <polyline points={incomePath} fill="none" stroke="#3ED1B7" strokeWidth="3" />
              <polyline points={expensePath} fill="none" stroke="#FF6B6B" strokeWidth="3" />
            </svg>
          ) : (
            <div className="chart-empty">Add income and expenses to unlock the comparison chart.</div>
          )}
        </div>
        {chartSeries.length > 0 && (
          <div className="chart-legend">
            <span>
              <span className="legend-dot" style={{ backgroundColor: "#3ED1B7" }} /> Income
            </span>
            <span>
              <span className="legend-dot" style={{ backgroundColor: "#FF6B6B" }} /> Expenses
            </span>
          </div>
        )}
        {chartSeries.length > 0 && (
          <div className="chart-axis">
            {chartLabels.map((label) => (
              <span key={`${label.label}-${label.index}`}>{label.label}</span>
            ))}
          </div>
        )}
      </section>

      <section className="report-card trends-card">
        <header>
          <h2>Trends &amp; Insights</h2>
          <p className="metric-subtext">Week-over-week category shifts</p>
        </header>
        <ul className="trends-list">
          {trendStatements.map((statement, index) => (
            <li key={statement} className={index === 0 ? "highlight" : ""}>
              <span className="trend-icon" aria-hidden="true">
                {index === 0 ? "📈" : "🧭"}
              </span>
              <span>{statement}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="report-card ai-card">
        <header>
          <div>
            <h2>
              <span aria-hidden="true" className="ai-icon">
                ⚡
              </span>
              AI Insights Preview
            </h2>
            <p className="metric-subtext">Latest recommendations generated for your budgets</p>
          </div>
        </header>
        <div className="ai-body">
          {aiLoading ? (
            <p className="ai-status">Gathering the latest insight...</p>
          ) : aiError ? (
            <p className="ai-status error">{aiError}</p>
          ) : insightPreview ? (
            <>
              {aiBudgetName && <p className="ai-budget">{aiBudgetName}</p>}
              <p className="ai-summary">{aiSummary || "Your AI co-pilot is ready with fresh guidance."}</p>
            </>
          ) : (
            <p className="ai-status">Generate an AI report from any budget to see a personalized preview here.</p>
          )}
          <button type="button" className="primary-button" onClick={handleViewInsights} disabled={aiLoading}>
            View Full AI Insights
          </button>
        </div>
      </section>
    </div>
  )
}

ReportsScreen.propTypes = {
  budgets: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      name: PropTypes.string,
      transactions: PropTypes.arrayOf(
        PropTypes.shape({
          id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
          amount: PropTypes.number,
          category: PropTypes.string,
          type: PropTypes.string,
          date: PropTypes.string,
        }),
      ),
      categoryBudgets: PropTypes.arrayOf(
        PropTypes.shape({
          category: PropTypes.string,
          budgetedAmount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        }),
      ),
    }),
  ),
  categories: PropTypes.shape({
    income: PropTypes.array,
    expense: PropTypes.array,
  }),
  onViewInsights: PropTypes.func,
}

ReportsScreen.defaultProps = {
  budgets: [],
  categories: { income: [], expense: [] },
  onViewInsights: undefined,
}
