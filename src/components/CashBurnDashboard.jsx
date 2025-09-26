import { useEffect, useMemo, useState } from "react"
import { DEFAULT_CASH_BURN_PREFERENCES } from "../lib/supabase"

const DAY_OPTIONS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]

const formatCurrency = (value) => {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })
  return formatter.format(Number.isFinite(value) ? value : 0)
}

const formatPercent = (value, options = {}) => {
  if (!Number.isFinite(value)) return "—"
  const percentage = value * 100
  const sign = options.showSign ? (percentage > 0 ? "+" : percentage < 0 ? "-" : "") : ""
  return `${sign}${Math.abs(percentage).toFixed(options.decimals ?? 0)}%`
}

const Sparkline = ({ data }) => {
  const sanitized = Array.isArray(data) ? data : []
  const max = sanitized.reduce((acc, value) => (value > acc ? value : acc), 0)
  if (sanitized.length === 0) {
    return <div className="sparkline sparkline--empty" aria-hidden="true" />
  }

  const points = sanitized
    .map((value, index) => {
      const x = sanitized.length === 1 ? 0 : (index / (sanitized.length - 1)) * 100
      const y = max > 0 ? 100 - (value / max) * 100 : 100
      return `${x},${Math.max(0, Math.min(100, y))}`
    })
    .join(" ")

  return (
    <svg className="sparkline" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-hidden="true">
      <polyline points={points} className="sparkline-path" />
    </svg>
  )
}

const HistorySparkline = ({ history }) => {
  const totals = history.map((entry) => entry.totalBurn || 0).reverse()
  return <Sparkline data={totals} />
}

export default function CashBurnDashboard({
  report,
  history = [],
  preferences = DEFAULT_CASH_BURN_PREFERENCES,
  onSavePreferences,
  activeNudges = [],
  onDismissNudge,
}) {
  const [localPreferences, setLocalPreferences] = useState(preferences)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    setLocalPreferences(preferences)
    setHasChanges(false)
  }, [preferences])

  const leakCategories = useMemo(() => report?.leakCategories || [], [report])
  const resolvedPreferences = useMemo(
    () => ({
      ...DEFAULT_CASH_BURN_PREFERENCES,
      ...localPreferences,
      quietHours: {
        ...DEFAULT_CASH_BURN_PREFERENCES.quietHours,
        ...(localPreferences?.quietHours || {}),
      },
    }),
    [localPreferences],
  )

  const isPaidPlan = (resolvedPreferences.planTier || DEFAULT_CASH_BURN_PREFERENCES.planTier) === "paid"

  const handleFieldChange = (field, value) => {
    setLocalPreferences((prev) => {
      const updated = { ...prev, [field]: value }
      setHasChanges(true)
      return updated
    })
  }

  const handleQuietHoursChange = (field, value) => {
    setLocalPreferences((prev) => {
      const quietHours = {
        ...(prev?.quietHours || DEFAULT_CASH_BURN_PREFERENCES.quietHours),
        [field]: value,
      }
      setHasChanges(true)
      return { ...prev, quietHours }
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!onSavePreferences || !hasChanges) return

    try {
      setSaving(true)
      await onSavePreferences(localPreferences)
      setHasChanges(false)
    } catch (error) {
      console.error("Failed to save cash burn preferences", error)
      alert("We couldn't save your preferences. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="cashburn-section">
      <header className="cashburn-header">
        <div>
          <h2>Weekly Cash Burn</h2>
          <p className="cashburn-subtitle">
            Stay ahead of spend by tracking category leaks, pace, and nudges in one view.
          </p>
        </div>
        <div className={`pace-chip pace-chip--${report?.pace?.status || "neutral"}`}>
          {report?.pace?.status === "overpace" && "🔥 Over pace"}
          {report?.pace?.status === "underpace" && "🌱 Under pace"}
          {(!report?.pace?.status || report?.pace?.status === "on_track") && "✅ On track"}
        </div>
      </header>

      <div className="cashburn-grid">
        <article className="cashburn-card">
          <div className="cashburn-card-header">
            <h3>Week-to-date burn</h3>
            <span className="cashburn-period">
              {report ? `${new Date(report.weekRange.start).toLocaleDateString()} – ${new Date(report.weekRange.end).toLocaleDateString()}` : "No data"}
            </span>
          </div>
          <div className="cashburn-totals">
            <div>
              <p className="cashburn-label">Actual</p>
              <p className="cashburn-value">{formatCurrency(report?.totalBurn || 0)}</p>
            </div>
            <div>
              <p className="cashburn-label">Expected pace</p>
              <p className="cashburn-value cashburn-value--muted">
                {formatCurrency(report?.expectedDailyBurn ? report.expectedDailyBurn * report.pace.daysElapsed : 0)}
              </p>
            </div>
            <div>
              <p className="cashburn-label">Pace delta</p>
              <p
                className={`cashburn-value ${
                  report?.pace?.status === "overpace"
                    ? "cashburn-value--bad"
                    : report?.pace?.status === "underpace"
                    ? "cashburn-value--good"
                    : ""
                }`}
              >
                {formatPercent((report?.pace?.ratio || 1) - 1, { showSign: true })}
              </p>
            </div>
          </div>
          <p className="cashburn-message">{report?.pace?.message || "We’ll calculate your pace once transactions start flowing."}</p>
          <div className="cashburn-history">
            <HistorySparkline history={history} />
            <span className="cashburn-history-label">Trailing weeks</span>
          </div>
        </article>

        <article className="cashburn-card">
          <div className="cashburn-card-header">
            <h3>Top leak categories</h3>
            <span className="cashburn-label">Prioritized by burn and velocity</span>
          </div>
          {leakCategories.length === 0 ? (
            <p className="cashburn-empty">No major leaks this week. Keep it up!</p>
          ) : (
            <ul className="cashburn-category-list">
              {leakCategories.map((category) => (
                <li key={category.name} className="cashburn-category-item">
                  <div>
                    <p className="cashburn-category-name">{category.name}</p>
                    <p className="cashburn-category-meta">
                      {formatCurrency(category.amount)} · {formatPercent(category.share, { decimals: 1 })} of spend
                    </p>
                    {Number.isFinite(category.trend) && (
                      <p className={`cashburn-category-trend ${category.trend > 0 ? "trend-up" : "trend-down"}`}>
                        {category.trend > 0 ? "▲" : "▼"} vs. last week {formatPercent(Math.abs(category.trend), { decimals: 1 })}
                      </p>
                    )}
                  </div>
                  <Sparkline data={category.sparkline} />
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="cashburn-card">
          <div className="cashburn-card-header">
            <h3>Real-time nudges</h3>
            <span className="cashburn-label">Respecting quiet hours and thresholds</span>
          </div>
          {activeNudges.length === 0 ? (
            <p className="cashburn-empty">You’ll see nudges here when spending sprints ahead of plan.</p>
          ) : (
            <ul className="cashburn-nudges">
              {activeNudges.map((nudge) => (
                <li key={nudge.id} className={`cashburn-nudge cashburn-nudge--${nudge.severity || "info"}`}>
                  <div>
                    <p className="cashburn-nudge-message">{nudge.message}</p>
                    <p className="cashburn-nudge-meta">
                      {new Date(nudge.created_at || nudge.createdAt || Date.now()).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {nudge.category ? ` · ${nudge.category}` : ""}
                    </p>
                  </div>
                  {onDismissNudge && (
                    <button className="cashburn-nudge-dismiss" type="button" onClick={() => onDismissNudge(nudge.id)}>
                      Dismiss
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="cashburn-card">
          <div className="cashburn-card-header">
            <h3>Scheduling & thresholds</h3>
            <span className="cashburn-label">Control report cadence and alerts</span>
          </div>
          <form className="cashburn-form" onSubmit={handleSubmit}>
            <label className="cashburn-form-field">
              <span>Weekly report drop</span>
              <select
                value={resolvedPreferences.weeklyReportDay}
                onChange={(event) => handleFieldChange("weeklyReportDay", event.target.value)}
              >
                {DAY_OPTIONS.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </label>

            <label className="cashburn-form-field">
              <span>Report time</span>
              <input
                type="time"
                value={resolvedPreferences.weeklyReportTime}
                onChange={(event) => handleFieldChange("weeklyReportTime", event.target.value)}
              />
            </label>

            <div className="cashburn-form-field cashburn-form-field--inline">
              <label>
                <span>Quiet hours start</span>
                <input
                  type="time"
                  value={resolvedPreferences.quietHours?.start}
                  onChange={(event) => handleQuietHoursChange("start", event.target.value)}
                />
              </label>
              <label>
                <span>Quiet hours end</span>
                <input
                  type="time"
                  value={resolvedPreferences.quietHours?.end}
                  onChange={(event) => handleQuietHoursChange("end", event.target.value)}
                />
              </label>
            </div>

            <label className="cashburn-form-field">
              <span>Alert sensitivity ({Math.round((resolvedPreferences.alertThreshold || 0) * 100)}% pace swing)</span>
              <input
                type="range"
                min="0.05"
                max="0.5"
                step="0.05"
                value={resolvedPreferences.alertThreshold || DEFAULT_CASH_BURN_PREFERENCES.alertThreshold}
                onChange={(event) => handleFieldChange("alertThreshold", Number(event.target.value))}
              />
            </label>

            <label className="cashburn-form-field cashburn-toggle">
              <input
                type="checkbox"
                checked={Boolean(resolvedPreferences.realtimeEnabled)}
                onChange={(event) => handleFieldChange("realtimeEnabled", event.target.checked)}
              />
              <span>Enable paid real-time nudges</span>
            </label>

            <label className="cashburn-form-field cashburn-toggle">
              <input
                type="checkbox"
                checked={Boolean(resolvedPreferences.showSponsoredSlot)}
                onChange={(event) => handleFieldChange("showSponsoredSlot", event.target.checked)}
              />
              <span>Allow sponsored money-saving tips</span>
            </label>

            <button className="primary-button" type="submit" disabled={saving || !hasChanges}>
              {saving ? "Saving..." : hasChanges ? "Save preferences" : "Saved"}
            </button>
          </form>
        </article>

        {!isPaidPlan && resolvedPreferences.showSponsoredSlot && (
          <aside className="cashburn-sponsored" aria-label="Sponsored">
            <div className="cashburn-sponsored-badge">Sponsored</div>
            <h3>Upgrade to Pocket Budget Pro</h3>
            <p>
              Lock in real-time AI nudges, automated savings workflows, and 24/7 support for less than the cost of one latte a week.
            </p>
            <button type="button" className="secondary-button">
              Explore Pro plans
            </button>
          </aside>
        )}
      </div>
    </section>
  )
}
