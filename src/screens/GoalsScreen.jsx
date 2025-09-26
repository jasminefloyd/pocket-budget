"use client"

import { useMemo } from "react"
import { useAuth } from "../contexts/AuthContext"

const VIEW_LABELS = {
  budgets: "Budgets",
  details: "Budget Details",
  categories: "Categories",
  ai: "AI Insights",
}

const formatCurrency = (value) => {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

const formatDate = (value) => {
  if (!value) return "No target date"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export default function GoalsScreen({ goals, isPaidUser, onCreateGoal, onExit, previousViewMode, planName }) {
  const { userProfile } = useAuth()

  const displayGoals = useMemo(() => {
    if (goals?.length) {
      return goals
    }

    return [
      {
        id: "sample-goal-1",
        name: "Dream Vacation",
        targetAmount: 3500,
        savedAmount: 1500,
        dueDate: "2025-08-20",
        milestones: [
          { id: "sample-goal-1-m1", name: "Pick the destination", amount: 0, completed: true },
          { id: "sample-goal-1-m2", name: "Book flights", amount: 1200, completed: false },
          { id: "sample-goal-1-m3", name: "Reserve lodging", amount: 2500, completed: false },
          { id: "sample-goal-1-m4", name: "Start itinerary", amount: 3500, completed: false },
        ],
      },
    ]
  }, [goals])

  const previousViewLabel = VIEW_LABELS[previousViewMode] || "Budgets"
  const planDisplay = planName || userProfile?.planTier || "Free"

  return (
    <div className="goals-screen">
      <div className="header-nav">
        <button className="cancelButton secondary-button" onClick={onExit}>
          ← Back to {previousViewLabel}
        </button>
        <button className="primary-button" onClick={onCreateGoal} disabled={!isPaidUser}>
          {isPaidUser ? "Create a Goal" : "Upgrade to Create Goals"}
        </button>
      </div>

      {!isPaidUser && (
        <div className="goal-upgrade-banner">
          <div className="goal-upgrade-content">
            <h2>Unlock Goal Tracking with Pocket Budget Pro</h2>
            <p>
              You're currently on the <strong>{planDisplay}</strong> plan. Upgrade to create custom goals, automate
              milestone reminders, and connect savings accounts.
            </p>
            <ul className="goal-upgrade-list">
              <li>Set unlimited savings goals tailored to your priorities</li>
              <li>Track milestone progress with celebratory insights</li>
              <li>Stay motivated with auto reminders and smart nudges</li>
            </ul>
            <button className="secondary-button goal-upgrade-button" disabled>
              Coming Soon: Upgrade Flow
            </button>
          </div>
        </div>
      )}

      <div className={`goals-grid ${!isPaidUser ? "goals-grid-locked" : ""}`}>
        {displayGoals.map((goal) => {
          const progress = goal.targetAmount
            ? Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100))
            : 0

          return (
            <div key={goal.id} className={`goal-card ${!isPaidUser ? "goal-card-locked" : ""}`}>
              {!isPaidUser && (
                <div className="goal-card-overlay">
                  <span>Upgrade to Pocket Budget Pro to update goal progress</span>
                </div>
              )}

              <div className="goal-card-header">
                <div>
                  <h3 className="goal-title">{goal.name}</h3>
                  <p className="goal-date">Target date: {formatDate(goal.dueDate)}</p>
                </div>
                <div className="goal-progress-stats">
                  <span className="goal-amount">{formatCurrency(goal.savedAmount)}</span>
                  <span className="goal-target">of {formatCurrency(goal.targetAmount)}</span>
                </div>
              </div>

              <div className="goal-progress-bar">
                <div className="goal-progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="goal-progress-meta">{progress}% complete</div>

              <div className="milestones-heading">Milestones</div>
              <div className="milestones-grid">
                {goal.milestones?.map((milestone) => (
                  <div
                    key={milestone.id}
                    className={`milestone-card ${milestone.completed ? "milestone-completed" : ""} ${
                      !isPaidUser ? "milestone-locked" : ""
                    }`}
                  >
                    <div className="milestone-status" aria-hidden>
                      {milestone.completed ? "✅" : "🟡"}
                    </div>
                    <div className="milestone-content">
                      <div className="milestone-title">{milestone.name}</div>
                      {milestone.amount > 0 && (
                        <div className="milestone-amount">{formatCurrency(milestone.amount)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
