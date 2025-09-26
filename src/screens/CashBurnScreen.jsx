"use client"

import { useEffect, useMemo, useState } from "react"
import PropTypes from "prop-types"
import useCashBurnAnalytics from "../hooks/useCashBurnAnalytics"

const paceToneToClass = {
  danger: "cashburn-pill danger",
  success: "cashburn-pill success",
  muted: "cashburn-pill muted",
}

const formatCurrency = (value) => {
  if (value === null || value === undefined) return "—"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)
}

const formatPercent = (value) => {
  if (value === null || value === undefined) return "—"
  const formatter = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 })
  return formatter.format(value / 100)
}

const formatWeekRange = (start, end) => {
  if (!start) return "This week"
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
  const startDate = formatter.format(new Date(start))
  const endDate = end ? formatter.format(new Date(end)) : "present"
  return `${startDate} – ${endDate}`
}

const sparkLinePoints = (values = []) => {
  if (!Array.isArray(values) || values.length === 0) return []
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  return values.map((value) => ((value - min) / range) * 100)
}

const SettingsSheet = ({
  isOpen,
  onClose,
  preferences,
  categories,
  onSave,
}) => {
  const expenseCategories = useMemo(() => categories?.expense?.map((cat) => cat.name) || [], [categories])
  const [trackedCategories, setTrackedCategories] = useState(preferences?.trackedCategories || [])
  const [cadence, setCadence] = useState(preferences?.cadence || "weekly")
  const [planTier, setPlanTier] = useState(preferences?.planTier || "free")
  const [quietStart, setQuietStart] = useState(preferences?.quietHours?.start || "21:00")
  const [quietEnd, setQuietEnd] = useState(preferences?.quietHours?.end || "07:00")
  const [thresholds, setThresholds] = useState(preferences?.alertThresholds || { default: 150 })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen || !preferences) return
    setTrackedCategories(preferences.trackedCategories || [])
    setCadence(preferences.cadence || "weekly")
    setPlanTier(preferences.planTier || "free")
    setQuietStart(preferences.quietHours?.start || "21:00")
    setQuietEnd(preferences.quietHours?.end || "07:00")
    setThresholds(preferences.alertThresholds || { default: 150 })
  }, [isOpen, preferences])

  const toggleCategory = (name) => {
    setTrackedCategories((current) =>
      current.includes(name) ? current.filter((category) => category !== name) : [...current, name],
    )
  }

  const handleThresholdChange = (key, value) => {
    setThresholds((current) => ({
      ...current,
      [key]: value === "" ? "" : Number(value),
    }))
  }

  const handleSave = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const alertThresholds = { ...thresholds }
      trackedCategories.forEach((category) => {
        const key = category.toLowerCase()
        if (alertThresholds[key] === undefined || alertThresholds[key] === "") {
          alertThresholds[key] = alertThresholds.default || 150
        }
      })
      const result = await onSave({
        planTier,
        cadence,
        trackedCategories,
        quietHours: { start: quietStart, end: quietEnd },
        alertThresholds,
      })
      if (result?.error) {
        console.error("Unable to save cash burn preferences", result.error)
        alert("We couldn't save your cash burn settings. Please try again.")
        return
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="cashburn-sheet-backdrop" role="dialog" aria-modal="true">
      <form className="cashburn-sheet" onSubmit={handleSave}>
        <header className="cashburn-sheet__header">
          <h2>Cash Burn settings</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </header>

        <div className="cashburn-sheet__content">
          <section>
            <h3>Plan</h3>
            <p className="cashburn-sheet__hint">Paid plans unlock proactive nudges and advanced pacing controls.</p>
            <select className="input" value={planTier} onChange={(event) => setPlanTier(event.target.value)}>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="teams">Teams</option>
            </select>
          </section>

          <section>
            <h3>Report cadence</h3>
            <select className="input" value={cadence} onChange={(event) => setCadence(event.target.value)}>
              <option value="weekly">Weekly (recommended)</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
            </select>
          </section>

          <section>
            <h3>Tracked categories</h3>
            <div className="cashburn-chip-group">
              {(expenseCategories.length ? expenseCategories : trackedCategories).map((category) => {
                const isActive = trackedCategories.includes(category)
                return (
                  <button
                    key={category}
                    type="button"
                    className={`cashburn-chip ${isActive ? "active" : ""}`}
                    onClick={() => toggleCategory(category)}
                  >
                    {isActive ? "✓" : ""} {category}
                  </button>
                )
              })}
            </div>
          </section>

          <section>
            <h3>Quiet hours</h3>
            <div className="cashburn-quiet-hours">
              <label>
                Start
                <input type="time" className="input" value={quietStart} onChange={(event) => setQuietStart(event.target.value)} />
              </label>
              <label>
                End
                <input type="time" className="input" value={quietEnd} onChange={(event) => setQuietEnd(event.target.value)} />
              </label>
            </div>
          </section>

          <section>
            <h3>Alert thresholds</h3>
            <div className="cashburn-thresholds">
              <label>
                Default threshold
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={thresholds.default ?? 150}
                  onChange={(event) => handleThresholdChange("default", event.target.value)}
                />
              </label>
              {trackedCategories.map((category) => {
                const key = category.toLowerCase()
                return (
                  <label key={key}>
                    {category}
                    <input
                      type="number"
                      min="0"
                      className="input"
                      value={thresholds[key] ?? ""}
                      onChange={(event) => handleThresholdChange(key, event.target.value)}
                    />
                  </label>
                )
              })}
            </div>
          </section>
        </div>

        <footer className="cashburn-sheet__footer">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </footer>
      </form>
    </div>
  )
}

SettingsSheet.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  preferences: PropTypes.object,
  categories: PropTypes.object,
  onSave: PropTypes.func.isRequired,
}

export default function CashBurnScreen({ userId, onClose, categories }) {
  const { reports, preferences, nudges, loading, paceLegend, isPaidPlan, savePreferences, dismissNudge, acknowledgeAlert } =
    useCashBurnAnalytics(userId)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const trackedCategories = preferences?.trackedCategories || []

  const legendTone = (pace) => paceLegend?.[pace]?.tone || paceLegend?.neutral?.tone || "muted"
  const legendLabel = (pace) => paceLegend?.[pace]?.label || paceLegend?.neutral?.label || "Neutral"

  return (
    <div className="cashburn-screen">
      <div className="cashburn-screen__header">
        <button className="secondary-button" onClick={onClose}>
          ← Back
        </button>
        <h1>Weekly cash burn</h1>
        <button className="icon-button" onClick={() => setIsSettingsOpen(true)} aria-label="Edit cash burn settings">
          ⚙️
        </button>
      </div>

      {loading && <div className="cashburn-loading">Loading cash burn analytics…</div>}

      {!isPaidPlan && preferences?.sponsorSlot && (
        <aside className="cashburn-sponsor">
          <div>
            <p className="cashburn-sponsor__eyebrow">Sponsored</p>
            <h2>{preferences.sponsorSlot.label}</h2>
            <p>{preferences.sponsorSlot.message}</p>
          </div>
          <a className="primary-button" href={preferences.sponsorSlot.href} target="_blank" rel="noreferrer">
            {preferences.sponsorSlot.cta}
          </a>
        </aside>
      )}

      {nudges.length > 0 && (
        <section className="cashburn-nudges">
          <h2>Nudges</h2>
          {nudges.map((nudge) => (
            <article key={nudge.id} className={`cashburn-nudge ${nudge.severity}`}>
              <div>
                <p className="cashburn-nudge__title">{nudge.category || "Cash burn"}</p>
                <p className="cashburn-nudge__message">{nudge.message}</p>
              </div>
              <div className="cashburn-nudge__actions">
                <button className="secondary-button" onClick={() => dismissNudge(nudge.id)}>
                  Remind me later
                </button>
                <button className="primary-button" onClick={() => acknowledgeAlert(nudge.alertId)}>
                  Mark resolved
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="cashburn-reports">
        <header className="cashburn-reports__header">
          <h2>Weekly pace</h2>
          {trackedCategories.length > 0 && <p className="cashburn-reports__subhead">Tracking {trackedCategories.join(", ")}</p>}
        </header>

        {reports.map((report) => {
          const toneClass = paceToneToClass[legendTone(report.pace)] || paceToneToClass.muted
          const delta = report.weekOverWeekDelta ?? 0
          const deltaPercent = report.weekOverWeekDeltaPercent
          const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "→"

          return (
            <article key={report.id} className="cashburn-card">
              <div className="cashburn-card__header">
                <div>
                  <p className="cashburn-card__eyebrow">{formatWeekRange(report.weekStart, report.weekEnd)}</p>
                  <h3>{formatCurrency(report.totalBurn)}</h3>
                </div>
                <span className={toneClass}>{legendLabel(report.pace)}</span>
              </div>

              <div className="cashburn-card__body">
                <div className="cashburn-metric">
                  <span className="cashburn-metric__label">Plan</span>
                  <span className="cashburn-metric__value">{formatCurrency(report.plannedBurn)}</span>
                </div>
                <div className="cashburn-metric">
                  <span className="cashburn-metric__label">WoW delta</span>
                  <span className={`cashburn-metric__value ${delta > 0 ? "bad" : delta < 0 ? "good" : "neutral"}`}>
                    {arrow} {formatCurrency(Math.abs(delta))}
                    {deltaPercent !== null && <span className="cashburn-metric__percent">({formatPercent(deltaPercent)})</span>}
                  </span>
                </div>
              </div>

              <ul className="cashburn-leaks">
                {(report.topCategories || []).map((category) => {
                  const spark = sparkLinePoints(category.sparkline)
                  const leakDelta = category.delta ?? 0
                  const leakArrow = leakDelta > 0 ? "▲" : leakDelta < 0 ? "▼" : "→"
                  return (
                    <li key={category.name} className="cashburn-leak">
                      <div className="cashburn-leak__title">
                        <span>{category.name}</span>
                        <strong>{formatCurrency(category.amount)}</strong>
                      </div>
                      <div className="cashburn-leak__meta">
                        <span className={`cashburn-leak__delta ${leakDelta > 0 ? "bad" : leakDelta < 0 ? "good" : "neutral"}`}>
                          {leakArrow} {formatCurrency(Math.abs(leakDelta))}
                        </span>
                        {spark.length > 0 && (
                          <div className="cashburn-sparkline" aria-hidden="true">
                            {spark.map((value, index) => (
                              <span key={index} style={{ height: `${value}%` }} />
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>

              {report.narrative && <p className="cashburn-card__narrative">{report.narrative}</p>}
            </article>
          )
        })}

        {reports.length === 0 && !loading && (
          <div className="cashburn-empty">
            <p>No weekly reports yet. We will compile your first snapshot after a full week of activity.</p>
          </div>
        )}
      </section>

      <SettingsSheet
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        preferences={preferences}
        categories={categories}
        onSave={savePreferences}
      />
    </div>
  )
}

CashBurnScreen.propTypes = {
  userId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  categories: PropTypes.object,
}
