"use client"

import { useMemo, useState } from "react"
import PropTypes from "prop-types"
import { createBudget, updateBudget, deleteBudget } from "../lib/supabase"
import { calculateBudgetPacing } from "../lib/pacing"

const DEFAULT_CATEGORY_ALLOCATIONS = [
  { category: "Rent", budgetedAmount: 1200 },
  { category: "Groceries", budgetedAmount: 450 },
  { category: "Transportation", budgetedAmount: 180 },
  { category: "Bills", budgetedAmount: 320 },
  { category: "Entertainment", budgetedAmount: 150 },
  { category: "Shopping", budgetedAmount: 120 },
  { category: "Dining Out", budgetedAmount: 160 },
  { category: "Emergency Fund", budgetedAmount: 100 },
]

const CYCLE_OPTIONS = [
  {
    type: "monthly",
    label: "Monthly",
    description: "Resets on the first of each month.",
  },
  {
    type: "per-paycheck",
    label: "Per-paycheck",
    description: "Sync budgets to each paycheck.",
  },
  {
    type: "custom",
    label: "Custom",
    description: "Choose any cycle length you need.",
  },
]

const getCycleLabel = (type) => {
  const option = CYCLE_OPTIONS.find((candidate) => candidate.type === type)
  if (option) {
    return option.label
  }
  if (!type) return "Monthly"
  return type
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
}

const buildInitialConfig = (existingBudgetsLength) => ({
  name: existingBudgetsLength === 0 ? "My First Budget" : "My Budget",
  cycleType: "monthly",
  startDate: new Date().toISOString().split("T")[0],
  payFrequencyDays: 14,
  customDays: 30,
  includeDefaultCategories: true,
})

const formatCurrency = (value) => `$${Number.parseFloat(value || 0).toFixed(2)}`

export default function BudgetsScreen({
  budgets,
  setSelectedBudget,
  setViewMode,
  setBudgets,
  userId,
  onMetadataChange,
  onMetadataRemove,
  onDataMutated,
}) {
  const [editingBudgetId, setEditingBudgetId] = useState(null)
  const [budgetNameInput, setBudgetNameInput] = useState("")
  const [openMenuId, setOpenMenuId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createConfig, setCreateConfig] = useState(() => buildInitialConfig(budgets.length))

  const cycleSummary = useMemo(
    () =>
      budgets.reduce(
        (acc, budget) => {
          const type = budget?.cycleMetadata?.type || "monthly"
          acc[type] = (acc[type] || 0) + 1
          return acc
        },
        {},
      ),
    [budgets],
  )

  const openBudget = (budget) => {
    setOpenMenuId(null)
    setSelectedBudget(budget)
    setViewMode("details")
  }

  const resetCreateModal = () => {
    setCreateConfig(buildInitialConfig(budgets.length))
    setShowCreateModal(false)
  }

  const createNewBudget = async () => {
    setLoading(true)
    try {
      const baseCategories = createConfig.includeDefaultCategories
        ? DEFAULT_CATEGORY_ALLOCATIONS.map((category) => ({ ...category }))
        : []

      const newBudgetData = {
        name: createConfig.name.trim() || "My Budget",
        categoryBudgets: baseCategories,
      }

      const { data, error } = await createBudget(userId, newBudgetData)
      if (error) {
        console.error("Error creating budget:", error)
        alert("Failed to create budget. Please try again.")
      } else if (data?.[0]) {
        const record = data[0]
        const createdAt = record.created_at
          ? new Date(record.created_at).toLocaleDateString()
          : new Date().toLocaleDateString()
        const newBudget = {
          id: record.id,
          name: record.name,
          createdAt,
          categoryBudgets: record.category_budgets || baseCategories,
          transactions: (record.transactions || []).map((tx) => ({ ...tx })),
        }
        setBudgets((prev) => [newBudget, ...prev])
        const now = new Date().toISOString()
        const cycleMetadata = {
          type: createConfig.cycleType,
          label: getCycleLabel(createConfig.cycleType),
          currentStart: createConfig.startDate ? new Date(createConfig.startDate).toISOString() : now,
          payFrequencyDays:
            createConfig.cycleType === "per-paycheck" ? Number(createConfig.payFrequencyDays) || 14 : undefined,
          customDays: createConfig.cycleType === "custom" ? Number(createConfig.customDays) || 30 : undefined,
          lastEditedAt: now,
        }

        onMetadataChange?.(newBudget.id, (metadata) => ({
          ...metadata,
          cycle: { ...metadata.cycle, ...cycleMetadata },
          changeLog: [
            {
              at: now,
              message: `Budget created (${cycleMetadata.label}) with ${baseCategories.length || "no"} starter categories`,
              type: "create",
            },
            ...(metadata.changeLog || []),
          ],
        }))

        setSelectedBudget({ ...newBudget, cycleMetadata })
        setViewMode("details")
        onDataMutated?.()
      }
    } catch (error) {
      console.error("Error creating budget:", error)
      alert("Failed to create budget. Please try again.")
    } finally {
      setLoading(false)
      resetCreateModal()
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
        setBudgets((prev) => prev.map((b) => (b.id === budget.id ? { ...b, name: budgetNameInput.trim() } : b)))
        const now = new Date().toISOString()
        onMetadataChange?.(budget.id, (metadata) => ({
          ...metadata,
          changeLog: [
            {
              at: now,
              message: `Renamed budget to "${budgetNameInput.trim()}"`,
              type: "rename",
            },
            ...(metadata.changeLog || []),
          ],
        }))
        onDataMutated?.()
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
      }

      const { data, error } = await createBudget(userId, duplicateData)
      if (error) {
        console.error("Error duplicating budget:", error)
        alert("Failed to duplicate budget. Please try again.")
      } else if (data?.[0]) {
        const record = data[0]
        const newBudget = {
          id: record.id,
          name: record.name,
          createdAt: record.created_at
            ? new Date(record.created_at).toLocaleDateString()
            : new Date().toLocaleDateString(),
          categoryBudgets: record.category_budgets || [],
          transactions: (record.transactions || []).map((tx) => ({ ...tx })),
        }
        setBudgets((prev) => [newBudget, ...prev])
        const now = new Date().toISOString()
        const sourceCycle = budget.cycleMetadata || { type: "monthly", label: getCycleLabel("monthly") }
        onMetadataChange?.(newBudget.id, (metadata) => ({
          ...metadata,
          cycle: { ...metadata.cycle, ...sourceCycle, lastEditedAt: now },
          insights: {
            ...metadata.insights,
            ...(budget.insightsPreferences || {}),
            nudges: {
              ...metadata.insights?.nudges,
              ...(budget.insightsPreferences?.nudges || {}),
            },
          },
          changeLog: [
            {
              at: now,
              message: `Duplicated from ${budget.name}`,
              type: "duplicate",
            },
            ...(metadata.changeLog || []),
          ],
        }))
        onDataMutated?.()
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
        setBudgets((prev) => prev.filter((b) => b.id !== budgetId))
        onMetadataRemove?.(budgetId)
        onDataMutated?.()
      }
    } catch (error) {
      console.error("Error deleting budget:", error)
      alert("Failed to delete budget. Please try again.")
    } finally {
      setOpenMenuId(null)
      setLoading(false)
    }
  }

  const activeCycleTypes = Object.keys(cycleSummary)

  return (
    <div>
      <div className="header-section">
        <p className="tagline">Manage your budgets and stay on top of your finances.</p>
        <div className="header-actions">
          <button className="secondary-button" onClick={() => setViewMode("goals")}>View savings goals</button>
        </div>
      </div>

      {budgets.length > 0 && (
        <div className="cycle-summary-card">
          <div className="cycle-summary-title">Budget cycles</div>
          <div className="cycle-summary-stats">
            {activeCycleTypes.length === 0 && <span>No active budgets yet.</span>}
            {activeCycleTypes.map((type) => (
              <span key={type} className={`cycle-chip cycle-${type}`}>
                {getCycleLabel(type)} · {cycleSummary[type]}
              </span>
            ))}
          </div>
        </div>
      )}

      {budgets.length === 0 ? (
        <div className="empty-state">
          <p>Welcome to Pocket Budget! Create your first budget to get started.</p>
          <button
            className="primary-button"
            onClick={() => {
              setCreateConfig(buildInitialConfig(budgets.length))
              setShowCreateModal(true)
            }}
            disabled={loading}
          >
            Start a Monthly Budget
          </button>
        </div>
      ) : (
        budgets.map((budget) => {
          const pacing = calculateBudgetPacing(budget)
          const overallPacing = pacing.overall
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
            const pacingKey = cat.category?.toLowerCase().trim() || ""
            return { ...cat, actual, isOver, pacing: pacing.categoriesByName[pacingKey] }
          })

          const isAnyCategoryOver = categorySummaries.some((cat) => cat.isOver || cat.pacing?.status === "red")
          const totalBudgeted = categorySummaries.reduce((sum, cat) => sum + (cat.budgetedAmount || 0), 0)
          const totalSpent = categorySummaries.reduce((sum, cat) => sum + (cat.actual || 0), 0)
          const remaining = totalBudgeted - totalSpent
          const cycleType = budget.cycleMetadata?.type || "monthly"
          const cycleLabel = getCycleLabel(cycleType)

          const handleCardKeyDown = (event) => {
            if (event.currentTarget !== event.target) return
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              openBudget(budget)
            }
          }

          return (
            <div
              key={budget.id}
              className="budgetCard"
              role="button"
              tabIndex={0}
              aria-label={`View details for ${budget.name}`}
              onClick={() => openBudget(budget)}
              onKeyDown={handleCardKeyDown}
            >
              <div className="budgetCard-content">
                <div className="budgetCard-info">
                  <div className="budgetCycleRow">
                    <span className={`cycle-pill cycle-${cycleType}`}>{cycleLabel}</span>
                    <div className={`pacing-indicator pacing-${overallPacing.status}`} title={overallPacing.tooltip} role="status">
                      <span className="pacing-dot" aria-hidden="true" />
                      <span className="pacing-label">{overallPacing.label}</span>
                    </div>
                  </div>

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
                    <div className="budgetNameRow">
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
                    </div>
                  )}

                  <div className="budgetBalance">
                    Balance: <span className={balance >= 0 ? "income" : "expense"}>${balance.toFixed(2)}</span>
                  </div>

                  <div className="budgetSummaryRow" role="list">
                    <span className="budgetSummaryItem" role="listitem">
                      Spent <strong>{formatCurrency(totalSpent)}</strong>
                    </span>
                    <span className="budgetSummaryItem" role="listitem">
                      Remaining <strong>{formatCurrency(remaining)}</strong>
                    </span>
                    <span className={`budgetSummaryItem guardrail-${overallPacing.status}`} role="listitem">
                      Guardrail <strong>{overallPacing.label}</strong>
                    </span>
                  </div>

                  <div className="budgetDate">Created: {budget.createdAt}</div>

                  {categorySummaries.length > 0 && (
                    <div className="category-budgets">
                      {categorySummaries.slice(0, 3).map((cat) => {
                        const hasBudget = !!cat.budgetedAmount && cat.budgetedAmount > 0
                        const progressPercent = hasBudget
                          ? Math.min((cat.actual / cat.budgetedAmount) * 100, 100)
                          : 0

                        return (
                          <div key={cat.category} className="category-budget-row">
                            <div className="category-budget-header">
                              <div className="category-budget-name">
                                {cat.category}
                                {cat.isOver && (
                                  <span className="expense" style={{ marginLeft: "0.3rem" }}>
                                    ⚠
                                  </span>
                                )}
                              </div>
                              {cat.pacing && (
                                <div
                                  className={`pacing-indicator pacing-${cat.pacing.status}`}
                                  title={cat.pacing.tooltip}
                                  role="status"
                                  aria-label={`${cat.category} pacing is ${cat.pacing.label}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span className="pacing-dot" aria-hidden="true" />
                                  <span className="pacing-label">{cat.pacing.label}</span>
                                </div>
                              )}
                            </div>
                            <div className="category-budget-amounts">
                              ${cat.actual.toFixed(2)} / ${cat.budgetedAmount.toFixed(2)}
                            </div>
                            <div className="progress-bar">
                              <div
                                className={`progress-fill ${cat.isOver ? "over" : ""}`}
                                style={{
                                  width: `${progressPercent}%`,
                                }}
                                aria-label={
                                  hasBudget ? undefined : `${cat.category} has no budget set`
                                }
                              ></div>
                            </div>
                          </div>
                        )
                      })}
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
          <button
            className="addButton primary-button"
            onClick={() => {
              setCreateConfig(buildInitialConfig(budgets.length))
              setShowCreateModal(true)
            }}
            disabled={loading}
          >
            New Budget
          </button>
          <button className="cancelButton secondary-button cate-btn" onClick={() => setViewMode("categories")}>
            Manage Categories
          </button>
        </div>
      )}

      {showCreateModal && (
        <div className="modalBackdrop">
          <div className="modalContent enhanced-modal">
            <h2 className="header modal-header">Create a budget</h2>
            <label className="input-label" htmlFor="new-budget-name">
              Budget name
            </label>
            <input
              id="new-budget-name"
              className="input"
              placeholder="My Budget"
              value={createConfig.name}
              onChange={(e) => setCreateConfig((prev) => ({ ...prev, name: e.target.value }))}
            />

            <div className="cycle-option-group">
              <span className="input-label">Cycle</span>
              <div className="cycle-option-grid">
                {CYCLE_OPTIONS.map((option) => {
                  const isSelected = createConfig.cycleType === option.type
                  return (
                    <button
                      key={option.type}
                      type="button"
                      className={`cycle-option ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        setCreateConfig((prev) => ({ ...prev, cycleType: option.type }))
                      }}
                    >
                      <div className="cycle-option-title">
                        {option.label}
                      </div>
                      <div className="cycle-option-description">{option.description}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {createConfig.cycleType === "per-paycheck" && (
              <div className="cycle-config-row">
                <label className="input-label" htmlFor="cycle-pay-frequency">
                  Paycheck frequency (days)
                </label>
                <input
                  id="cycle-pay-frequency"
                  type="number"
                  className="input"
                  min="7"
                  max="45"
                  value={createConfig.payFrequencyDays}
                  onChange={(e) =>
                    setCreateConfig((prev) => ({ ...prev, payFrequencyDays: e.target.value }))
                  }
                />
              </div>
            )}

            {createConfig.cycleType === "custom" && (
              <div className="cycle-config-row">
                <label className="input-label" htmlFor="cycle-custom-length">
                  Cycle length (days)
                </label>
                <input
                  id="cycle-custom-length"
                  type="number"
                  className="input"
                  min="5"
                  max="120"
                  value={createConfig.customDays}
                  onChange={(e) => setCreateConfig((prev) => ({ ...prev, customDays: e.target.value }))}
                />
              </div>
            )}

            <div className="cycle-config-row">
              <label className="input-label" htmlFor="cycle-start-date">
                Cycle start date
              </label>
              <input
                id="cycle-start-date"
                type="date"
                className="input"
                value={createConfig.startDate}
                onChange={(e) => setCreateConfig((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={createConfig.includeDefaultCategories}
                onChange={(e) =>
                  setCreateConfig((prev) => ({ ...prev, includeDefaultCategories: e.target.checked }))
                }
              />
              <span>Include starter categories ({DEFAULT_CATEGORY_ALLOCATIONS.length})</span>
            </label>

            <div className="modal-actions">
              <button
                className="addButton primary-button"
                onClick={createNewBudget}
                disabled={loading}
              >
                {loading ? "Creating..." : "Create budget"}
              </button>
              <button className="cancelButton secondary-button" onClick={resetCreateModal} disabled={loading}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const transactionShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  amount: PropTypes.number.isRequired,
  budgetedAmount: PropTypes.number,
  category: PropTypes.string.isRequired,
  type: PropTypes.oneOf(["income", "expense"]).isRequired,
  date: PropTypes.string.isRequired,
  receipt: PropTypes.string,
})

const categoryBudgetShape = PropTypes.shape({
  category: PropTypes.string.isRequired,
  budgetedAmount: PropTypes.number.isRequired,
})

BudgetsScreen.propTypes = {
  budgets: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      createdAt: PropTypes.string.isRequired,
      transactions: PropTypes.arrayOf(transactionShape),
      categoryBudgets: PropTypes.arrayOf(categoryBudgetShape),
      cycleMetadata: PropTypes.object,
    }),
  ).isRequired,
  setSelectedBudget: PropTypes.func.isRequired,
  setViewMode: PropTypes.func.isRequired,
  setBudgets: PropTypes.func.isRequired,
  userId: PropTypes.string.isRequired,
  onMetadataChange: PropTypes.func,
  onMetadataRemove: PropTypes.func,
  onDataMutated: PropTypes.func,
}

BudgetsScreen.defaultProps = {
  onMetadataChange: undefined,
  onMetadataRemove: undefined,
  onDataMutated: undefined,
}
