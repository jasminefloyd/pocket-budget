"use client"

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
  const [showModal, setShowModal] = useState(false)
  const [editingTx, setEditingTx] = useState(null)
  const [expandedReceipts, setExpandedReceipts] = useState({})
  const [currentPage, setCurrentPage] = useState(1)
  const [formTx, setFormTx] = useState({
    name: "",
    amount: "",
    budgetedAmount: "",
    category: "",
    date: new Date().toLocaleDateString(),
    type: "expense",
    receipt: null,
  })

  const [selectedSlice, setSelectedSlice] = useState(null)

  const ITEMS_PER_PAGE = 7

  const resolveTypeKey = (typeOrTab) => {
    if (typeOrTab === "income" || typeOrTab === "expense") return typeOrTab
    if (typeOrTab === "expenses") return "expense"
    return "income"
  }

  const openAddModal = (preset = {}, typeArg) => {
    const resolvedType = resolveTypeKey(typeArg || tab)
    setFormTx({
      name: preset.name || "",
      amount: preset.amount || "",
      budgetedAmount: preset.budgetedAmount || "",
      category: preset.category || "",
      date: new Date().toLocaleDateString(),
      type: resolvedType,
      receipt: null,
    })
    setEditingTx(null)
    setShowModal(true)
  }

  const openEditModal = (tx) => {
    setFormTx({ ...tx, budgetedAmount: tx.budgetedAmount || "" })
    setEditingTx(tx)
    setShowModal(true)
  }

  const saveTransaction = () => {
    if (!formTx.name.trim() || isNaN(formTx.amount) || !formTx.category.trim()) {
      alert("Please fill in all required fields correctly")
      return
    }

    const cleanedTx = {
      ...formTx,
      amount: Number.parseFloat(formTx.amount),
      budgetedAmount: formTx.budgetedAmount ? Number.parseFloat(formTx.budgetedAmount) : null,
      type: resolveTypeKey(formTx.type),
    }

    let updatedTransactions
    if (editingTx) {
      updatedTransactions = (budget.transactions || []).map((t) => (t.id === editingTx.id ? cleanedTx : t))
    } else {
      updatedTransactions = [...(budget.transactions || []), { ...cleanedTx, id: Date.now().toString() }]
    }

    const updatedBudget = { ...budget, transactions: updatedTransactions }
    const updatedBudgets = budgets.map((b) => (b.id === budget.id ? updatedBudget : b))

    setBudgets(updatedBudgets)
    setSelectedBudget(updatedBudgets.find((b) => b.id === budget.id))
    setShowModal(false)
    setEditingTx(null)
  }

  const toggleReceipt = (txId) => {
    setExpandedReceipts((prev) => ({
      ...prev,
      [txId]: !prev[txId],
    }))
  }

  const totalIncome = (budget.transactions || [])
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0)

  const totalExpenses = (budget.transactions || [])
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0)

  const totalBudgeted = (budget.transactions || [])
    .filter((t) => t.type === "expense" && t.budgetedAmount)
    .reduce((sum, t) => sum + t.budgetedAmount, 0)

  const balance = totalIncome - totalExpenses

  // Calculate category breakdown for pie chart
  const categoryBreakdown = (budget.transactions || [])
    .filter((t) => t.type === "expense")
    .reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount
      return acc
    }, {})

  const categoryData = Object.entries(categoryBreakdown)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
      icon: categories.expense.find((c) => c.name === category)?.icon || "💰",
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5) // Show top 5 categories

  // Generate colors for categories
  const categoryColors = [
    "#ef4444", // red-500
    "#f97316", // orange-500
    "#eab308", // yellow-500
    "#22c55e", // green-500
    "#3b82f6", // blue-500
    "#8b5cf6", // purple-500
    "#ec4899", // pink-500
  ]

  // Get all transactions for current tab and sort them
  const allTransactions = (budget.transactions || [])
    .filter((t) => t.type === resolveTypeKey(tab))
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  // Calculate pagination
  const totalPages = Math.ceil(allTransactions.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const currentTransactions = allTransactions.slice(startIndex, endIndex)

  // Reset to page 1 when switching tabs
  const handleTabChange = (newTab) => {
    setTab(newTab)
    setCurrentPage(1)
  }

  const handlePageChange = (page) => {
    setCurrentPage(page)
  }

  const renderPagination = () => {
    if (totalPages <= 1) return null

    const pages = []
    const maxVisiblePages = 5

    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2))
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1)

    // Adjust start page if we're near the end
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1)
    }

    // Previous button
    if (currentPage > 1) {
      pages.push(
        <button key="prev" className="pagination-button" onClick={() => handlePageChange(currentPage - 1)}>
          ←
        </button>,
      )
    }

    // First page and ellipsis
    if (startPage > 1) {
      pages.push(
        <button key={1} className="pagination-button" onClick={() => handlePageChange(1)}>
          1
        </button>,
      )
      if (startPage > 2) {
        pages.push(
          <span key="ellipsis1" className="pagination-ellipsis">
            ...
          </span>,
        )
      }
    }

    // Page numbers
    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          className={`pagination-button ${currentPage === i ? "active" : ""}`}
          onClick={() => handlePageChange(i)}
        >
          {i}
        </button>,
      )
    }

    // Last page and ellipsis
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push(
          <span key="ellipsis2" className="pagination-ellipsis">
            ...
          </span>,
        )
      }
      pages.push(
        <button key={totalPages} className="pagination-button" onClick={() => handlePageChange(totalPages)}>
          {totalPages}
        </button>,
      )
    }

    // Next button
    if (currentPage < totalPages) {
      pages.push(
        <button key="next" className="pagination-button" onClick={() => handlePageChange(currentPage + 1)}>
          →
        </button>,
      )
    }

    return (
      <div className="pagination-container">
        <div className="pagination-info">
          Showing {startIndex + 1}-{Math.min(endIndex, allTransactions.length)} of {allTransactions.length} transactions
        </div>
        <div className="pagination-controls">{pages}</div>
      </div>
    )
  }

  return (
    <div>
      <div className="header-nav">
        <button className="cancelButton secondary-button" onClick={() => setViewMode("budgets")}>
          ← Back
        </button>
        <button className="ai-insights-button primary-button" onClick={() => setViewMode("ai")}>
          🧠 AI Report
        </button>
      </div>

      <input
        className="input budget-title-input no-border"
        value={budget.name}
        onChange={(e) => {
          const newName = e.target.value
          const updatedBudgets = budgets.map((b) => (b.id === budget.id ? { ...b, name: newName } : b))
          setBudgets(updatedBudgets)
          setSelectedBudget(updatedBudgets.find((b) => b.id === budget.id))
        }}
      />

      {/* Budget Overview Section */}
      <div className="budget-overview-card">
        <h3 className="overview-title">Budget Overview</h3>

        <div className="overview-content">
          <div className="overview-stats">
            <div className="stat-item">
              <div className="stat-label">Total Income</div>
              <div className="stat-value income">${totalIncome.toFixed(2)}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Total Spent</div>
              <div className="stat-value expense">${totalExpenses.toFixed(2)}</div>
            </div>
            {totalBudgeted > 0 && (
              <div className="stat-item stat-item-full-width">
                <div className="stat-label">Total Budgeted</div>
                <div className="stat-value">${totalBudgeted.toFixed(2)}</div>
              </div>
            )}
          </div>

          <div className="balance-display">
            <div className="balance-label">Remaining Balance</div>
            <div className={`balance-amount ${balance >= 0 ? "income" : "expense"}`}>${balance.toFixed(2)}</div>
          </div>

          {/* Pie Chart Section */}
          {categoryData.length > 0 && (
            <div className="category-chart-section">
              <h4 className="chart-section-title">Spending Breakdown</h4>
              <div className="chart-container-centered">
                <div className="pie-chart-wrapper">
                  <svg
                    className="pie-chart"
                    viewBox="0 0 200 200"
                    width="200"
                    height="200"
                    onClick={(e) => {
                      // Check if click was on the background (not a slice)
                      if (e.target.tagName === "svg" || e.target.tagName === "circle" || e.target.tagName === "text") {
                        setSelectedSlice(null)
                      }
                    }}
                  >
                    {categoryData.map((cat, index) => {
                      let cumulativePercentage = 0
                      for (let i = 0; i < index; i++) {
                        cumulativePercentage += categoryData[i].percentage
                      }

                      const startAngle = (cumulativePercentage / 100) * 360
                      const endAngle = ((cumulativePercentage + cat.percentage) / 100) * 360
                      const largeArcFlag = cat.percentage > 50 ? 1 : 0

                      const startAngleRad = (startAngle * Math.PI) / 180
                      const endAngleRad = (endAngle * Math.PI) / 180

                      const x1 = 100 + 80 * Math.cos(startAngleRad)
                      const y1 = 100 + 80 * Math.sin(startAngleRad)
                      const x2 = 100 + 80 * Math.cos(endAngleRad)
                      const y2 = 100 + 80 * Math.sin(endAngleRad)

                      const pathData = [
                        `M 100 100`,
                        `L ${x1} ${y1}`,
                        `A 80 80 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                        `Z`,
                      ].join(" ")

                      return (
                        <path
                          key={cat.category}
                          d={pathData}
                          fill={categoryColors[index % categoryColors.length]}
                          stroke="white"
                          strokeWidth="2"
                          className={`pie-slice ${selectedSlice === index ? "selected" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedSlice(selectedSlice === index ? null : index)
                          }}
                        />
                      )
                    })}
                    {/* Center circle for donut effect */}
                    <circle cx="100" cy="100" r="35" fill="white" />
                    <text x="100" y="95" textAnchor="middle" className="chart-center-text" fontSize="12" fill="#6b7280">
                      Total
                    </text>
                    <text
                      x="100"
                      y="110"
                      textAnchor="middle"
                      className="chart-center-amount"
                      fontSize="14"
                      fontWeight="600"
                      fill="#374151"
                    >
                      ${totalExpenses.toFixed(0)}
                    </text>
                  </svg>
                </div>

                {/* Selected slice details */}
                {selectedSlice !== null && (
                  <div className="slice-details">
                    <div className="slice-details-content">
                      <div className="slice-header">
                        <div
                          className="slice-color-dot"
                          style={{ backgroundColor: categoryColors[selectedSlice % categoryColors.length] }}
                        ></div>
                        <span className="slice-icon">{categoryData[selectedSlice].icon}</span>
                        <span className="slice-category">{categoryData[selectedSlice].category}</span>
                      </div>
                      <div className="slice-amount">${categoryData[selectedSlice].amount.toFixed(2)}</div>
                      <div className="slice-percentage">
                        {categoryData[selectedSlice].percentage.toFixed(1)}% of total spending
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Visual Progress Bar */}
        <div className="budget-progress">
          <div className="progress-labels">
            <span className="income">Income: ${totalIncome.toFixed(2)}</span>
            <span className="expense">Spent: ${totalExpenses.toFixed(2)}</span>
          </div>
          <div className="progress-bar-container">
            <div className="income-bar">
              {totalIncome > 0 && (
                <div
                  className="expense-overlay"
                  style={{
                    width: `${Math.min((totalExpenses / totalIncome) * 100, 100)}%`,
                  }}
                ></div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Tabs and List */}
      <div className="transactions-section">
        <div className="tabRow">
          <button
            className={tab === "expenses" ? "tabActive" : "tabInactive"}
            onClick={() => handleTabChange("expenses")}
          >
            Expenses ({(budget.transactions || []).filter((t) => t.type === "expense").length})
          </button>
          <button className={tab === "income" ? "tabActive" : "tabInactive"} onClick={() => handleTabChange("income")}>
            Income ({(budget.transactions || []).filter((t) => t.type === "income").length})
          </button>
        </div>

        {allTransactions.length === 0 ? (
          <div className="empty-state">
            <p>No {resolveTypeKey(tab)} transactions yet.</p>
            <button className="primary-button" onClick={() => openAddModal({}, tab)}>
              Add Your First {resolveTypeKey(tab) === "expense" ? "Expense" : "Income"}
            </button>
          </div>
        ) : (
          <>
            {currentTransactions.map((t) => (
              <div key={t.id} className="transaction enhanced-transaction" onClick={() => openEditModal(t)}>
                <div className="transaction-info">
                  <div className="transaction-main">
                    <span className="transaction-icon">
                      {categories[t.type].find((c) => c.name === t.category)?.icon || "💰"}
                    </span>
                    <div className="transaction-details-main">
                      <span className="transaction-name">{t.name}</span>
                      <div className="transaction-meta">
                        {t.category} • {t.date}
                        {t.receipt && <span className="receipt-indicator">📎</span>}
                      </div>
                    </div>
                    <div className="transaction-amounts">
                      <span className={`transaction-amount ${t.type}`}>
                        {t.type === "income" ? "+" : "-"}${t.amount.toFixed(2)}
                      </span>
                      {t.budgetedAmount && (
                        <span className="budgeted-amount">Budget: ${t.budgetedAmount.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Pagination */}
            {renderPagination()}
          </>
        )}
      </div>

      <button className="fab" onClick={() => openAddModal({}, tab)}>
        +
      </button>

      {showModal && (
        <div className="modalBackdrop">
          <div className="modalContent enhanced-modal">
            <h2 className="header modal-header">
              {editingTx ? "Edit Transaction" : `Add ${formTx.type === "expense" ? "Expense" : "Income"}`}
            </h2>

            <input
              className="input"
              placeholder="Description (e.g., Grocery shopping)"
              value={formTx.name}
              onChange={(e) => setFormTx({ ...formTx, name: e.target.value })}
            />

            <input
              className="input"
              placeholder="Actual amount spent"
              type="number"
              step="0.01"
              value={formTx.amount}
              onChange={(e) => setFormTx({ ...formTx, amount: e.target.value })}
            />

            {formTx.type === "expense" && (
              <input
                className="input"
                placeholder="Budgeted amount (optional)"
                type="number"
                step="0.01"
                value={formTx.budgetedAmount}
                onChange={(e) => setFormTx({ ...formTx, budgetedAmount: e.target.value })}
              />
            )}

            <select
              className="input"
              value={formTx.category}
              onChange={(e) => setFormTx({ ...formTx, category: e.target.value })}
            >
              <option value="">Select Category</option>
              {categories[resolveTypeKey(formTx.type)]?.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>

            {/* Enhanced Receipt Upload Section */}
            <div className="receipt-upload-section">
              <label className="receipt-upload-label">📎 Attach Receipt (Optional)</label>
              <input
                type="file"
                accept="image/*"
                className="receipt-input"
                onChange={(e) => {
                  const file = e.target.files[0]
                  if (file) {
                    const reader = new FileReader()
                    reader.onloadend = () => {
                      setFormTx({ ...formTx, receipt: reader.result })
                    }
                    reader.readAsDataURL(file)
                  }
                }}
              />
              {formTx.receipt && (
                <div className="receipt-preview">
                  <img
                    src={formTx.receipt || "/placeholder.svg"}
                    alt="Receipt preview"
                    className="receipt-preview-img"
                  />
                  <button
                    type="button"
                    className="remove-receipt"
                    onClick={() => setFormTx({ ...formTx, receipt: null })}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="addButton primary-button" onClick={saveTransaction}>
                {editingTx ? "Update" : "Add"} Transaction
              </button>
              <button
                className="cancelButton secondary-button"
                onClick={() => {
                  setShowModal(false)
                  setEditingTx(null)
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
