"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createTransaction, updateTransaction, updateBudget } from "../lib/supabase"

const normalizeCategoryBudgets = (categoryBudgets = []) => {
  return categoryBudgets.map((cat) => ({
    category: cat.category,
    budgetedAmount:
      typeof cat.budgetedAmount === "number"
        ? cat.budgetedAmount
        : Number.parseFloat(cat.budgetedAmount) || 0,
    updatedAt: cat.updatedAt || cat.updated_at || new Date().toISOString(),
  }))
}

const deepCloneAllocations = (allocations = []) => allocations.map((cat) => ({ ...cat }))

const toInputValue = (value) => {
  const numeric = Number.isFinite(value) ? value : Number.parseFloat(value) || 0
  return numeric.toFixed(2)
}

const convertToDrafts = (allocations = []) => {
  return allocations.reduce((acc, cat) => {
    acc[cat.category] = toInputValue(cat.budgetedAmount)
    return acc
  }, {})
}

const formatCurrency = (value) => {
  const numeric = Number.isFinite(value) ? value : Number.parseFloat(value) || 0
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const formatTimestamp = (value) => {
  if (!value) return "Just now"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "Just now"
  }
  return date.toLocaleString()
}

const sanitizeCategoryName = (name = "") => name.replace(/\s+/g, " ").trim()

export default function BudgetDetailsScreen({
  budget,
  categories,
  setViewMode,
  setBudgets,
  budgets,
  setSelectedBudget,
  userId,
}) {
  const [tab, setTab] = useState("expenses")
  const [showModal, setShowModal] = useState(false)
  const [editingTx, setEditingTx] = useState(null)
  const [expandedReceipts, setExpandedReceipts] = useState({})
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(false)
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
  const [categoryAllocations, setCategoryAllocations] = useState(() =>
    normalizeCategoryBudgets(budget.categoryBudgets),
  )
  const [allocationDrafts, setAllocationDrafts] = useState(() =>
    convertToDrafts(normalizeCategoryBudgets(budget.categoryBudgets)),
  )
  const [allocationSaving, setAllocationSaving] = useState(false)
  const [changeLog, setChangeLog] = useState([])
  const [showChangeLog, setShowChangeLog] = useState(false)
  const [snackbar, setSnackbar] = useState(null)
  const snackbarTimer = useRef(null)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newCategoryAmount, setNewCategoryAmount] = useState("")

  const ITEMS_PER_PAGE = 7

  const syncAllocationState = (allocations) => {
    setCategoryAllocations(allocations)
    setAllocationDrafts(convertToDrafts(allocations))
  }

  const showSnackbarMessage = (message, previousAllocations, appliedAllocations, changeId) => {
    if (!message) return
    if (snackbarTimer.current) {
      clearTimeout(snackbarTimer.current)
    }
    setSnackbar({
      message,
      previousAllocations: deepCloneAllocations(previousAllocations || []),
      appliedAllocations: deepCloneAllocations(appliedAllocations || []),
      changeId,
    })
    snackbarTimer.current = setTimeout(() => {
      setSnackbar(null)
    }, 5000)
  }

  const persistAllocations = async (
    allocations,
    { previousAllocations, changeEntry, snackbarMessage, isUndo = false } = {},
  ) => {
    setAllocationSaving(true)
    try {
      const normalizedAllocations = normalizeCategoryBudgets(allocations)
      const { error } = await updateBudget(budget.id, {
        name: budget.name,
        categoryBudgets: normalizedAllocations,
      })
      if (error) {
        throw error
      }

      const updatedBudget = { ...budget, categoryBudgets: normalizedAllocations }
      const updatedBudgets = budgets.map((b) => (b.id === budget.id ? updatedBudget : b))
      setBudgets(updatedBudgets)
      setSelectedBudget(updatedBudget)

      if (!isUndo && changeEntry) {
        setChangeLog((prev) => [...prev, changeEntry])
        if (snackbarMessage) {
          showSnackbarMessage(
            snackbarMessage,
            previousAllocations,
            normalizedAllocations,
            changeEntry.id,
          )
        }
      } else if (isUndo && changeEntry?.id) {
        setChangeLog((prev) => prev.filter((entry) => entry.id !== changeEntry.id))
      }
    } catch (error) {
      console.error("Error updating category allocations:", error)
      alert("Failed to update category allocations. Please try again.")
      if (previousAllocations) {
        syncAllocationState(deepCloneAllocations(previousAllocations))
      }
    } finally {
      setAllocationSaving(false)
    }
  }

  const handleAllocationInputChange = (category, value) => {
    setAllocationDrafts((prev) => ({ ...prev, [category]: value }))
  }

  const commitAllocationChange = async (category, overrideValue) => {
    const target = categoryAllocations.find((cat) => cat.category === category)
    if (!target) return

    const rawValue = overrideValue ?? allocationDrafts[category]
    const parsedValue =
      rawValue === "" || rawValue === null || rawValue === undefined
        ? 0
        : Number.parseFloat(rawValue)

    if (Number.isNaN(parsedValue)) {
      setAllocationDrafts((prev) => ({
        ...prev,
        [category]: toInputValue(target.budgetedAmount),
      }))
      alert("Please enter a valid amount.")
      return
    }

    if (Math.abs(target.budgetedAmount - parsedValue) < 0.005) {
      setAllocationDrafts((prev) => ({
        ...prev,
        [category]: toInputValue(target.budgetedAmount),
      }))
      return
    }

    const timestamp = new Date().toISOString()
    const previousAllocations = deepCloneAllocations(categoryAllocations)
    const updatedAllocations = categoryAllocations.map((cat) =>
      cat.category === category
        ? { ...cat, budgetedAmount: parsedValue, updatedAt: timestamp }
        : cat,
    )

    syncAllocationState(updatedAllocations)

    const changeEntry = {
      id: `${Date.now()}-${category}`,
      category,
      previousAmount: target.budgetedAmount,
      newAmount: parsedValue,
      timestamp,
      type: "update",
    }

    await persistAllocations(updatedAllocations, {
      previousAllocations,
      changeEntry,
      snackbarMessage: `Updated ${category} to $${formatCurrency(parsedValue)}`,
    })
  }

  const handleAddCategory = async (event) => {
    event.preventDefault()
    const trimmedName = sanitizeCategoryName(newCategoryName)
    if (!trimmedName) {
      alert("Enter a category name before adding.")
      return
    }

    const existingCategory = categoryAllocations.find(
      (cat) => cat.category.toLowerCase() === trimmedName.toLowerCase(),
    )

    if (existingCategory) {
      await commitAllocationChange(existingCategory.category, newCategoryAmount)
      setNewCategoryName("")
      setNewCategoryAmount("")
      return
    }

    const parsedAmount =
      newCategoryAmount === "" || newCategoryAmount === null
        ? 0
        : Number.parseFloat(newCategoryAmount)

    if (Number.isNaN(parsedAmount)) {
      alert("Please enter a valid amount for the new category.")
      return
    }

    const timestamp = new Date().toISOString()
    const previousAllocations = deepCloneAllocations(categoryAllocations)
    const newAllocation = {
      category: trimmedName,
      budgetedAmount: parsedAmount,
      updatedAt: timestamp,
    }
    const updatedAllocations = [...categoryAllocations, newAllocation]

    syncAllocationState(updatedAllocations)

    const changeEntry = {
      id: `${Date.now()}-${trimmedName}`,
      category: trimmedName,
      previousAmount: null,
      newAmount: parsedAmount,
      timestamp,
      type: "add",
    }

    await persistAllocations(updatedAllocations, {
      previousAllocations,
      changeEntry,
      snackbarMessage: `Added ${trimmedName} with $${formatCurrency(parsedAmount)}`,
    })

    setNewCategoryName("")
    setNewCategoryAmount("")
  }

  const handleUndoAllocationChange = async () => {
    if (!snackbar) return
    if (snackbarTimer.current) {
      clearTimeout(snackbarTimer.current)
    }

    const { previousAllocations, appliedAllocations, changeId } = snackbar
    setSnackbar(null)

    if (!previousAllocations || previousAllocations.length === 0) {
      return
    }

    syncAllocationState(deepCloneAllocations(previousAllocations))

    await persistAllocations(previousAllocations, {
      previousAllocations: appliedAllocations,
      changeEntry: { id: changeId },
      isUndo: true,
    })
  }

  const expenseCategorySuggestions = useMemo(() => {
    const names = new Set((categories?.expense || []).map((cat) => cat.name))
    categoryAllocations.forEach((cat) => names.add(cat.category))
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [categories, categoryAllocations])

  useEffect(() => {
    const normalized = normalizeCategoryBudgets(budget.categoryBudgets)
    setCategoryAllocations(normalized)
    setAllocationDrafts(convertToDrafts(normalized))
  }, [budget])

  useEffect(() => {
    const normalized = normalizeCategoryBudgets(budget.categoryBudgets)
    setChangeLog(
      normalized.map((cat) => ({
        id: `${budget.id}-${cat.category}-${cat.updatedAt}`,
        category: cat.category,
        previousAmount: null,
        newAmount: cat.budgetedAmount,
        timestamp: cat.updatedAt,
        type: "snapshot",
      })),
    )
    setShowChangeLog(false)
    setSnackbar(null)
    setNewCategoryName("")
    setNewCategoryAmount("")
  }, [budget.id])

  useEffect(() => {
    return () => {
      if (snackbarTimer.current) {
        clearTimeout(snackbarTimer.current)
      }
    }
  }, [])

  const resolveTypeKey = (typeOrTab) => {
    if (typeOrTab === "income" || typeOrTab === "expense") return typeOrTab
    if (typeOrTab === "expenses") return "expense"
    return "income"
  }

  const openAddModal = (preset = {}, typeArg) => {
    const resolvedType = resolveTypeKey(typeArg || tab)
    setFormTx({
      name: "",
      amount: "",
      budgetedAmount: "",
      category: "",
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

  const saveTransaction = async () => {
    if (!formTx.name.trim() || isNaN(formTx.amount) || !formTx.category.trim()) {
      alert("Please fill in all required fields correctly")
      return
    }

    setLoading(true)
    try {
      const cleanedTx = {
        name: formTx.name.trim(),
        amount: Number.parseFloat(formTx.amount),
        budgetedAmount: formTx.budgetedAmount ? Number.parseFloat(formTx.budgetedAmount) : null,
        category: formTx.category,
        type: resolveTypeKey(formTx.type),
        date: formTx.date,
        receipt: formTx.receipt,
      }

      let updatedTransactions
      if (editingTx) {
        const { error } = await updateTransaction(editingTx.id, cleanedTx)
        if (error) {
          console.error("Error updating transaction:", error)
          alert("Failed to update transaction. Please try again.")
          return
        }
        updatedTransactions = (budget.transactions || []).map((t) =>
          t.id === editingTx.id ? { ...cleanedTx, id: editingTx.id } : t,
        )
      } else {
        const { data, error } = await createTransaction(budget.id, cleanedTx)
        if (error) {
          console.error("Error creating transaction:", error)
          alert("Failed to create transaction. Please try again.")
          return
        }
        const newTransaction = {
          ...cleanedTx,
          id: data[0].id,
        }
        updatedTransactions = [...(budget.transactions || []), newTransaction]
      }

      const updatedBudget = { ...budget, transactions: updatedTransactions }
      const updatedBudgets = budgets.map((b) => (b.id === budget.id ? updatedBudget : b))

      setBudgets(updatedBudgets)
      setSelectedBudget(updatedBudgets.find((b) => b.id === budget.id))
      setShowModal(false)
      setEditingTx(null)
    } catch (error) {
      console.error("Error saving transaction:", error)
      alert("Failed to save transaction. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleBudgetNameChange = async (newName) => {
    try {
      const { error } = await updateBudget(budget.id, {
        name: newName,
        categoryBudgets: categoryAllocations,
      })

      if (error) {
        console.error("Error updating budget name:", error)
      } else {
        const updatedBudgets = budgets.map((b) => (b.id === budget.id ? { ...b, name: newName } : b))
        setBudgets(updatedBudgets)
        setSelectedBudget(updatedBudgets.find((b) => b.id === budget.id))
      }
    } catch (error) {
      console.error("Error updating budget name:", error)
    }
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
          🧠 AI Finance Report
        </button>
      </div>

      <input
        className="input budget-title-input no-border"
        value={budget.name}
        onChange={(e) => handleBudgetNameChange(e.target.value)}
        placeholder="Budget Name"
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

      <div className="allocation-editor-card">
        <div className="allocation-header">
          <h3 className="allocation-title">Category Allocations</h3>
          <button
            type="button"
            className="allocation-change-log-toggle"
            onClick={() => setShowChangeLog((prev) => !prev)}
          >
            {showChangeLog ? "Hide Change Log" : "Change Log"}
          </button>
        </div>
        <p className="allocation-subtitle">
          Set spending targets for each category. Changes save automatically and keep a timestamped
          history for this cycle.
        </p>
        <div className="allocation-list">
          {categoryAllocations.length === 0 ? (
            <p className="allocation-empty">No categories yet. Add one below to get started.</p>
          ) : (
            categoryAllocations.map((cat) => (
              <div key={cat.category} className="allocation-row">
                <div className="allocation-info">
                  <span className="allocation-name">{cat.category}</span>
                  <span className="allocation-updated">Updated {formatTimestamp(cat.updatedAt)}</span>
                </div>
                <div className="allocation-actions">
                  <div className="allocation-input-group">
                    <span className="allocation-currency">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="allocation-input"
                      value={allocationDrafts[cat.category] ?? toInputValue(cat.budgetedAmount)}
                      onChange={(e) => handleAllocationInputChange(cat.category, e.target.value)}
                      onBlur={() => commitAllocationChange(cat.category)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          commitAllocationChange(cat.category)
                        }
                      }}
                      disabled={allocationSaving}
                    />
                  </div>
                  <button
                    type="button"
                    className="allocation-save-button secondary-button"
                    onClick={() => commitAllocationChange(cat.category)}
                    disabled={allocationSaving}
                  >
                    Save
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <form className="allocation-add-form" onSubmit={handleAddCategory}>
          <div className="allocation-add-fields">
            <input
              type="text"
              list="allocation-category-suggestions"
              className="allocation-add-input"
              placeholder="Category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              disabled={allocationSaving}
            />
            <input
              type="number"
              step="0.01"
              min="0"
              className="allocation-add-input"
              placeholder="Amount"
              value={newCategoryAmount}
              onChange={(e) => setNewCategoryAmount(e.target.value)}
              disabled={allocationSaving}
            />
          </div>
          <button type="submit" className="allocation-add-button primary-button" disabled={allocationSaving}>
            Add Category
          </button>
        </form>

        <datalist id="allocation-category-suggestions">
          {expenseCategorySuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        {showChangeLog && (
          <div className="allocation-change-log">
            <h4 className="allocation-change-log-title">Change Log</h4>
            {changeLog.length === 0 ? (
              <p className="allocation-empty-log">No allocation adjustments recorded yet.</p>
            ) : (
              <ul className="allocation-change-log-list">
                {changeLog
                  .slice()
                  .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                  .map((entry) => (
                    <li key={entry.id} className="allocation-change-log-item">
                      <span className="allocation-log-time">{formatTimestamp(entry.timestamp)}</span>
                      <span className="allocation-log-category">{entry.category}:</span>
                      {entry.previousAmount !== null ? (
                        <span className="allocation-log-change">
                          {`$${formatCurrency(entry.previousAmount)} → $${formatCurrency(entry.newAmount)}`}
                        </span>
                      ) : (
                        <span className="allocation-log-change">
                          {`Set to $${formatCurrency(entry.newAmount)}`}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
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

      {snackbar && (
        <div className="allocation-snackbar">
          <span className="allocation-snackbar-message">{snackbar.message}</span>
          <button
            type="button"
            className="allocation-snackbar-action"
            onClick={handleUndoAllocationChange}
          >
            Undo
          </button>
        </div>
      )}

      {showModal && (
        <div className="modalBackdrop">
          <div className="modalContent enhanced-modal">
            <h2 className="header modal-header">
              {editingTx ? "Edit Transaction" : `Add ${formTx.type === "expense" ? "Expense" : "Income"}`}
            </h2>

            <input
              className="input"
              placeholder="Description"
              value={formTx.name}
              onChange={(e) => setFormTx({ ...formTx, name: e.target.value })}
              disabled={loading}
            />

            <input
              className="input"
              placeholder="Amount"
              type="number"
              step="0.01"
              value={formTx.amount}
              onChange={(e) => setFormTx({ ...formTx, amount: e.target.value })}
              disabled={loading}
            />

            {formTx.type === "expense" && (
              <input
                className="input"
                placeholder="Budgeted amount (optional)"
                type="number"
                step="0.01"
                value={formTx.budgetedAmount}
                onChange={(e) => setFormTx({ ...formTx, budgetedAmount: e.target.value })}
                disabled={loading}
              />
            )}

            <select
              className="input"
              value={formTx.category}
              onChange={(e) => setFormTx({ ...formTx, category: e.target.value })}
              disabled={loading}
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
                disabled={loading}
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
                    disabled={loading}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="addButton primary-button" onClick={saveTransaction} disabled={loading}>
                {loading ? "Saving..." : editingTx ? "Update" : "Add"} Transaction
              </button>
              <button
                className="cancelButton secondary-button"
                onClick={() => {
                  setShowModal(false)
                  setEditingTx(null)
                }}
                disabled={loading}
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
