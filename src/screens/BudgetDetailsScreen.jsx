import { useState } from "react"

export default function BudgetDetailsScreen({
  budget,
  categories,
  setViewMode,
  setBudgets,
  budgets,
  setSelectedBudget,
}) {
  const [tab, setTab] = useState("expenses")
  const [showAddModal, setShowAddModal] = useState(false)
  const [budgetNameInput, setBudgetNameInput] = useState(budget.name)
  const [newTx, setNewTx] = useState({
    name: "",
    amount: "",
    category: "",
    date: new Date().toLocaleDateString(),
    type: "expense",
    receipt: null,
  })

  // Save updated budget name
  const saveBudgetName = () => {
    if (!budgetNameInput.trim()) return
    const updatedBudgets = budgets.map((b) =>
      b.id === budget.id ? { ...b, name: budgetNameInput.trim() } : b
    )
    setBudgets(updatedBudgets)
    setSelectedBudget(updatedBudgets.find((b) => b.id === budget.id))
  }

  // Update a category's budgeted amount
  const updateCategoryBudgetAmount = (category, newAmount) => {
    const updated = {
      ...budget,
      categoryBudgets: (budget.categoryBudgets || []).map((cb) =>
        cb.category === category ? { ...cb, budgetedAmount: newAmount } : cb
      ),
    }
    const updatedBudgets = budgets.map((b) => (b.id === budget.id ? updated : b))
    setBudgets(updatedBudgets)
    setSelectedBudget(updated)
  }

  // Totals
  const totalIncome = budget.transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0)

  const totalExpenses = budget.transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0)

  const balance = totalIncome - totalExpenses

  const transactions = budget.transactions
    .filter((t) => t.type === (tab === "income" ? "income" : "expense"))
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  return (
    <div>
      <div className="header-nav">
        <button className="cancelButton secondary-button" onClick={() => setViewMode("budgets")}>
          <i className="fa-solid fa-left-long"></i> Back
        </button>
      </div>

      <input
        className="input budget-title-input"
        value={budgetNameInput}
        onChange={(e) => setBudgetNameInput(e.target.value)}
        onBlur={saveBudgetName}
      />

      <div className="balance main-balance">
        Balance: <span className={balance >= 0 ? "income" : "expense"}>${balance.toFixed(2)}</span>
      </div>

      {/* Category Budgets Overview */}
      <div className="category-budgets">
        <h3 className="chartTitle">Category Budgets</h3>
        {(budget.categoryBudgets || []).map((cb) => {
          const actualSpent = budget.transactions
            .filter((t) => t.category === cb.category && t.type === "expense")
            .reduce((sum, t) => sum + t.amount, 0)
          const percentage = cb.budgetedAmount > 0 ? (actualSpent / cb.budgetedAmount) * 100 : 0

          return (
            <div key={cb.category} className="category-budget-row">
              <div className="category-budget-name">{cb.category}</div>
              <div className="category-budget-progress">
                <span className="category-budget-amounts">
                  ${actualSpent.toFixed(2)} of ${cb.budgetedAmount.toFixed(2)} spent
                </span>
                <div className="progress-bar">
                  <div
                    className={`progress-fill ${percentage > 100 ? "over" : ""}`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  ></div>
                </div>
              </div>
              <button
                className="action-button"
                onClick={() => {
                  const input = prompt(`Set budget for ${cb.category}`, cb.budgetedAmount)
                  if (input !== null && !isNaN(input)) {
                    updateCategoryBudgetAmount(cb.category, parseFloat(input))
                  }
                }}
              >
                Set Budget
              </button>
            </div>
          )
        })}
      </div>

      {/* Summary */}
      <div className="summary-row">
        <div>
          Income: <span className="income">${totalIncome.toFixed(2)}</span>
        </div>
        <div>
          Expenses: <span className="expense">${totalExpenses.toFixed(2)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabRow">
        <button className={tab === "expenses" ? "tabActive" : "tabInactive"} onClick={() => setTab("expenses")}>
          Expenses
        </button>
        <button className={tab === "income" ? "tabActive" : "tabInactive"} onClick={() => setTab("income")}>
          Income
        </button>
      </div>

      {/* Transactions */}
      {transactions.length === 0 ? (
        <p className="empty-state">No {tab} transactions yet.</p>
      ) : (
        transactions.map((t) => (
          <div key={t.id} className="transaction">
            <div className="transaction-info">
              <div className="transaction-main">
                <span className="transaction-icon">{categories[t.type].find((c) => c.name === t.category)?.icon}</span>
                <span className="transaction-name">{t.name}</span>
                <span className={`transaction-amount ${t.type}`}>
                  {t.type === "income" ? "+" : "-"}${t.amount.toFixed(2)}
                </span>
              </div>
              <div className="transaction-details">
                {t.category} • {t.date}
              </div>
            </div>
          </div>
        ))
      )}

      {/* Floating add button */}
      <button className="fab" onClick={() => setShowAddModal(true)}>
        +
      </button>

      {/* Add transaction modal */}
      {showAddModal && (
        <div className="modalBackdrop">
          <div className="modalContent">
            <h2 className="header modal-header">Add {tab.charAt(0).toUpperCase() + tab.slice(1)}</h2>
            <input
              className="input"
              placeholder="Name"
              value={newTx.name}
              onChange={(e) => setNewTx({ ...newTx, name: e.target.value })}
            />
            <input
              className="input"
              placeholder="Amount"
              type="number"
              value={newTx.amount}
              onChange={(e) => setNewTx({ ...newTx, amount: e.target.value })}
            />
            <select
              className="input"
              value={newTx.category}
              onChange={(e) => setNewTx({ ...newTx, category: e.target.value })}
            >
              <option value="">Select Category</option>
              {categories[newTx.type]?.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
            <div className="modal-actions">
              <button
                className="addButton primary-button"
                onClick={() => {
                  if (!newTx.name.trim() || isNaN(newTx.amount) || !newTx.category.trim()) {
                    alert("Please fill in all fields")
                    return
                  }
                  const tx = {
                    id: Date.now().toString(),
                    name: newTx.name.trim(),
                    amount: Number.parseFloat(newTx.amount),
                    category: newTx.category,
                    date: new Date().toLocaleDateString(),
                    type: newTx.type,
                    receipt: newTx.receipt
                }
                  
                  const updated = {
                    ...budget,
                    transactions: [...budget.transactions, tx],
                  }
                  const updatedBudgets = budgets.map((b) => (b.id === budget.id ? updated : b))
                  setBudgets(updatedBudgets)
                  setSelectedBudget(updated)
                  setShowAddModal(false)
                }}
              >
                Add
              </button>
              <button className="cancelButton secondary-button" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
