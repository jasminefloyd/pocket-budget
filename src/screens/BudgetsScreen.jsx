import { useState } from "react"
import { createBudget, updateBudget, deleteBudget } from "../lib/supabase"

export default function BudgetsScreen({ budgets, setSelectedBudget, setViewMode, setBudgets, userId }) {
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
        name: `Budget ${budgets.length + 1}`,
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

  const fillDemoData = (budget) => {
    const demoTransactions = [
      // Income transactions
      { id: "demo-i1", name: "Monthly Salary", amount: 4500, category: "Salary", date: "1/1/2025", type: "income" },
      {
        id: "demo-i2",
        name: "Freelance Project",
        amount: 800,
        category: "Freelance",
        date: "1/15/2025",
        type: "income",
      },
      {
        id: "demo-i3",
        name: "Investment Dividend",
        amount: 120,
        category: "Investment",
        date: "1/10/2025",
        type: "income",
      },

      // Expense transactions
      { id: "demo-e1", name: "Monthly Rent", amount: 1200, category: "Bills", date: "1/1/2025", type: "expense" },
      { id: "demo-e2", name: "Grocery Shopping", amount: 85, category: "Groceries", date: "1/3/2025", type: "expense" },
      { id: "demo-e3", name: "Electric Bill", amount: 120, category: "Bills", date: "1/5/2025", type: "expense" },
      { id: "demo-e4", name: "Gas Station", amount: 45, category: "Transportation", date: "1/6/2025", type: "expense" },
      {
        id: "demo-e5",
        name: "Netflix Subscription",
        amount: 15,
        category: "Entertainment",
        date: "1/8/2025",
        type: "expense",
      },
      { id: "demo-e6", name: "Lunch at Cafe", amount: 28, category: "Groceries", date: "1/9/2025", type: "expense" },
      {
        id: "demo-e7",
        name: "Grocery Shopping",
        amount: 92,
        category: "Groceries",
        date: "1/11/2025",
        type: "expense",
      },
      { id: "demo-e8", name: "Phone Bill", amount: 65, category: "Bills", date: "1/12/2025", type: "expense" },
      {
        id: "demo-e9",
        name: "Movie Tickets",
        amount: 24,
        category: "Entertainment",
        date: "1/13/2025",
        type: "expense",
      },
      {
        id: "demo-e10",
        name: "Gas Station",
        amount: 38,
        category: "Transportation",
        date: "1/14/2025",
        type: "expense",
      },
      {
        id: "demo-e11",
        name: "Online Shopping",
        amount: 156,
        category: "Shopping",
        date: "1/16/2025",
        type: "expense",
      },
      { id: "demo-e12", name: "Internet Bill", amount: 75, category: "Bills", date: "1/17/2025", type: "expense" },
      { id: "demo-e13", name: "Dinner Out", amount: 67, category: "Groceries", date: "1/18/2025", type: "expense" },
      {
        id: "demo-e14",
        name: "Grocery Shopping",
        amount: 78,
        category: "Groceries",
        date: "1/19/2025",
        type: "expense",
      },
      {
        id: "demo-e15",
        name: "Gym Membership",
        amount: 45,
        category: "Entertainment",
        date: "1/20/2025",
        type: "expense",
      },
      { id: "demo-e16", name: "Coffee Shop", amount: 12, category: "Groceries", date: "1/21/2025", type: "expense" },
      { id: "demo-e17", name: "Uber Ride", amount: 18, category: "Transportation", date: "1/22/2025", type: "expense" },
      { id: "demo-e18", name: "Clothing Store", amount: 89, category: "Shopping", date: "1/23/2025", type: "expense" },
      {
        id: "demo-e19",
        name: "Grocery Shopping",
        amount: 103,
        category: "Groceries",
        date: "1/25/2025",
        type: "expense",
      },
      {
        id: "demo-e20",
        name: "Gas Station",
        amount: 42,
        category: "Transportation",
        date: "1/26/2025",
        type: "expense",
      },
    ]

    const updatedBudget = {
      ...budget,
      transactions: demoTransactions,
      categoryBudgets: [
        { category: "Groceries", budgetedAmount: 400 },
        { category: "Bills", budgetedAmount: 1500 },
        { category: "Transportation", budgetedAmount: 200 },
        { category: "Entertainment", budgetedAmount: 150 },
        { category: "Shopping", budgetedAmount: 300 },
      ],
    }

    const updatedBudgets = budgets.map((b) => (b.id === budget.id ? updatedBudget : b))
    setBudgets(updatedBudgets)
  }

  return (
    <div>
      <div className="header-section">
        <p className="tagline">Manage your budgets and stay on top of your finances.</p>
        <div className="demo-notice">
          <p>
            🧪 <strong>Demo Mode:</strong> All data is stored locally in your browser
          </p>
        </div>
      </div>

      {budgets.length === 0 ? (
        <p className="empty-state">No budgets found. Create one to get started!</p>
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
          const hasMinimalData = (budget.transactions || []).length <= 3

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

                  {/* Fill Data Button for budgets with minimal data */}
                  {hasMinimalData && (
                    <button
                      className="fill-data-button"
                      onClick={(e) => {
                        e.stopPropagation()
                        fillDemoData(budget)
                      }}
                      disabled={loading}
                    >
                      📊 Fill with Demo Data
                    </button>
                  )}

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

      <div className="budget-actions">
        <button className="addButton primary-button" onClick={createNewBudget} disabled={loading}>
          {loading ? "Creating..." : "Create New Budget"}
        </button>
        <button className="cancelButton secondary-button cate-btn" onClick={() => setViewMode("categories")}>
          Manage Categories
        </button>
      </div>
    </div>
  )
}
