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
  })

  const saveBudgetName = () => {
    if (!budgetNameInput.trim()) return
    const updatedBudgets = budgets.map((b) => (b.id === budget.id ? { ...b, name: budgetNameInput.trim() } : b))
    setBudgets(updatedBudgets)
    setSelectedBudget(updatedBudgets.find((b) => b.id === budget.id))
  }

  const totalIncome = budget.transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0)
  const totalExpenses = budget.transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0)
  const balance = totalIncome - totalExpenses

  const transactions = budget.transactions
    .filter((t) => t.type === (tab === "income" ? "income" : "expense"))
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  const deleteTransaction = (id) => {
    const updated = {
      ...budget,
      transactions: budget.transactions.filter((t) => t.id !== id),
    }
    const updatedBudgets = budgets.map((b) => (b.id === budget.id ? updated : b))
    setBudgets(updatedBudgets)
    setSelectedBudget(updated)
  }

  const addTransaction = () => {
    if (!newTx.name.trim() || isNaN(newTx.amount) || !newTx.category.trim()) {
      alert("Please fill in all fields")
      return
    }
    const tx = {
      id: Date.now().toString(),
      name: newTx.name.trim(),
      amount: Number.parseFloat(newTx.amount),
      category: newTx.category,
      date: newTx.date,
      type: newTx.type,
    }
    const updated = {
      ...budget,
      transactions: [...budget.transactions, tx],
    }
    const updatedBudgets = budgets.map((b) => (b.id === budget.id ? updated : b))
    setBudgets(updatedBudgets)
    setSelectedBudget(updated)
    setShowAddModal(false)
    setNewTx({
      name: "",
      amount: "",
      category: "",
      date: new Date().toLocaleDateString(),
      type: tab === "income" ? "income" : "expense",
    })
  }

  return (
    <div>
      <div className="header-nav">
        <button className="cancelButton secondary-button" onClick={() => setViewMode("budgets")}>
          <i className="fa-solid fa-left-long"></i> Back
        </button>
        <button className="aiInsightsButton" onClick={() => setViewMode("ai")} title="View AI Insights">
          <i className="fas fa-brain"></i>
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

      {/* Income vs Expenses Bar Chart */}
      <div className="chartContainer">
        <h3 className="chartTitle">Budget Overview</h3>
        <div className="chartWrapper">
          {/* Income Bar (Green) */}
          <div className="incomeBar">
            <div className="barLabel">${totalIncome.toFixed(2)}</div>
            {/* Expenses Bar (Red) - nested within income bar */}
            {totalIncome > 0 && (
              <div className="expenseBar" style={{ width: `${Math.min((totalExpenses / totalIncome) * 100, 100)}%` }}>
                <span className="barLabel">${totalExpenses.toFixed(2)}</span>
              </div>
            )}
          </div>
          {/* Legend */}
          <div className="chartLegend">
            <div className="legendItem">
              <div className="legendColor income"></div>
              <span>Income</span>
            </div>
            <div className="legendItem">
              <div className="legendColor expense"></div>
              <span>Expenses</span>
            </div>
          </div>
          {/* Percentage indicator */}
          <div className="chartPercentage">
            {totalIncome > 0 ? (
              <span>
                Spending {((totalExpenses / totalIncome) * 100).toFixed(1)}% of income
                {totalExpenses > totalIncome && <span className="overBudget"> (Over budget!)</span>}
              </span>
            ) : (
              <span>No transactions added yet</span>
            )}
          </div>
        </div>
      </div>

      <div className="summary-row">
        <div>
          Income: <span className="income">${totalIncome.toFixed(2)}</span>
        </div>
        <div>
          Expenses: <span className="expense">${totalExpenses.toFixed(2)}</span>
        </div>
      </div>

      <div className="tabRow">
        <button className={tab === "expenses" ? "tabActive" : "tabInactive"} onClick={() => setTab("expenses")}>
          Expenses
        </button>
        <button className={tab === "income" ? "tabActive" : "tabInactive"} onClick={() => setTab("income")}>
          Income
        </button>
      </div>

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
            <button className="deleteButton" onClick={() => deleteTransaction(t.id)} title="Delete transaction">
              <i className="fa-solid fa-trash"></i>
            </button>
          </div>
        ))
      )}

      {/* Floating Add Button */}
      <button
        className="fab"
        onClick={() => {
          setShowAddModal(true)
          setNewTx({
            name: "",
            amount: "",
            category: "",
            date: new Date().toLocaleDateString(),
            type: tab === "income" ? "income" : "expense",
          })
        }}
        title="Add Transaction"
      >
        +
      </button>

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
              <button className="addButton primary-button" onClick={addTransaction}>
                Save
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
