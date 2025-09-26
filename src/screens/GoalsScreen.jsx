"use client"

import { useEffect, useMemo, useState } from "react"
import { createGoal, logGoalContribution } from "../lib/supabase"

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const formatCurrency = (value) => currencyFormatter.format(Number(value || 0))

const formatDate = (dateString) => {
  if (!dateString) {
    return "No target date"
  }
  const parsed = new Date(dateString)
  if (Number.isNaN(parsed.getTime())) {
    return "No target date"
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

const computeGoalStatus = (goal) => {
  const now = new Date()
  const createdAt = goal.createdAt ? new Date(goal.createdAt) : now
  const targetDate = goal.targetDate ? new Date(goal.targetDate) : now

  const totalDuration = targetDate.getTime() - createdAt.getTime()
  const elapsedDuration = now.getTime() - createdAt.getTime()
  const targetAmount = Number(goal.targetAmount || 0)
  const currentAmount = Number(goal.currentAmount || 0)

  let expectedAmount = targetAmount
  if (totalDuration > 0) {
    const progressRatio = Math.min(Math.max(elapsedDuration / totalDuration, 0), 1)
    expectedAmount = Number((targetAmount * progressRatio).toFixed(2))
  }

  if (currentAmount >= targetAmount && targetAmount > 0) {
    return { label: "Completed", variant: "completed", expectedAmount }
  }

  if (now > targetDate) {
    return { label: "Behind", variant: "behind", expectedAmount }
  }

  if (currentAmount >= expectedAmount) {
    return { label: "Ahead", variant: "ahead", expectedAmount }
  }

  const tolerance = targetAmount * 0.05
  if (currentAmount + tolerance >= expectedAmount) {
    return { label: "On Track", variant: "on-track", expectedAmount }
  }

  return { label: "Behind", variant: "behind", expectedAmount }
}

const computeWeeklyGuidance = (goal) => {
  const targetAmount = Number(goal.targetAmount || 0)
  const currentAmount = Number(goal.currentAmount || 0)
  const remaining = Math.max(targetAmount - currentAmount, 0)
  if (remaining <= 0) {
    return "Goal achieved! 🎉"
  }

  const targetDate = goal.targetDate ? new Date(goal.targetDate) : null
  if (!targetDate || Number.isNaN(targetDate.getTime())) {
    return `Add ${formatCurrency(remaining)} to reach this goal.`
  }

  const now = new Date()
  const daysRemaining = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (daysRemaining <= 0) {
    return `Catch up with ${formatCurrency(remaining)} to hit your goal.`
  }

  const weeksRemaining = Math.max(daysRemaining / 7, 1)
  const weeklyAmount = remaining / weeksRemaining
  return `Add ${formatCurrency(weeklyAmount)} this week to stay on track.`
}

const getNextMilestone = (goal) => {
  return (goal.milestones || []).find((milestone) => milestone && !milestone.achieved_at)
}

const keypadLayout = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["00", "0", "⌫"],
]

const initialGoalForm = { name: "", targetAmount: "", targetDate: "" }

export default function GoalsScreen({ goals, setGoals, setViewMode, userId, userProfile }) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newGoal, setNewGoal] = useState(initialGoalForm)
  const [isSavingGoal, setIsSavingGoal] = useState(false)
  const [goalError, setGoalError] = useState("")

  const [showContributionModal, setShowContributionModal] = useState(false)
  const [contributionGoalId, setContributionGoalId] = useState(() => goals?.[0]?.id || "")
  const [contributionInput, setContributionInput] = useState("")
  const [contributionError, setContributionError] = useState("")
  const [isLoggingContribution, setIsLoggingContribution] = useState(false)
  const [celebration, setCelebration] = useState(null)

  const subscriptionStatus = userProfile?.subscription_status || "trial"
  const trialEndsAt = userProfile?.trial_ends_at ? new Date(userProfile.trial_ends_at) : null
  const entitlements = userProfile?.entitlements || {}
  const isTrialActive =
    subscriptionStatus === "trial"
      ? !trialEndsAt || trialEndsAt.getTime() > Date.now()
      : false
  const hasPaidAccess = subscriptionStatus === "paid"
  const hasGoalEntitlement = Boolean(entitlements?.goals)
  const canCreateGoal = hasPaidAccess || isTrialActive || hasGoalEntitlement

  const sortedGoals = useMemo(() => {
    return [...(goals || [])].sort((a, b) => {
      const aDate = a.targetDate ? new Date(a.targetDate) : new Date(a.createdAt || 0)
      const bDate = b.targetDate ? new Date(b.targetDate) : new Date(b.createdAt || 0)
      return aDate.getTime() - bDate.getTime()
    })
  }, [goals])

  useEffect(() => {
    if (!sortedGoals.length) {
      if (contributionGoalId) {
        setContributionGoalId("")
      }
      return
    }

    const goalExists = sortedGoals.some((goal) => goal.id === contributionGoalId)
    if (!goalExists) {
      setContributionGoalId(sortedGoals[0].id)
    }
  }, [sortedGoals, contributionGoalId])

  const openCreateForm = () => {
    if (!canCreateGoal) {
      return
    }
    setGoalError("")
    setShowCreateForm(true)
  }

  const handleCreateGoal = async (event) => {
    event.preventDefault()
    if (!canCreateGoal) {
      return
    }

    if (!newGoal.name.trim()) {
      setGoalError("Name is required.")
      return
    }

    const parsedTargetAmount = Number(newGoal.targetAmount)
    if (!parsedTargetAmount || parsedTargetAmount <= 0) {
      setGoalError("Enter a target amount greater than $0.")
      return
    }

    if (!newGoal.targetDate) {
      setGoalError("Choose a target date.")
      return
    }

    setIsSavingGoal(true)
    setGoalError("")

    try {
      const { data, error } = await createGoal(userId, {
        name: newGoal.name.trim(),
        targetAmount: parsedTargetAmount,
        targetDate: newGoal.targetDate,
      })

      if (error) {
        setGoalError(error.message || "Unable to create goal. Please try again.")
        return
      }

      if (data) {
        setGoals((previous) => [data, ...(previous || [])])
        setNewGoal(initialGoalForm)
        setShowCreateForm(false)
        setContributionGoalId(data.id)
      }
    } catch (error) {
      console.error("Error creating goal", error)
      setGoalError("Unexpected error creating goal. Please try again.")
    } finally {
      setIsSavingGoal(false)
    }
  }

  const formattedContributionAmount = formatCurrency(Number(contributionInput || "0") / 100)

  const handleKeypadPress = (value) => {
    if (isLoggingContribution) {
      return
    }

    if (value === "⌫") {
      setContributionInput((previous) => previous.slice(0, -1))
      return
    }

    setContributionInput((previous) => {
      const next = `${previous}${value}`
      const trimmed = next.replace(/^0+(?=\d)/, "")
      return trimmed.length > 9 ? previous : trimmed
    })
  }

  const clearContribution = () => {
    if (!isLoggingContribution) {
      setContributionInput("")
      setContributionError("")
    }
  }

  const handleContributionSubmit = async () => {
    if (!contributionGoalId) {
      setContributionError("Select a goal to log your contribution.")
      return
    }

    const goal = sortedGoals.find((item) => item.id === contributionGoalId)
    if (!goal) {
      setContributionError("Selected goal is no longer available.")
      return
    }

    const amount = Number(contributionInput || "0") / 100
    if (!amount || amount <= 0) {
      setContributionError("Enter an amount greater than $0.00.")
      return
    }

    setIsLoggingContribution(true)
    setContributionError("")

    try {
      const { data, error } = await logGoalContribution(userId, goal, amount)
      if (error) {
        setContributionError(error.message || "Could not log this contribution.")
        return
      }

      if (data?.goal) {
        setGoals((previousGoals) =>
          (previousGoals || []).map((existingGoal) =>
            existingGoal.id === data.goal.id ? data.goal : existingGoal,
          ),
        )

        if (data.celebratedMilestones?.length) {
          const milestone = data.celebratedMilestones[0]
          const milestoneLabel = milestone?.label
            ? milestone.label
            : formatCurrency(milestone?.amount)
          setCelebration({
            message: `${data.goal.name} reached ${milestoneLabel}!`,
          })
        } else if (data.goal.currentAmount >= data.goal.targetAmount) {
          setCelebration({ message: `${data.goal.name} is fully funded! 🎉` })
        }
      }

      setContributionInput("")
      setShowContributionModal(false)
    } catch (error) {
      console.error("Error logging contribution", error)
      setContributionError("Unexpected error logging contribution.")
    } finally {
      setIsLoggingContribution(false)
    }
  }

  const emptyState = sortedGoals.length === 0
  const nextMilestoneForGoal = (goal) => getNextMilestone(goal)

  return (
    <div className="goals-container">
      <div className="goals-header">
        <div>
          <h2>Goals</h2>
          <p className="goals-subtitle">Track progress towards the things that matter most.</p>
        </div>
        <button className="primary-button" onClick={openCreateForm} disabled={!canCreateGoal}>
          Create Goal
        </button>
      </div>

      {!canCreateGoal && (
        <div className="goal-lock">
          <span role="img" aria-label="Locked feature">
            🔒
          </span>
          <div>
            <p className="goal-lock-title">Goal creation is a premium feature.</p>
            <p className="goal-lock-copy">
              Access it during your free trial or with a Pocket Budget Pro subscription.
            </p>
          </div>
        </div>
      )}

      {celebration && (
        <div className="goal-celebration">
          <span className="goal-celebration-icon">🎉</span>
          <p className="goal-celebration-message">{celebration.message}</p>
          <button className="goal-celebration-close" onClick={() => setCelebration(null)}>
            ×
          </button>
        </div>
      )}

      {showCreateForm && (
        <form className="goal-create-form" onSubmit={handleCreateGoal}>
          <div className="goal-form-row">
            <label htmlFor="goal-name">Goal name</label>
            <input
              id="goal-name"
              type="text"
              value={newGoal.name}
              onChange={(event) => setNewGoal((previous) => ({ ...previous, name: event.target.value }))}
              placeholder="Emergency fund"
              required
            />
          </div>
          <div className="goal-form-row">
            <label htmlFor="goal-amount">Target amount</label>
            <input
              id="goal-amount"
              type="number"
              min="0"
              step="0.01"
              value={newGoal.targetAmount}
              onChange={(event) => setNewGoal((previous) => ({ ...previous, targetAmount: event.target.value }))}
              placeholder="2500"
              required
            />
          </div>
          <div className="goal-form-row">
            <label htmlFor="goal-date">Target date</label>
            <input
              id="goal-date"
              type="date"
              value={newGoal.targetDate}
              onChange={(event) => setNewGoal((previous) => ({ ...previous, targetDate: event.target.value }))}
              required
            />
          </div>

          {goalError && <p className="goal-error">{goalError}</p>}

          <div className="goal-form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setShowCreateForm(false)
                setNewGoal(initialGoalForm)
                setGoalError("")
              }}
            >
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={isSavingGoal}>
              {isSavingGoal ? "Saving..." : "Save goal"}
            </button>
          </div>
        </form>
      )}

      {emptyState && !showCreateForm && (
        <div className="goal-empty-state">
          <h3>Start your first goal</h3>
          <p>Give your savings a job and Pocket Budget will track your progress for you.</p>
          <button className="primary-button" onClick={openCreateForm} disabled={!canCreateGoal}>
            Create a goal
          </button>
          <button className="secondary-button" onClick={() => setViewMode("budgets")}>Back to budgets</button>
        </div>
      )}

      <div className="goal-list">
        {sortedGoals.map((goal) => {
          const status = computeGoalStatus(goal)
          const guidance = computeWeeklyGuidance(goal)
          const nextMilestone = nextMilestoneForGoal(goal)
          const progressPercent = goal.targetAmount
            ? Math.min((Number(goal.currentAmount || 0) / Number(goal.targetAmount)) * 100, 100)
            : 0
          const recentContributions = (goal.contributions || []).slice(0, 3)

          return (
            <div className="goal-card" key={goal.id}>
              <div className="goal-card-header">
                <div className="goal-card-title">
                  <h3>{goal.name}</h3>
                  <p>
                    Target {formatCurrency(goal.targetAmount)} by {formatDate(goal.targetDate)}
                  </p>
                </div>
                <span className={`goal-badge ${status.variant}`}>{status.label}</span>
              </div>

              <div className="goal-progress">
                <div className="goal-progress-row">
                  <span className="goal-progress-amount">{formatCurrency(goal.currentAmount)}</span>
                  <span className="goal-progress-target">of {formatCurrency(goal.targetAmount)}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progressPercent}%` }}></div>
                </div>
                <div className="goal-progress-expected">
                  Expected by now: {formatCurrency(status.expectedAmount)}
                </div>
              </div>

              <div className="goal-guidance">{guidance}</div>

              {nextMilestone && (
                <div className="goal-next-milestone">
                  Next milestone: {formatCurrency(nextMilestone.amount)} ({nextMilestone.label})
                </div>
              )}

              <div className="goal-milestones">
                {(goal.milestones || []).map((milestone) => (
                  <div
                    key={`${milestone.label}-${milestone.amount}`}
                    className={`goal-milestone ${milestone.achieved_at ? "achieved" : ""}`}
                  >
                    <span className="goal-milestone-amount">{formatCurrency(milestone.amount)}</span>
                    <span className="goal-milestone-label">{milestone.label}</span>
                  </div>
                ))}
              </div>

              <div className="goal-recent">
                <h4>Recent contributions</h4>
                {recentContributions.length === 0 ? (
                  <p className="goal-recent-empty">No contributions yet.</p>
                ) : (
                  <ul>
                    {recentContributions.map((contribution) => (
                      <li key={contribution.id}>
                        <span>{formatCurrency(contribution.amount)}</span>
                        <span>{formatDate(contribution.contributedAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="goal-actions">
                <button
                  className="secondary-button"
                  onClick={() => {
                    setContributionGoalId(goal.id)
                    setShowContributionModal(true)
                    setContributionError("")
                  }}
                >
                  Log contribution
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <button
        className="goal-fab"
        onClick={() => {
          if (!sortedGoals.length) {
            return
          }
          setShowContributionModal(true)
          setContributionError("")
        }}
        disabled={!sortedGoals.length}
        aria-label="Log a contribution"
      >
        ➕
      </button>

      {showContributionModal && (
        <div className="goal-contribution-modal">
          <div className="goal-contribution-content">
            <div className="goal-contribution-header">
              <h3>Log contribution</h3>
              <button className="goal-contribution-close" onClick={() => setShowContributionModal(false)}>
                ×
              </button>
            </div>

            <label className="goal-select-label" htmlFor="goal-select">
              Which goal?
            </label>
            <select
              id="goal-select"
              className="goal-select"
              value={contributionGoalId}
              onChange={(event) => setContributionGoalId(event.target.value)}
            >
              {sortedGoals.map((goal) => (
                <option value={goal.id} key={goal.id}>
                  {goal.name}
                </option>
              ))}
            </select>

            <div className="goal-contribution-display">
              <span>{formattedContributionAmount}</span>
              <button type="button" onClick={clearContribution} className="goal-clear-button">
                Clear
              </button>
            </div>

            <div className="goal-keypad">
              {keypadLayout.map((row) => (
                <div className="goal-keypad-row" key={row.join("-")}>
                  {row.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleKeypadPress(key)}
                      className="goal-keypad-button"
                    >
                      {key}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {contributionError && <p className="goal-error">{contributionError}</p>}

            <div className="goal-contribution-actions">
              <button type="button" className="secondary-button" onClick={() => setShowContributionModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleContributionSubmit}
                disabled={isLoggingContribution}
              >
                {isLoggingContribution ? "Saving..." : "Add contribution"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
