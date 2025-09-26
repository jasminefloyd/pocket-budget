"use client"

import { useEffect, useRef, useState } from "react"
import { createTransaction, updateTransaction, updateBudget } from "../lib/supabase"
import {
  buildDefaultCategoryBudgets,
  createClientId,
  ensureCategoryBudgetShape,
  haveCategoryBudgetsChanged,
  normalizeAmount,
} from "../utils/budgetAllocations"

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
  const [categoryBudgetsState, setCategoryBudgetsState] = useState(() => {
    if (budget.categoryBudgets && budget.categoryBudgets.length > 0) {
      return ensureCategoryBudgetShape(budget.categoryBudgets)
    }
    return buildDefaultCategoryBudgets(categories?.expense || [])
  })
  const [changeHistory, setChangeHistory] = useState([])
  const [showChangeLog, setShowChangeLog] = useState(false)
  const [snackbar, setSnackbar] = useState({ open: false, message: "", actionLabel: "", onAction: null })
  const snackbarTimeoutRef = useRef(null)
  const lastPersistedBudgetsRef = useRef(ensureCategoryBudgetShape(categoryBudgetsState))
  const [allocationSaving, setAllocationSaving] = useState(false)

  const ITEMS_PER_PAGE = 7

  useEffect(() => {
    const initialBudgets =
      budget.categoryBudgets && budget.categoryBudgets.length > 0
        ? ensureCategoryBudgetShape(budget.categoryBudgets)
        : buildDefaultCategoryBudgets(categories?.expense || [])

    setCategoryBudgetsState(initialBudgets)
    lastPersistedBudgetsRef.current = initialBudgets.map((item) => ({ ...item }))
    setChangeHistory([])
    setShowChangeLog(false)
  }, [budget.id])

  useEffect(() => {
    if (!budget.categoryBudgets || budget.categoryBudgets.length === 0) {
      return
    }

    const normalized = ensureCategoryBudgetShape(budget.categoryBudgets)
    if (!haveCategoryBudgetsChanged(normalized, lastPersistedBudgetsRef.current)) {
      return
    }

    setCategoryBudgetsState(normalized)
    lastPersistedBudgetsRef.current = normalized.map((item) => ({ ...item }))
  }, [budget.categoryBudgets])

  useEffect(() => {
    return () => {
      if (snackbarTimeoutRef.current) {
        clearTimeout(snackbarTimeoutRef.current)
      }
    }
  }, [])

  const syncBudgetState = (nextCategoryBudgets) => {
    const updatedBudget = { ...budget, categoryBudgets: nextCategoryBudgets }
    const updatedBudgets = budgets.map((b) => (b.id === budget.id ? updatedBudget : b))
    setBudgets(updatedBudgets)
    const refreshed = updatedBudgets.find((b) => b.id === budget.id) || updatedBudget
    setSelectedBudget(refreshed)
  }

  const hideSnackbar = () => {
    if (snackbarTimeoutRef.current) {
      clearTimeout(snackbarTimeoutRef.current)
      snackbarTimeoutRef.current = null
    }
    setSnackbar({ open: false, message: "", actionLabel: "", onAction: null })
  }

  const showSnackbar = (message, actionHandler = null) => {
    hideSnackbar()
    setSnackbar({
      open: true,
      message,
      actionLabel: actionHandler ? "Undo" : "",
      onAction: actionHandler,
    })
    snackbarTimeoutRef.current = setTimeout(() => {
      setSnackbar({ open: false, message: "", actionLabel: "", onAction: null })
      snackbarTimeoutRef.current = null
    }, 4000)
  }

  const persistCategoryBudgets = async (
    nextBudgets,
    description,
    previousBudgets = lastPersistedBudgetsRef.current,
    { touchedIds = [], skipHistory = false, skipSnackbar = false, suppressUndo = false } = {},
  ) => {
    const normalizedPrev = ensureCategoryBudgetShape(previousBudgets).map((item) => ({ ...item }))
    const timestamp = new Date().toISOString()

    const normalizedNext = ensureCategoryBudgetShape(
      nextBudgets.map((item) => {
        const previousMatch = normalizedPrev.find((prevItem) => prevItem.id === item.id)
        const touched = touchedIds.includes(item.id)
        return {
          ...item,
          lastUpdated: touched
            ? timestamp
            : item.lastUpdated || previousMatch?.lastUpdated || timestamp,
        }
      }),
    )

    if (!haveCategoryBudgetsChanged(normalizedNext, normalizedPrev)) {
      setCategoryBudgetsState(normalizedNext)
      return
    }

    let historyEntry = null
    if (!skipHistory && description) {
      historyEntry = {
        id: createClientId("log"),
        timestamp,
        description,
        previous: normalizedPrev.map((item) => ({ ...item })),
        next: normalizedNext.map((item) => ({ ...item })),
      }
      setChangeHistory((prevHistory) => [historyEntry, ...prevHistory])
    }

    setCategoryBudgetsState(normalizedNext)
    syncBudgetState(normalizedNext)
    lastPersistedBudgetsRef.current = normalizedNext.map((item) => ({ ...item }))

    setAllocationSaving(true)
    try {
      await updateBudget(budget.id, {
        name: budget.name,
        categoryBudgets: normalizedNext,
      })

      if (!skipSnackbar && description) {
        if (historyEntry && !suppressUndo) {
          showSnackbar(description, () => handleUndo(historyEntry))
        } else {
          showSnackbar(description, null)
        }
      }
    } catch (error) {
      console.error("Error updating category budgets:", error)
      alert("Failed to update allocations. Changes were reverted.")
      setCategoryBudgetsState(normalizedPrev)
      syncBudgetState(normalizedPrev)
      lastPersistedBudgetsRef.current = normalizedPrev.map((item) => ({ ...item }))
      if (historyEntry) {
        setChangeHistory((prevHistory) => prevHistory.filter((entry) => entry.id !== historyEntry.id))
      }
    } finally {
      setAllocationSaving(false)
    }
  }

  const handleUndo = (entry) => {
    hideSnackbar()
    persistCategoryBudgets(entry.previous, `Reverted: ${entry.description}`, entry.next, {
      touchedIds: entry.previous.map((item) => item.id),
      suppressUndo: true,
    })
  }

  const handleCategoryNameChange = (id, value) => {
    setCategoryBudgetsState((prev) => prev.map((item) => (item.id === id ? { ...item, category: value } : item)))
  }

  const commitCategoryNameChange = (id) => {
    const previous = lastPersistedBudgetsRef.current
    const current = categoryBudgetsState
    const nextEntry = current.find((item) => item.id === id)
    if (!nextEntry) return
    const trimmed = (nextEntry.category || "").trim()
    const prevEntry = previous.find((item) => item.id === id)
    const prevTrimmed = (prevEntry?.category || "").trim()

    if (trimmed === prevTrimmed) {
      if (nextEntry.category !== trimmed) {
        setCategoryBudgetsState((state) =>
          state.map((item) => (item.id === id ? { ...item, category: trimmed } : item)),
        )
      }
      return
    }

    const description = prevTrimmed
      ? trimmed
        ? `Renamed ${prevTrimmed} to ${trimmed}`
        : `Cleared name for ${prevTrimmed}`
      : trimmed
      ? `Named allocation ${trimmed}`
      : "Updated allocation name"

    const timestamped = current.map((item) =>
      item.id === id ? { ...item, category: trimmed, lastUpdated: new Date().toISOString() } : item,
    )

    persistCategoryBudgets(timestamped, description, previous, {
      touchedIds: [id],
    })
  }

  const handleCategoryAmountChange = (id, value) => {
    setCategoryBudgetsState((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        if (value === "") {
          return { ...item, budgetedAmount: "" }
        }
        const numeric = Number.parseFloat(value)
        if (Number.isNaN(numeric)) {
          return item
        }
        return { ...item, budgetedAmount: numeric }
      }),
    )
  }

  const commitCategoryAmountChange = (id) => {
    const previous = lastPersistedBudgetsRef.current
    const current = categoryBudgetsState
    const nextEntry = current.find((item) => item.id === id)
    if (!nextEntry) return

    const prevEntry = previous.find((item) => item.id === id)
    const prevAmount = normalizeAmount(prevEntry?.budgetedAmount ?? 0)
    const nextAmount = normalizeAmount(nextEntry.budgetedAmount)

    if (prevAmount === nextAmount) {
      if (nextEntry.budgetedAmount !== nextAmount) {
        setCategoryBudgetsState((state) =>
          state.map((item) => (item.id === id ? { ...item, budgetedAmount: nextAmount } : item)),
        )
      }
      return
    }

    const label = (nextEntry.category || prevEntry?.category || "Allocation").trim() || "Allocation"
    const description = `Updated ${label} allocation to $${nextAmount.toFixed(2)}`

    const timestamp = new Date().toISOString()
    const timestamped = current.map((item) =>
      item.id === id ? { ...item, budgetedAmount: nextAmount, lastUpdated: timestamp } : item,
    )

    persistCategoryBudgets(timestamped, description, previous, {
      touchedIds: [id],
    })
  }

  const handleAddCategory = () => {
    const timestamp = new Date().toISOString()
    const newCategory = {
      id: createClientId("alloc"),
      category: "",
      budgetedAmount: 0,
      lastUpdated: timestamp,
    }

    const next = [...categoryBudgetsState, newCategory]
    persistCategoryBudgets(next, "Added a new allocation", lastPersistedBudgetsRef.current, {
      touchedIds: [newCategory.id],
    })
  }

  const handleRemoveCategory = (id) => {
    const previous = lastPersistedBudgetsRef.current
    const target = categoryBudgetsState.find((item) => item.id === id)
    const remaining = categoryBudgetsState.filter((item) => item.id !== id)

    const description = target?.category
      ? `Removed ${target.category.trim() || "an allocation"}`
      : "Removed an allocation"

    persistCategoryBudgets(remaining, description, previous, {
      touchedIds: [],
    })
  }

  const formatTimestamp = (value) => {
    if (!value) {
      return "Not updated yet"
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return "Not updated yet"
    }
    return `Updated ${date.toLocaleString()}`
  }

  const describeChangeDetails = (entry) => {
    const details = []
    const prevMap = new Map(entry.previous.map((item) => [item.id, item]))
    const nextMap = new Map(entry.next.map((item) => [item.id, item]))

    entry.next.forEach((item) => {
      const prev = prevMap.get(item.id)
      const nextName = (item.category || "").trim()
      if (!prev) {
        details.push(`${nextName || "New allocation"} added with $${normalizeAmount(item.budgetedAmount).toFixed(2)}`)
        return
      }

      const prevName = (prev.category || "").trim()
      if (prevName !== nextName) {
        details.push(`${prevName || "Allocation"} renamed to ${nextName || "Untitled"}`)
      }

      if (normalizeAmount(prev.budgetedAmount) !== normalizeAmount(item.budgetedAmount)) {
        details.push(
          `${nextName || prevName || "Allocation"}: $${normalizeAmount(prev.budgetedAmount).toFixed(2)} → $${normalizeAmount(
            item.budgetedAmount,
          ).toFixed(2)}`,
        )
      }
    })

    entry.previous.forEach((item) => {
      if (!nextMap.has(item.id)) {
        const prevName = (item.category || "Allocation").trim() || "Allocation"
        details.push(`${prevName} removed`)
      }
    })

    return details
  }

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
        categoryBudgets: ensureCategoryBudgetShape(budget.categoryBudgets),
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

      <section className="allocation-editor">
        <div className="allocation-header">
          <h3 className="allocation-title">Allocation Plan</h3>
          <div className="allocation-header-actions">
            {allocationSaving && <span className="allocation-status">Saving...</span>}
            <button
              type="button"
              className="link-button"
              onClick={() => setShowChangeLog((prev) => !prev)}
            >
              {showChangeLog ? "Hide Change Log" : "Change Log"}
            </button>
          </div>
        </div>
        <p className="allocation-subtitle">
          Plan how much you want to spend in each category. Updates save automatically and power your insights.
        </p>
        <div className="allocation-list">
          {categoryBudgetsState.length === 0 ? (
            <div className="allocation-empty">No allocations yet. Add one to get started.</div>
          ) : (
            categoryBudgetsState.map((row) => {
              const amountValue =
                row.budgetedAmount === "" || row.budgetedAmount === null || row.budgetedAmount === undefined
                  ? ""
                  : row.budgetedAmount

              return (
                <div key={row.id} className="allocation-row">
                  <div className="allocation-row-main">
                    <input
                      className="input allocation-input"
                      value={row.category}
                      onChange={(e) => handleCategoryNameChange(row.id, e.target.value)}
                      onBlur={() => commitCategoryNameChange(row.id)}
                      placeholder="Category name"
                    />
                    <div className="allocation-amount-wrapper">
                      <span className="allocation-currency">$</span>
                      <input
                        className="input allocation-amount-input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={amountValue}
                        onChange={(e) => handleCategoryAmountChange(row.id, e.target.value)}
                        onBlur={() => commitCategoryAmountChange(row.id)}
                      />
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => handleRemoveCategory(row.id)}
                      title="Remove allocation"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="allocation-row-meta">{formatTimestamp(row.lastUpdated)}</div>
                </div>
              )
            })
          )}
        </div>
        <button
          type="button"
          className="secondary-button allocation-add-button"
          onClick={handleAddCategory}
          disabled={allocationSaving}
        >
          + Add Category
        </button>

        {showChangeLog && (
          <div className="change-log">
            <h4>Change Log</h4>
            {changeHistory.length === 0 ? (
              <p className="change-log-empty">No allocation changes yet.</p>
            ) : (
              <ul className="change-log-list">
                {changeHistory.slice(0, 10).map((entry) => {
                  const details = describeChangeDetails(entry)
                  return (
                    <li key={entry.id} className="change-log-item">
                      <div className="change-log-item-header">
                        <span className="change-log-description">{entry.description}</span>
                        <span className="change-log-timestamp">{new Date(entry.timestamp).toLocaleString()}</span>
                      </div>
                      {details.length > 0 && (
                        <ul className="change-log-details">
                          {details.map((detail, index) => (
                            <li key={index}>{detail}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </section>

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
      {snackbar.open && (
        <div className="snackbar">
          <span className="snackbar-message">{snackbar.message}</span>
          {snackbar.actionLabel && (
            <button
              type="button"
              className="snackbar-action"
              onClick={() => {
                hideSnackbar()
                snackbar.onAction?.()
              }}
            >
              {snackbar.actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
