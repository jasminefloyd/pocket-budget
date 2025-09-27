"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import PropTypes from "prop-types"
import {
  addGoalContribution,
  createGoal,
  createTransaction,
  deleteGoal,
  getGoals,
  updateGoal,
} from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"

const DEFAULT_MILESTONES = [25, 50, 75, 100]
const MS_IN_DAY = 1000 * 60 * 60 * 24
const MS_IN_WEEK = MS_IN_DAY * 7
const PAID_PLAN_TIERS = ["trial", "paid", "pro", "premium", "plus"]

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0))

const normalizeContribution = (contribution) => ({
  ...contribution,
  amount: Number(contribution.amount || 0),
  contributed_at: contribution.contributed_at || contribution.date || contribution.created_at || new Date().toISOString(),
})

const normalizeGoalRecord = (goal) => {
  const contributions = (goal.goal_contributions || goal.contributions || []).map(normalizeContribution)

  contributions.sort((a, b) => new Date(b.contributed_at) - new Date(a.contributed_at))

  return {
    ...goal,
    targetAmount: Number(goal.target_amount ?? goal.targetAmount ?? 0),
    targetDate: goal.target_date || goal.targetDate || null,
    status: goal.status || "active",
    milestones: Array.isArray(goal.milestones) && goal.milestones.length ? goal.milestones : DEFAULT_MILESTONES,
    linked_budget_id: goal.linked_budget_id || goal.linkedBudgetId || null,
    goal_contributions: contributions,
  }
}

const getStartDate = (goal) => {
  const created = goal.created_at || goal.createdAt
  const explicit = goal.start_date || goal.startDate
  const date = explicit || created
  const parsed = date ? new Date(date) : new Date()
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

const getTargetDate = (goal) => {
  if (!goal.targetDate) return null
  const parsed = new Date(goal.targetDate)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const getWeekStart = (date) => {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday as first day of week
  const start = new Date(d.setDate(diff))
  start.setHours(0, 0, 0, 0)
  return start
}

const getGoalMetrics = (goal) => {
  const now = new Date()
  const contributions = goal.goal_contributions || []
  const totalContributed = contributions.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const targetAmount = Number(goal.targetAmount || 0)
  const progress = targetAmount > 0 ? Math.min(100, (totalContributed / targetAmount) * 100) : 0
  const startDate = getStartDate(goal)
  const targetDate = getTargetDate(goal)

  let totalDurationMs = targetDate ? targetDate.getTime() - startDate.getTime() : null
  if (totalDurationMs !== null && totalDurationMs <= 0) {
    totalDurationMs = MS_IN_WEEK
  }

  const elapsedMs = Math.max(0, now.getTime() - startDate.getTime())
  const plannedFraction =
    totalDurationMs && totalDurationMs > 0 ? Math.min(1, Math.max(0, elapsedMs / totalDurationMs)) : 1
  const plannedTotal = targetAmount * plannedFraction

  const totalWeeks = totalDurationMs ? Math.max(1, Math.ceil(totalDurationMs / MS_IN_WEEK)) : 1
  const weeklyTarget = totalWeeks > 0 ? targetAmount / totalWeeks : targetAmount

  const weekStart = getWeekStart(now)
  const weekEnd = new Date(weekStart.getTime() + MS_IN_WEEK)
  const contributedThisWeek = contributions
    .filter((item) => {
      const contributedDate = new Date(item.contributed_at)
      return contributedDate >= weekStart && contributedDate < weekEnd
    })
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)

  const tolerance = targetAmount * 0.02
  const delta = totalContributed - plannedTotal
  let pace = "on-track"
  if (delta > tolerance) {
    pace = "ahead"
  } else if (delta < -tolerance) {
    pace = "behind"
  }

  const guidanceShortfall = Math.max(0, weeklyTarget - contributedThisWeek)

  return {
    totalContributed,
    progress,
    weeklyTarget,
    contributedThisWeek,
    guidanceShortfall,
    pace,
    plannedTotal,
    totalWeeks,
  }
}

export default function GoalsScreen({ setViewMode, budgets = [], setBudgets, onDataMutated }) {
  const { user, userProfile } = useAuth()
  const planTier = userProfile?.plan_tier || userProfile?.planTier || "free"
  const planTierNormalized = String(planTier).toLowerCase()
  const canManageGoals = PAID_PLAN_TIERS.includes(planTierNormalized)
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [goalForm, setGoalForm] = useState({
    name: "",
    targetAmount: "",
    targetDate: "",
    linkedBudgetId: "",
  })
  const [keypadOpen, setKeypadOpen] = useState(false)
  const [selectedGoalId, setSelectedGoalId] = useState("")
  const [keypadValue, setKeypadValue] = useState("")
  const [contributionNote, setContributionNote] = useState("")
  const [confettiGoalId, setConfettiGoalId] = useState(null)
  const [milestoneCelebration, setMilestoneCelebration] = useState(null)
  const prevProgressRef = useRef({})
  const [saving, setSaving] = useState(false)
  const [loggingContribution, setLoggingContribution] = useState(false)

  const loadGoals = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: goalsError } = await getGoals(user.id)
      if (goalsError) {
        console.error("Error loading goals:", goalsError)
        setError(goalsError.message || "Failed to load goals")
        return
      }

      const normalized = (data || []).map((goal) => normalizeGoalRecord(goal))
      setGoals(normalized)
      const progressMap = {}
      normalized.forEach((goal) => {
        progressMap[goal.id] = getGoalMetrics(goal).progress
      })
      prevProgressRef.current = progressMap
      if (normalized.length) {
        setSelectedGoalId((current) => current || normalized[0].id)
      }
    } catch (loadError) {
      console.error("Unexpected error loading goals:", loadError)
      setError(loadError.message || "Unexpected error loading goals")
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    loadGoals()
  }, [user, loadGoals])

  const handleCreateGoal = async (event) => {
    event.preventDefault()
    if (!user) return

    if (!canManageGoals) {
      alert("Goal creation is available during trial or paid plans.")
      return
    }

    const targetAmount = parseFloat(goalForm.targetAmount)
    if (!goalForm.name.trim() || Number.isNaN(targetAmount) || targetAmount <= 0) {
      alert("Please provide a goal name and a positive target amount.")
      return
    }

    setSaving(true)
    try {
      const { data, error: createError } = await createGoal(user.id, {
        name: goalForm.name.trim(),
        targetAmount,
        targetDate: goalForm.targetDate ? new Date(goalForm.targetDate).toISOString() : null,
        milestones: DEFAULT_MILESTONES,
        status: "active",
        linkedBudgetId: goalForm.linkedBudgetId || null,
      })

      if (createError) {
        console.error("Error creating goal:", createError)
        alert(createError.message || "Failed to create goal")
        return
      }

      const createdGoal = data?.[0]
      if (createdGoal) {
        const normalizedGoal = normalizeGoalRecord(createdGoal)
        setGoals((prev) => [normalizedGoal, ...prev])
        prevProgressRef.current[normalizedGoal.id] = getGoalMetrics(normalizedGoal).progress
        setSelectedGoalId(normalizedGoal.id)
      }

      setGoalForm({ name: "", targetAmount: "", targetDate: "", linkedBudgetId: "" })
      setCreating(false)
    } catch (createUnexpected) {
      console.error("Unexpected error creating goal:", createUnexpected)
      alert("Unexpected error creating goal. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteGoal = async (goalId) => {
    if (!confirm("Delete this goal? Contributions will remain recorded.")) {
      return
    }
    try {
      const { error: deleteError } = await deleteGoal(goalId)
      if (deleteError) {
        console.error("Error deleting goal:", deleteError)
        alert(deleteError.message || "Failed to delete goal")
        return
      }

      setGoals((prev) => {
        const filtered = prev.filter((goal) => goal.id !== goalId)
        if (filtered.length === 0) {
          setSelectedGoalId("")
        } else if (goalId === selectedGoalId) {
          setSelectedGoalId(filtered[0].id)
        }
        return filtered
      })
      const progressMap = { ...prevProgressRef.current }
      delete progressMap[goalId]
      prevProgressRef.current = progressMap
    } catch (deleteUnexpected) {
      console.error("Unexpected error deleting goal:", deleteUnexpected)
      alert("Unexpected error deleting goal")
    }
  }

  const handleLinkBudgetChange = async (goal, linkedBudgetId) => {
    try {
      const { data, error: updateError } = await updateGoal(goal.id, {
        linkedBudgetId: linkedBudgetId || null,
      })
      if (updateError) {
        console.error("Error linking budget:", updateError)
        alert(updateError.message || "Failed to link budget")
        return
      }

      if (data?.[0]) {
        const normalizedGoal = normalizeGoalRecord(data[0])
        setGoals((prev) => prev.map((item) => (item.id === goal.id ? normalizedGoal : item)))
      } else {
        setGoals((prev) =>
          prev.map((item) => (item.id === goal.id ? { ...item, linked_budget_id: linkedBudgetId || null } : item)),
        )
      }
    } catch (updateUnexpected) {
      console.error("Unexpected error linking budget:", updateUnexpected)
      alert("Unexpected error while linking budget")
    }
  }

  const closeKeypad = () => {
    setKeypadOpen(false)
    setKeypadValue("")
    setContributionNote("")
  }

  const appendKeypadValue = (value) => {
    setKeypadValue((prev) => {
      if (value === "←") {
        return prev.slice(0, -1)
      }
      if (value === "." && prev.includes(".")) {
        return prev
      }
      return `${prev}${value}`
    })
  }

  const handleContributionSubmit = async () => {
    const amount = parseFloat(keypadValue)
    if (!selectedGoalId || Number.isNaN(amount) || amount <= 0) {
      alert("Enter a valid contribution amount")
      return
    }

    if (!canManageGoals) {
      alert("Logging contributions is available during trial or paid plans.")
      return
    }

    const goal = goals.find((item) => item.id === selectedGoalId)
    if (!goal) {
      alert("Select a goal")
      return
    }

    setLoggingContribution(true)
    const contributionDate = new Date().toISOString()
    try {
      const previousProgress = prevProgressRef.current[goal.id] ?? getGoalMetrics(goal).progress
      const { data, error: contributionError } = await addGoalContribution(goal.id, {
        amount,
        date: contributionDate,
        note: contributionNote,
      })
      if (contributionError) {
        console.error("Error logging contribution:", contributionError)
        alert(contributionError.message || "Failed to log contribution")
        return
      }

      const newContributions = (data || []).map(normalizeContribution)
      if (newContributions.length) {
        const updatedGoal = normalizeGoalRecord({
          ...goal,
          goal_contributions: [...newContributions, ...(goal.goal_contributions || [])],
        })

        const nextProgress = getGoalMetrics(updatedGoal).progress
        handleMilestoneCelebration(updatedGoal, previousProgress, nextProgress)
        prevProgressRef.current[goal.id] = nextProgress

        setGoals((prev) => prev.map((item) => (item.id === goal.id ? updatedGoal : item)))
        await syncContributionToBudget(goal, amount, contributionDate)
      }

      closeKeypad()
    } catch (contributionUnexpected) {
      console.error("Unexpected error adding contribution:", contributionUnexpected)
      alert("Unexpected error adding contribution")
    } finally {
      setLoggingContribution(false)
    }
  }

  const handleMilestoneCelebration = (goal, previousProgress, nextProgress) => {
    const milestones = (goal.milestones || DEFAULT_MILESTONES).slice().sort((a, b) => a - b)
    const unlocked = milestones.find((milestone) => previousProgress < milestone && nextProgress >= milestone)
    if (unlocked !== undefined) {
      setConfettiGoalId(goal.id)
      setMilestoneCelebration({ goalName: goal.name, milestone: unlocked })
      setTimeout(() => {
        setConfettiGoalId(null)
        setMilestoneCelebration(null)
      }, 4000)
    }
  }

  const syncContributionToBudget = async (goal, amount, date) => {
    if (!goal.linked_budget_id || !setBudgets) {
      return
    }
    const linkedBudget = budgets.find((budget) => budget.id === goal.linked_budget_id)
    if (!linkedBudget) {
      return
    }

    try {
      const transactionPayload = {
        name: `Goal Contribution - ${goal.name}`,
        amount,
        budgetedAmount: 0,
        category: "Savings Goals",
        type: "expense",
        date,
        receipt: null,
      }
      const { data, error: transactionError } = await createTransaction(goal.linked_budget_id, transactionPayload)
      if (transactionError) {
        console.error("Failed to sync contribution to budget:", transactionError)
        return
      }

      const inserted = data?.[0]
      const normalizedTransaction = inserted
        ? {
            id: inserted.id,
            name: inserted.name,
            amount: inserted.amount,
            budgetedAmount: inserted.budgeted_amount,
            category: inserted.category,
            type: inserted.type,
            date: inserted.date,
            receipt: inserted.receipt_url,
          }
        : {
            id: `goal-sync-${Date.now()}`,
            ...transactionPayload,
          }

      setBudgets((prev) =>
        prev.map((budget) =>
          budget.id === goal.linked_budget_id
            ? { ...budget, transactions: [...(budget.transactions || []), normalizedTransaction] }
            : budget,
        ),
      )
      onDataMutated?.()
    } catch (transactionUnexpected) {
      console.error("Unexpected error syncing contribution to budget:", transactionUnexpected)
    }
  }

  const milestoneBadges = (goal) => {
    const metrics = getGoalMetrics(goal)
    const achieved = (goal.milestones || DEFAULT_MILESTONES).filter((milestone) => metrics.progress >= milestone)
    return achieved
  }

  const keypadButtons = useMemo(
    () => [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
      [".", "0", "←"],
    ],
    [],
  )

  return (
    <div className="goals-screen">
      <div className="goals-header">
        <button className="ghost-button" onClick={() => setViewMode("budgets")}>← Budgets</button>
        <h2>Savings Goals</h2>
        <p className="tagline">Track milestones, weekly pace, and stay motivated.</p>
      </div>

      {!canManageGoals && (
        <div className="plan-teaser goals-teaser">
          Goal creation and contribution tracking unlock during your free trial or with Pocket Budget Plus.
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="loading-goals">Loading goals…</div>
      ) : goals.length === 0 ? (
        <div className="empty-state">
          <p>Start a new savings goal to build momentum.</p>
          <button className="primary-button" onClick={() => setCreating(true)}>
            Create your first goal
          </button>
        </div>
      ) : (
        goals.map((goal) => {
          const metrics = getGoalMetrics(goal)
          const achievedMilestones = milestoneBadges(goal)
          return (
            <div key={goal.id} className="goal-card">
              <div className="goal-card-header">
                <div>
                  <h3>{goal.name}</h3>
                  <span className={`goal-pace-badge ${metrics.pace}`}>{metrics.pace.replace("-", " ")}</span>
                  {metrics.progress >= 100 && <span className="goal-complete">🎉 Complete</span>}
                </div>
                <button className="icon-button" onClick={() => handleDeleteGoal(goal.id)} title="Delete goal">
                  🗑️
                </button>
              </div>

              <div className="goal-progress-bar">
                <div className="goal-progress" style={{ width: `${metrics.progress}%` }} />
              </div>
              <div className="goal-progress-meta">
                <span>{formatCurrency(metrics.totalContributed)} saved</span>
                <span>Target {formatCurrency(goal.targetAmount)}</span>
              </div>

              <div className="goal-meta-grid">
                <div>
                  <p className="meta-label">Weekly target</p>
                  <p className="meta-value">{formatCurrency(metrics.weeklyTarget)}</p>
                </div>
                <div>
                  <p className="meta-label">This week</p>
                  <p className="meta-value">{formatCurrency(metrics.contributedThisWeek)}</p>
                </div>
                {goal.targetDate && (
                  <div>
                    <p className="meta-label">Target date</p>
                    <p className="meta-value">{new Date(goal.targetDate).toLocaleDateString()}</p>
                  </div>
                )}
                <div>
                  <p className="meta-label">Milestones</p>
                  <p className="meta-value">{achievedMilestones.length > 0 ? `${achievedMilestones.join("% • ")}%` : "—"}</p>
                </div>
              </div>

              {metrics.pace === "behind" && metrics.guidanceShortfall > 0 && (
                <div className="goal-guidance">Add {formatCurrency(metrics.guidanceShortfall)} this week to catch up.</div>
              )}

              <div className="goal-budget-link">
                <label>
                  Sync with budget
                  <select
                    value={goal.linked_budget_id || ""}
                    onChange={(event) => handleLinkBudgetChange(goal, event.target.value)}
                  >
                    <option value="">Not linked</option>
                    {budgets.map((budget) => (
                      <option key={budget.id} value={budget.id}>
                        {budget.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {goal.goal_contributions && goal.goal_contributions.length > 0 && (
                <div className="goal-contributions">
                  <h4>Recent contributions</h4>
                  <ul>
                    {goal.goal_contributions.slice(0, 4).map((contribution) => (
                      <li key={contribution.id}>
                        <span>{new Date(contribution.contributed_at).toLocaleDateString()}</span>
                        <span>{formatCurrency(contribution.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })
      )}

      <button
        className="fab"
        onClick={() => {
          if (!goals.length) {
            setCreating(true)
            return
          }
          if (!selectedGoalId && goals.length) {
            setSelectedGoalId(goals[0].id)
          }
          if (!canManageGoals) {
            alert("Upgrade or start a trial to log contributions in real time.")
            return
          }
          setKeypadOpen(true)
        }}
        title="Log contribution"
      >
        ➕
      </button>

      <button className="secondary-button" onClick={() => setCreating(true)} style={{ width: "100%", marginTop: "1rem" }}>
        New goal
      </button>

      {creating && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Create goal</h3>
            {!canManageGoals && (
              <div className="plan-teaser">
                Goal creation is part of Pocket Budget Plus. Start a trial to map savings to your next big milestone.
              </div>
            )}
            <form onSubmit={handleCreateGoal} className="goal-form">
              <fieldset disabled={!canManageGoals}>
                <label>
                  Goal name
                  <input
                    type="text"
                    value={goalForm.name}
                    onChange={(event) => setGoalForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Emergency fund"
                    required
                  />
                </label>
                <label>
                  Target amount
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={goalForm.targetAmount}
                    onChange={(event) => setGoalForm((prev) => ({ ...prev, targetAmount: event.target.value }))}
                    placeholder="5000"
                    required
                  />
                </label>
                <label>
                  Target date
                  <input
                    type="date"
                    value={goalForm.targetDate}
                    onChange={(event) => setGoalForm((prev) => ({ ...prev, targetDate: event.target.value }))}
                  />
                </label>
                <label>
                  Link to budget
                  <select
                    value={goalForm.linkedBudgetId}
                    onChange={(event) => setGoalForm((prev) => ({ ...prev, linkedBudgetId: event.target.value }))}
                  >
                    <option value="">Not linked</option>
                    {budgets.map((budget) => (
                      <option key={budget.id} value={budget.id}>
                        {budget.name}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>

              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => setCreating(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={saving || !canManageGoals}>
                  {saving ? "Saving…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {keypadOpen && (
        <div className="modal-backdrop">
          <div className="modal keypad-modal">
            <h3>Log contribution</h3>
            {!canManageGoals && (
              <p className="plan-teaser">Upgrade or start a trial to log automatic goal contributions.</p>
            )}
            <fieldset disabled={!canManageGoals}>
              <label>
                Choose goal
                <select value={selectedGoalId} onChange={(event) => setSelectedGoalId(event.target.value)}>
                  {goals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="keypad-display">{keypadValue || "0"}</div>
              <div className="numeric-keypad">
                {keypadButtons.map((row, rowIndex) => (
                  <div key={rowIndex} className="keypad-row">
                    {row.map((label) => (
                      <button key={label} type="button" onClick={() => appendKeypadValue(label)}>
                        {label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <label>
                Note (optional)
                <input
                  type="text"
                  value={contributionNote}
                  onChange={(event) => setContributionNote(event.target.value)}
                  placeholder="Paycheck transfer"
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={closeKeypad}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleContributionSubmit}
                  disabled={loggingContribution || !canManageGoals}
                >
                  {loggingContribution ? "Saving…" : "Log"}
                </button>
              </div>
            </fieldset>
          </div>
        </div>
      )}

      {confettiGoalId && (
        <div className="confetti-overlay">
          {Array.from({ length: 60 }).map((_, index) => (
            <span
              key={index}
              className="confetti-piece"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 1.5}s`,
              }}
            >
              🎉
            </span>
          ))}
        </div>
      )}

      {milestoneCelebration && (
        <div className="milestone-banner">
          <strong>{milestoneCelebration.goalName}</strong> reached {milestoneCelebration.milestone}% of the goal!
        </div>
      )}
    </div>
  )
}

GoalsScreen.propTypes = {
  setViewMode: PropTypes.func.isRequired,
  budgets: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      name: PropTypes.string.isRequired,
      transactions: PropTypes.arrayOf(
        PropTypes.shape({
          id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
          name: PropTypes.string.isRequired,
          amount: PropTypes.number.isRequired,
          budgetedAmount: PropTypes.number,
          category: PropTypes.string.isRequired,
          type: PropTypes.string.isRequired,
          date: PropTypes.string.isRequired,
          receipt: PropTypes.string,
        }),
      ),
    }),
  ),
  setBudgets: PropTypes.func.isRequired,
  onDataMutated: PropTypes.func,
}

GoalsScreen.defaultProps = {
  onDataMutated: undefined,
}
