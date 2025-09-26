"use client"

import { useMemo, useState } from "react"
import { createBudget, updateBudget, deleteBudget } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"

export default function BudgetsScreen({ budgets, setSelectedBudget, setViewMode, setBudgets, userId }) {
  const { userProfile } = useAuth()
  const [editingBudgetId, setEditingBudgetId] = useState(null)
  const [budgetNameInput, setBudgetNameInput] = useState("")
  const [openMenuId, setOpenMenuId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [selectedCycleType, setSelectedCycleType] = useState("monthly")
  const [payFrequencyDays, setPayFrequencyDays] = useState(14)
  const [customDurationDays, setCustomDurationDays] = useState(30)

  const planTierRaw = userProfile?.planTier ?? userProfile?.plan ?? "Free"
  const normalizedPlanTier = useMemo(() => {
    if (typeof planTierRaw === "string") {
      return planTierRaw.toLowerCase()
    }
    return String(planTierRaw || "free").toLowerCase()
  }, [planTierRaw])
  const isFreePlan = normalizedPlanTier === "free"

  const cycleOptions = [
    {
      value: "monthly",
      label: "Monthly",
      description: "Reset your budget every calendar month.",
      gated: false,
    },
    {
      value: "per_paycheck",
      label: "Per-paycheck",
      description: "Sync your budget cadence with each paycheck.",
      gated: true,
    },
    {
      value: "custom",
      label: "Custom",
      description: "Choose a custom period that works for you.",
      gated: true,
    },
  ]

  const cycleLabels = {
    monthly: "Monthly",
    per_paycheck: "Per-paycheck",
    custom: "Custom",
  }

  const isCycleTypeGated = (cycleType) => ["per_paycheck", "custom"].includes(cycleType)

  const openBudget = (budget) => {
    setSelectedBudget(budget)
    setViewMode("details")
  }

  const createNewBudget = () => {
    setSelectedCycleType("monthly")
    setPayFrequencyDays(14)
    setCustomDurationDays(30)
    setShowCreateDialog(true)
  }

  const closeCreateDialog = () => {
    if (!loading) {
      setShowCreateDialog(false)
    }
  }

  const handleConfirmCreateBudget = async () => {
    if (isFreePlan && ["per_paycheck", "custom"].includes(selectedCycleType)) {
      return
    }

    setLoading(true)
    try {
      let cycleSettings = null
      if (selectedCycleType === "per_paycheck") {
        const frequency = Number.parseInt(payFrequencyDays, 10)
        cycleSettings = {
          payFrequencyDays: Number.isNaN(frequency) || frequency < 1 ? 14 : frequency,
        }
      } else if (selectedCycleType === "custom") {
        const duration = Number.parseInt(customDurationDays, 10)
        cycleSettings = {
          durationDays: Number.isNaN(duration) || duration < 1 ? 30 : duration,
        }
      }

      const newBudgetData = {
        name: `My Budget`,
        categoryBudgets: [],
        cycleType: selectedCycleType,
        cycleSettings,
      }

      const { data, error } = await createBudget(userId, newBudgetData)
      if (error) {
        console.error("Error creating budget:", error)
        alert("Failed to create budget. Please try again.")
      } else if (data?.[0]) {
        const newBudget = {
          id: data[0].id,
          name: data[0].name,
          createdAt: new Date(data[0].created_at).toLocaleDateString(),
          categoryBudgets: data[0].category_budgets || [],
          cycleType: data[0].cycle_type || selectedCycleType,
          cycleSettings: data[0].cycle_settings ?? cycleSettings,
          transactions: [],
        }
        setBudgets([newBudget, ...budgets])
        setShowCreateDialog(false)
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
      const duplicateData = {
        name: `${budget.name} (Copy)`,
        categoryBudgets: budget.categoryBudgets || [],
        cycleType: budget.cycleType || "monthly",
        cycleSettings: budget.cycleSettings ?? null,
      }

      const { data, error } = await createBudget(userId, duplicateData)
      if (error) {
        console.error("Error duplicating budget:", error)
        alert("Failed to duplicate budget. Please try again.")
      } else if (data?.[0]) {
        const newBudget = {
          id: data[0].id,
          name: data[0].name,
          createdAt: new Date(data[0].created_at).toLocaleDateString(),
          categoryBudgets: data[0].category_budgets || [],
          cycleType: data[0].cycle_type || duplicateData.cycleType,
          cycleSettings: data[0].cycle_settings ?? duplicateData.cycleSettings,
          transactions: [],
        }
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

  return (
    <div>
      <div className="header-section">
        <p className="tagline">Manage your budgets and stay on top of your finances.</p>
      </div>

      {budgets.length === 0 ? (
        <div className="empty-state">
          <p>Welcome to Pocket Budget! Create your first budget to get started.</p>
          <button className="primary-button" onClick={createNewBudget} disabled={loading}>
            {loading ? "Please wait..." : "Create Your First Budget"}
          </button>
        </div>
      ) : (
        budgets.map((budget) => {
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
                (t) => t.type === "expense" && t.category.toLowerCase().trim() === cat.category.toLowerCase().trim(),
              )
              .reduce((sum, t) => sum + t.amount, 0)

            const isOver = actual > cat.budgetedAmount
            return { ...cat, actual, isOver }
          })

          const isAnyCategoryOver = categorySummaries.some((cat) => cat.isOver)
          const cycleType = budget.cycleType || "monthly"
          const cycleLabel = cycleLabels[cycleType] || cycleLabels.monthly
          const cycleIsGated = isCycleTypeGated(cycleType)

          return (
            <div key={budget.id} className="budgetCard">
              <div className="budgetCard-content">
                <div className="budgetCard-info" onClick={() => openBudget(budget)}>
                  <div className="budgetCard-headerRow">
                    <div className="budgetNameWrapper">
                      {editingBudgetId === budget.id ? (
                        <input
                          className="input budget-name-input"
                          value={budgetNameInput}
                          onChange={(e) => setBudgetNameInput(e.target.value)}
                          onBlur={() => saveBudgetName(budget)}
                          onClick={(e) => e.stopPropagation()}
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
                    </div>
                    <div
                      className={`budgetCycleLabel ${cycleIsGated ? "locked" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                      title={`${cycleLabel} cycle${cycleIsGated ? " (Premium)" : ""}`}
                    >
                      {cycleIsGated && <span className="cycleLockIcon">🔒</span>}
                      <span>{cycleLabel}</span>
                    </div>
                  </div>

                  <div className="budgetBalance">
                    Balance: <span className={balance >= 0 ? "income" : "expense"}>${balance.toFixed(2)}</span>
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
        })
      )}

      {budgets.length > 0 && (
        <div className="budget-actions">
          <button className="addButton primary-button" onClick={createNewBudget} disabled={loading}>
            {loading ? "Please wait..." : "Create New Budget"}
          </button>
          <button className="cancelButton secondary-button cate-btn" onClick={() => setViewMode("categories")}>
            Manage Categories
          </button>
        </div>
      )}

      {showCreateDialog && (
        <div className="modalBackdrop">
          <div className="modalContent enhanced-modal createBudgetModal">
            <h2 className="header modal-header">Choose a budget cycle</h2>
            <p className="modal-subtitle">Pick how often this budget should reset.</p>

            <div className="cycleOptions">
              {cycleOptions.map((option) => {
                const isLocked = option.gated && isFreePlan
                const isSelected = selectedCycleType === option.value
                const optionClassNames = [
                  "cycleOption",
                  isSelected && !isLocked ? "selected" : "",
                  isLocked ? "locked" : "",
                ]
                  .filter(Boolean)
                  .join(" ")

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={optionClassNames}
                    onClick={() => {
                      if (isLocked) return
                      setSelectedCycleType(option.value)
                    }}
                    disabled={isLocked}
                  >
                    <div className="cycleOption-text">
                      <div className="cycleOption-label">
                        {isLocked && <span className="cycleLockIcon">🔒</span>}
                        {option.label}
                      </div>
                      <div className="cycleOption-description">{option.description}</div>
                    </div>
                    {isSelected && !isLocked && <span className="cycleOption-selected">✓</span>}
                  </button>
                )
              })}
            </div>

            {selectedCycleType === "per_paycheck" && !isFreePlan && (
              <div className="cycleSettingsRow">
                <label className="cycleSettingsLabel" htmlFor="payFrequencyDays">
                  Pay frequency (days)
                </label>
                <input
                  id="payFrequencyDays"
                  type="number"
                  min="1"
                  className="input"
                  value={payFrequencyDays}
                  onChange={(e) => setPayFrequencyDays(e.target.value)}
                />
              </div>
            )}

            {selectedCycleType === "custom" && !isFreePlan && (
              <div className="cycleSettingsRow">
                <label className="cycleSettingsLabel" htmlFor="customDurationDays">
                  Custom cycle length (days)
                </label>
                <input
                  id="customDurationDays"
                  type="number"
                  min="1"
                  className="input"
                  value={customDurationDays}
                  onChange={(e) => setCustomDurationDays(e.target.value)}
                />
              </div>
            )}

            {isFreePlan && (
              <div className="upgradeCta">
                <p>Upgrade to unlock Per-paycheck and Custom budget cycles.</p>
                <a
                  className="upgradeCta-link"
                  href="https://pocketbudget.app/upgrade"
                  target="_blank"
                  rel="noreferrer"
                >
                  Upgrade your plan
                </a>
              </div>
            )}

            <div className="modal-actions">
              <button
                className="addButton primary-button"
                onClick={handleConfirmCreateBudget}
                disabled={loading || (isFreePlan && isCycleTypeGated(selectedCycleType))}
              >
                {loading ? "Creating..." : "Create Budget"}
              </button>
              <button className="cancelButton secondary-button" onClick={closeCreateDialog} disabled={loading}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
