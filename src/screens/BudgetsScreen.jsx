"use client"

import { useState } from "react"
import { createBudget, updateBudget, deleteBudget } from "../lib/supabase"
import CashBurnDashboard from "../components/CashBurnDashboard"

export default function BudgetsScreen({
  budgets,
  setSelectedBudget,
  setViewMode,
  setBudgets,
  userId,
  cashBurnReport,
  cashBurnHistory,
  cashBurnPreferences,
  onSaveCashBurnPreferences,
  activeNudges,
  onDismissNudge,
}) {
  const [editingBudgetId, setEditingBudgetId] = useState(null)
  const [budgetNameInput, setBudgetNameInput] = useState("")
  const [openMenuId, setOpenMenuId] = useState(null)
  const [loading, setLoading] = useState(false)

  const openBudget = (budget) => {
    setSelectedBudget(budget)
    setViewMode("details")
  }

  const createNewBudget = async () => {
    setLoading(true)
    try {
      const newBudgetData = {
        name: `My Budget`,
        categoryBudgets: [],
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
          transactions: [],
        }
        setBudgets([newBudget, ...budgets])
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

      <CashBurnDashboard
        report={cashBurnReport}
        history={cashBurnHistory}
        preferences={cashBurnPreferences}
        onSavePreferences={onSaveCashBurnPreferences}
        activeNudges={activeNudges}
        onDismissNudge={onDismissNudge}
      />

      {budgets.length === 0 ? (
        <div className="empty-state">
          <p>Welcome to Pocket Budget! Create your first budget to get started.</p>
          <button className="primary-button" onClick={createNewBudget} disabled={loading}>
            {loading ? "Creating..." : "Create Your First Budget"}
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
            {loading ? "Creating..." : "Create New Budget"}
          </button>
          <button className="cancelButton secondary-button cate-btn" onClick={() => setViewMode("categories")}>
            Manage Categories
          </button>
        </div>
      )}
    </div>
  )
}
