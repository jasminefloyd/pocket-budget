"use client"

import { useMemo, useState } from "react"
import { createBudget, updateBudget, deleteBudget } from "../lib/supabase"

const cycleLabels = {
  monthly: "Monthly",
  "per-paycheck": "Per-paycheck",
  custom: "Custom",
}

const premiumCycleTypes = new Set(["per-paycheck", "custom"])

const upgradeMessages = {
  "per-paycheck": "Upgrade to Pocket Budget Plus to plan every paycheck cycle.",
  custom: "Upgrade to Pocket Budget Plus to unlock custom cadences.",
}

const createDefaultCycleSettings = (cycleType) => {
  const today = new Date().toISOString()
  switch (cycleType) {
    case "per-paycheck":
      return {
        anchorDate: today,
        frequency: "per-paycheck",
      }
    case "custom":
      return {
        anchorDate: today,
        lengthInDays: 30,
      }
    default:
      return {
        anchorDate: today,
      }
  }
}

const transformBudgetRecord = (record) => ({
  id: record.id,
  name: record.name,
  createdAt: new Date(record.created_at).toLocaleDateString(),
  categoryBudgets: record.category_budgets || [],
  cycleType: record.cycle_type || "monthly",
  cycleSettings: record.cycle_settings || {},
  transactions: record.transactions || [],
})

export default function BudgetsScreen({
  budgets,
  setSelectedBudget,
  setViewMode,
  setBudgets,
  userId,
  userProfile,
}) {
  const [editingBudgetId, setEditingBudgetId] = useState(null)
  const [budgetNameInput, setBudgetNameInput] = useState("")
  const [openMenuId, setOpenMenuId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showCreateFlow, setShowCreateFlow] = useState(false)
  const [newBudgetName, setNewBudgetName] = useState("My Budget")
  const [selectedCycle, setSelectedCycle] = useState("monthly")
  const [upgradeMessage, setUpgradeMessage] = useState("")

  const isPaidUser = useMemo(() => {
    if (userId === "demo-admin-user-id") {
      return true
    }

    if (!userProfile) {
      return false
    }

    const directFlags = [userProfile.isPaid, userProfile.is_paid, userProfile.isPremium, userProfile.is_premium]
    if (directFlags.some(Boolean)) {
      return true
    }

    const planValues = [
      userProfile.plan,
      userProfile.plan_tier,
      userProfile.planTier,
      userProfile.subscriptionTier,
      userProfile.subscription,
      userProfile.tier,
      userProfile.membership,
      userProfile.accountType,
    ]

    if (
      planValues
        .filter(Boolean)
        .map((value) => value.toString().toLowerCase())
        .some((value) => ["paid", "pro", "plus", "premium"].some((keyword) => value.includes(keyword)))
    ) {
      return true
    }

    const entitlementSources = [
      userProfile.entitlements,
      userProfile.feature_flags,
      userProfile.features,
      userProfile.featureFlags,
    ]

    for (const source of entitlementSources) {
      if (!source) continue

      if (Array.isArray(source)) {
        const hasFlag = source.some((value) => {
          if (typeof value !== "string") return false
          const lower = value.toLowerCase()
          return lower.includes("cadence") || lower.includes("schedule") || lower.includes("premium")
        })
        if (hasFlag) return true
      } else if (typeof source === "object") {
        const hasFlag = Object.values(source).some((value) => {
          if (typeof value === "string") {
            const lower = value.toLowerCase()
            return lower.includes("cadence") || lower.includes("schedule") || lower.includes("premium")
          }
          return Boolean(value)
        })
        if (hasFlag) return true
      }
    }

    return false
  }, [userId, userProfile])

  const canUseCycle = (cycleType) => !premiumCycleTypes.has(cycleType) || isPaidUser

  const formatCycleLabel = (cycleType) => {
    const normalized = (cycleType || "monthly").toLowerCase()
    return cycleLabels[normalized] || cycleLabels.custom
  }

  const startCreateFlow = () => {
    const generateDefaultName = () => {
      const base = "My Budget"
      const existingNames = new Set(budgets.map((b) => b.name))
      if (!existingNames.has(base)) {
        return base
      }
      let index = 2
      while (existingNames.has(`${base} ${index}`)) {
        index += 1
      }
      return `${base} ${index}`
    }

    setNewBudgetName(generateDefaultName())
    setSelectedCycle("monthly")
    setUpgradeMessage("")
    setShowCreateFlow(true)
  }

  const cancelCreateFlow = () => {
    setShowCreateFlow(false)
    setUpgradeMessage("")
  }

  const handleCycleSelect = (cycleType) => {
    const normalized = cycleType.toLowerCase()
    if (!canUseCycle(normalized)) {
      setUpgradeMessage(upgradeMessages[normalized] || "Upgrade to unlock this cadence.")
      return
    }
    setSelectedCycle(normalized)
    setUpgradeMessage("")
  }

  const openBudget = (budget) => {
    setSelectedBudget(budget)
    setViewMode("details")
  }

  const createNewBudget = async () => {
    if (!newBudgetName.trim()) {
      setUpgradeMessage("Give your budget a name to continue.")
      return
    }

    if (!canUseCycle(selectedCycle)) {
      setUpgradeMessage(upgradeMessages[selectedCycle] || "Upgrade to unlock this cadence.")
      return
    }

    setLoading(true)
    try {
      const newBudgetData = {
        name: newBudgetName.trim(),
        categoryBudgets: [],
        cycleType: selectedCycle,
        cycleSettings: createDefaultCycleSettings(selectedCycle),
      }

      const { data, error } = await createBudget(userId, newBudgetData)
      if (error) {
        console.error("Error creating budget:", error)
        alert("Failed to create budget. Please try again.")
      } else if (data?.[0]) {
        const newBudget = transformBudgetRecord(data[0])
        setBudgets([newBudget, ...budgets])
        setShowCreateFlow(false)
        setUpgradeMessage("")
      }
    } catch (error) {
      console.error("Error creating budget:", error)
      alert("Failed to create budget. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const saveBudgetName = async (budget) => {
    if (!budgetNameInput.trim()) {
      setEditingBudgetId(null)
      return
    }

    setLoading(true)
    try {
      const { error } = await updateBudget(budget.id, {
        name: budgetNameInput.trim(),
        categoryBudgets: budget.categoryBudgets,
        cycleType: budget.cycleType,
        cycleSettings: budget.cycleSettings,
      })

      if (error) {
        console.error("Error updating budget:", error)
        alert("Failed to update budget name. Please try again.")
      } else {
        const updated = budgets.map((b) => (b.id === budget.id ? { ...b, name: budgetNameInput.trim() } : b))
        setBudgets(updated)
      }
    } catch (error) {
      console.error("Error updating budget:", error)
      alert("Failed to update budget name. Please try again.")
    } finally {
      setEditingBudgetId(null)
      setLoading(false)
    }
  }

  const duplicateBudget = async (budget) => {
    setLoading(true)
    try {
      const cycleType = (budget.cycleType || "monthly").toLowerCase()
      if (!canUseCycle(cycleType)) {
        alert(upgradeMessages[cycleType] || "Upgrade to duplicate budgets with this cadence.")
        return
      }

      const duplicateData = {
        name: `${budget.name} (Copy)`,
        categoryBudgets: budget.categoryBudgets || [],
        cycleType,
        cycleSettings: budget.cycleSettings || createDefaultCycleSettings(cycleType),
      }

      const { data, error } = await createBudget(userId, duplicateData)
      if (error) {
        console.error("Error duplicating budget:", error)
        alert("Failed to duplicate budget. Please try again.")
      } else if (data?.[0]) {
        const newBudget = transformBudgetRecord(data[0])
        setBudgets([newBudget, ...budgets])
      }
    } catch (error) {
      console.error("Error duplicating budget:", error)
      alert("Failed to duplicate budget. Please try again.")
    } finally {
      setOpenMenuId(null)
      setLoading(false)
    }
  }

  const deleteBudgetHandler = async (budgetId) => {
    setLoading(true)
    try {
      const { error } = await deleteBudget(budgetId)
      if (error) {
        console.error("Error deleting budget:", error)
        alert("Failed to delete budget. Please try again.")
      } else {
        setBudgets(budgets.filter((b) => b.id !== budgetId))
      }
    } catch (error) {
      console.error("Error deleting budget:", error)
      alert("Failed to delete budget. Please try again.")
    } finally {
      setOpenMenuId(null)
      setLoading(false)
    }
  }

  const renderCreateFlow = () => {
    if (!showCreateFlow) return null

    const cycles = [
      {
        type: "monthly",
        title: "Monthly",
        description: "Reset your budget every calendar month.",
        icon: "📅",
      },
      {
        type: "per-paycheck",
        title: "Per-paycheck",
        description: "Plan every paycheck and manage mid-cycle cash flow.",
        icon: "💼",
      },
      {
        type: "custom",
        title: "Custom",
        description: "Choose bespoke anchors and durations for any workflow.",
        icon: "⚙️",
      },
    ]

    return (
      <div
        className="create-budget-panel"
        style={{
          marginBottom: "2rem",
          padding: "1.5rem",
          borderRadius: "1rem",
          background: "var(--card-bg, #ffffff)",
          boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
        }}
      >
        <h3 className="overview-title" style={{ marginBottom: "1rem" }}>
          Create a New Budget
        </h3>
        <label className="stat-label" htmlFor="budget-name-input">
          Budget name
        </label>
        <input
          id="budget-name-input"
          className="input budget-name-input"
          value={newBudgetName}
          onChange={(e) => setNewBudgetName(e.target.value)}
          placeholder="My Budget"
          disabled={loading}
        />

        <div className="cycle-options" style={{ marginTop: "1.5rem" }}>
          <p className="chart-section-title" style={{ marginBottom: "0.5rem" }}>
            Choose your budget cadence
          </p>
          <div
            className="cycle-options-grid"
            style={{
              display: "grid",
              gap: "1rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            }}
          >
            {cycles.map((cycle) => {
              const normalized = cycle.type.toLowerCase()
              const isPremium = premiumCycleTypes.has(normalized)
              const isLocked = isPremium && !isPaidUser
              const isActive = selectedCycle === normalized && !isLocked

              return (
                <button
                  key={cycle.type}
                  type="button"
                  className={`cycle-option ${isActive ? "active" : ""} ${isLocked ? "locked" : ""}`}
                  onClick={() => handleCycleSelect(normalized)}
                  disabled={loading}
                  style={{
                    textAlign: "left",
                    border: isActive ? "2px solid #6366f1" : "1px solid rgba(148, 163, 184, 0.4)",
                    borderRadius: "0.75rem",
                    padding: "1rem",
                    background: isActive ? "rgba(99, 102, 241, 0.08)" : "rgba(255,255,255,0.02)",
                    cursor: isLocked ? "not-allowed" : "pointer",
                    opacity: isLocked ? 0.6 : 1,
                    transition: "border 0.2s ease, background 0.2s ease",
                  }}
                >
                  <div className="cycle-option-header" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <span className="cycle-option-icon" style={{ fontSize: "1.25rem" }}>
                      {cycle.icon}
                    </span>
                    <span className="cycle-option-title" style={{ fontWeight: 600 }}>
                      {cycle.title}
                    </span>
                    {isPremium && (
                      <span className="cycle-option-lock" title="Pocket Budget Plus required">
                        🔒
                      </span>
                    )}
                  </div>
                  <p className="cycle-option-description" style={{ marginTop: "0.5rem", color: "#475569" }}>
                    {cycle.description}
                  </p>
                  {isLocked && (
                    <p className="cycle-option-upgrade" style={{ marginTop: "0.75rem", color: "#b91c1c", fontWeight: 600 }}>
                      Upgrade required
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {upgradeMessage && (
          <div
            className="upgrade-callout"
            style={{
              marginTop: "1rem",
              padding: "0.75rem 1rem",
              borderRadius: "0.75rem",
              background: "#fef3c7",
              color: "#92400e",
              fontWeight: 600,
            }}
          >
            <span>🚀 {upgradeMessage}</span>
          </div>
        )}

        <div className="budget-actions" style={{ marginTop: "1rem" }}>
          <button className="addButton primary-button" onClick={createNewBudget} disabled={loading}>
            {loading ? "Creating..." : "Create Budget"}
          </button>
          <button className="cancelButton secondary-button" onClick={cancelCreateFlow} disabled={loading}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="header-section">
        <p className="tagline">Manage your budgets and stay on top of your finances.</p>
      </div>

      {budgets.length === 0 ? (
        <div className="empty-state">
          <p>Welcome to Pocket Budget! Create your first budget to get started.</p>
          {showCreateFlow ? (
            renderCreateFlow()
          ) : (
            <button className="primary-button" onClick={startCreateFlow} disabled={loading}>
              Start Your First Budget
            </button>
          )}
        </div>
      ) : (
        <>
          {renderCreateFlow()}
          {budgets.map((budget) => {
            const totalIncome = (budget.transactions || [])
              .filter((t) => t.type === "income")
              .reduce((sum, t) => sum + t.amount, 0)

            const totalExpenses = (budget.transactions || [])
              .filter((t) => t.type === "expense")
              .reduce((sum, t) => sum + t.amount, 0)

            const balance = totalIncome - totalExpenses

            // Category budget summaries
            const categorySummaries = (budget.categoryBudgets || []).map((cat) => {
              const actual = (budget.transactions || [])
                .filter(
                  (t) =>
                    t.type === "expense" && t.category.toLowerCase().trim() === cat.category.toLowerCase().trim(),
                )
                .reduce((sum, t) => sum + t.amount, 0)

              const isOver = actual > cat.budgetedAmount
              return { ...cat, actual, isOver }
            })

            const isAnyCategoryOver = categorySummaries.some((cat) => cat.isOver)

            const cycleType = (budget.cycleType || "monthly").toLowerCase()
            const displayCycle = formatCycleLabel(cycleType)
            const isPremiumCycle = premiumCycleTypes.has(cycleType)

            return (
              <div key={budget.id} className="budgetCard">
                <div className="budgetCard-content">
                  <div className="budgetCard-info" onClick={() => openBudget(budget)}>
                  {editingBudgetId === budget.id ? (
                    <input
                      className="input budget-name-input"
                      value={budgetNameInput}
                      onChange={(e) => setBudgetNameInput(e.target.value)}
                      onBlur={() => saveBudgetName(budget)}
                      onKeyPress={(e) => {
                        if (e.key === "Enter") {
                          saveBudgetName(budget)
                        }
                      }}
                      autoFocus
                      disabled={loading}
                    />
                  ) : (
                    <div
                      className="budgetName"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingBudgetId(budget.id)
                        setBudgetNameInput(budget.name)
                      }}
                    >
                      {budget.name}
                      {isAnyCategoryOver && (
                        <span className="expense" style={{ marginLeft: "0.5rem" }}>
                          🚩
                        </span>
                      )}
                    </div>
                  )}

                  <div className="budgetBalance">
                    Balance: <span className={balance >= 0 ? "income" : "expense"}>${balance.toFixed(2)}</span>
                  </div>

                  <div className="budgetCycle">
                    Cycle: {displayCycle}
                    {isPremiumCycle && (
                      <span className="cycle-option-lock" title="Pocket Budget Plus cadence" style={{ marginLeft: "0.35rem" }}>
                        🔒
                      </span>
                    )}
                  </div>

                  <div className="budgetDate">Created: {budget.createdAt}</div>

                  {categorySummaries.length > 0 && (
                    <div className="category-budgets">
                      {categorySummaries.slice(0, 3).map((cat) => (
                        <div key={cat.category} className="category-budget-row">
                          <div className="category-budget-name">
                            {cat.category}
                            {cat.isOver && (
                              <span className="expense" style={{ marginLeft: "0.3rem" }}>
                                ⚠
                              </span>
                            )}
                          </div>
                          <div className="category-budget-amounts">
                            ${cat.actual.toFixed(2)} / ${cat.budgetedAmount.toFixed(2)}
                          </div>
                          <div className="progress-bar">
                            <div
                              className={`progress-fill ${cat.isOver ? "over" : ""}`}
                              style={{
                                width: `${Math.min((cat.actual / cat.budgetedAmount) * 100, 100)}%`,
                              }}
                            ></div>
                          </div>
                        </div>
                      ))}
                      {categorySummaries.length > 3 && (
                        <div className="category-budget-more">+{categorySummaries.length - 3} more categories</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Options Menu Button */}
                <div className="menuContainer">
                  <button
                    className="menuButton"
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenMenuId(openMenuId === budget.id ? null : budget.id)
                    }}
                    title="More options"
                    disabled={loading}
                  >
                    ⋮
                  </button>

                  {openMenuId === budget.id && (
                    <div className="dropdownMenu">
                      <button
                        className="dropdownItem"
                        onClick={(e) => {
                          e.stopPropagation()
                          duplicateBudget(budget)
                        }}
                        disabled={loading}
                      >
                        Copy Budget
                      </button>
                      <button
                        className="dropdownItem delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`Are you sure you want to delete "${budget.name}"?`)) {
                            deleteBudgetHandler(budget.id)
                          }
                        }}
                        disabled={loading}
                      >
                        Delete Budget
                      </button>
                    </div>
                  )}
                </div>
                </div>
              </div>
            )
          })}
        </>
      )}

      {budgets.length > 0 && (
        <div className="budget-actions">
          <button className="addButton primary-button" onClick={startCreateFlow} disabled={loading}>
            Create New Budget
          </button>
          <button className="cancelButton secondary-button cate-btn" onClick={() => setViewMode("categories")}>
            Manage Categories
          </button>
        </div>
      )}
    </div>
  )
}
