import { useState } from "react"
import { updateBudget } from "../lib/supabase"

export default function CategoriesScreen({ categories, setCategories, budgets, setBudgets, setViewMode }) {
  const [tab, setTab] = useState("expense")
  const [showAddModal, setShowAddModal] = useState(false)
  const [newCat, setNewCat] = useState({ name: "", icon: "💲" })
  const [editingCat, setEditingCat] = useState(null)
  const [deleteContext, setDeleteContext] = useState(null)
  const [reallocationChoices, setReallocationChoices] = useState({})
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Curated selection of 32 most useful icons
  const iconBank = [
    "💲", // Money/General
    "💰", // Savings
    "💳", // Credit Card
    "🏦", // Bank
    "🍔", // Food/Fast Food
    "🍽️", // Dining
    "☕", // Coffee/Drinks
    "🛒", // Groceries
    "🚗", // Car/Transportation
    "⛽", // Gas
    "✈️", // Travel
    "🚌", // Public Transport
    "🏠", // Housing/Rent
    "💡", // Utilities
    "📱", // Phone/Mobile
    "💻", // Technology
    "🎮", // Entertainment/Gaming
    "🎬", // Movies
    "📚", // Education/Books
    "🏥", // Healthcare
    "💊", // Medicine
    "🛍️", // Shopping
    "👕", // Clothing
    "🎁", // Gifts
    "💼", // Work/Business
    "📈", // Investment
    "🔧", // Maintenance/Repairs
    "🎯", // Goals/Targets
    "🧾", // Bills/Receipts
    "⭐", // Important/Priority
    "🎉", // Celebration/Events
    "📄", // Documents/Other
  ]

  const addCategory = () => {
    if (!newCat.name.trim()) return
    if (categories[tab].some((c) => c.name === newCat.name.trim())) {
      alert("Category already exists!")
      return
    }
    const updated = {
      ...categories,
      [tab]: [...categories[tab], { name: newCat.name.trim(), icon: newCat.icon }],
    }
    setCategories(updated)
    setShowAddModal(false)
    setNewCat({ name: "", icon: "💲" })
  }

  const startEdit = (cat) => {
    setEditingCat({ ...cat, originalName: cat.name })
  }

  const saveEdit = () => {
    if (!editingCat.name.trim()) return
    const updated = {
      ...categories,
      [tab]: categories[tab].map((c) =>
        c.name === editingCat.originalName ? { name: editingCat.name.trim(), icon: editingCat.icon } : c,
      ),
    }
    setCategories(updated)
    setEditingCat(null)
  }

  const closeDeleteModal = () => {
    setDeleteContext(null)
    setReallocationChoices({})
    setDeleteLoading(false)
  }

  const prepareDelete = (category) => {
    const name = category.name
    const normalizedName = name.toLowerCase().trim()
    const categoryType = tab

    const inUse = budgets.some((b) =>
      (b.transactions || []).some(
        (t) => t.category?.toLowerCase().trim() === normalizedName && t.type === categoryType,
      ),
    )
    if (inUse) {
      alert("Cannot delete category in use.")
      return
    }

    const relevantType = categoryType
    const affectedEntries = budgets.flatMap((budget) => {
      const matches = (budget.categoryBudgets || []).reduce((acc, catBudget, index) => {
        const budgetCategoryName = catBudget.category?.toLowerCase().trim()
        const budgetType = catBudget.type || "expense"
        const amount = Number.parseFloat(catBudget.budgetedAmount ?? 0) || 0
        const matchesType =
          (!catBudget.type && relevantType === "expense") || budgetType === relevantType
        if (budgetCategoryName === normalizedName && matchesType && amount > 0) {
          acc.push({
            key: `${budget.id}-${index}`,
            budgetId: budget.id,
            budgetName: budget.name,
            amount,
            type: budgetType,
            categoryName: catBudget.category,
            categoryBudget: catBudget,
          })
        }
        return acc
      }, [])
      return matches
    })

    const availableCategories = categories[categoryType].filter((c) => c.name !== name)

    if (affectedEntries.length > 0 && availableCategories.length === 0) {
      alert("Add another category to reassign funds before deleting this one.")
      return
    }

    const defaultChoices = {}
    affectedEntries.forEach((entry) => {
      defaultChoices[entry.key] = availableCategories[0]?.name || ""
    })

    setDeleteContext({
      open: true,
      category,
      affectedEntries,
      categoryType,
    })
    setReallocationChoices(defaultChoices)
  }

  const confirmDelete = async () => {
    if (!deleteContext?.category) return

    const { category, affectedEntries, categoryType } = deleteContext
    const requiresReallocation = affectedEntries.length > 0

    if (requiresReallocation) {
      const hasUnselected = affectedEntries.some((entry) => !reallocationChoices[entry.key])
      if (hasUnselected) {
        alert("Please choose where to move the remaining funds for each budget.")
        return
      }
    }

    setDeleteLoading(true)

    try {
      const updatedBudgets = budgets.map((budget) => {
        const relatedEntries = affectedEntries.filter((entry) => entry.budgetId === budget.id)
        if (relatedEntries.length === 0) {
          return budget
        }

        const existingBudgets = budget.categoryBudgets || []
        const filteredBudgets = existingBudgets.filter((catBudget) => {
          const budgetType = catBudget.type || "expense"
          const budgetName = catBudget.category?.toLowerCase().trim()
          return !relatedEntries.some((entry) => {
            const entryType = entry.type || "expense"
            const entryName = entry.categoryName?.toLowerCase().trim()
            return budgetType === entryType && budgetName === entryName
          })
        })

        const reallocatedBudgets = [...filteredBudgets]

        relatedEntries.forEach((entry) => {
          const targetName = reallocationChoices[entry.key]
          if (!targetName) {
            return
          }

          const normalizedTarget = targetName.toLowerCase().trim()
          const entryType = entry.type || "expense"
          const existingIndex = reallocatedBudgets.findIndex((catBudget) => {
            const budgetType = catBudget.type || "expense"
            const budgetName = catBudget.category?.toLowerCase().trim()
            return budgetType === entryType && budgetName === normalizedTarget
          })

          if (existingIndex !== -1) {
            const existing = reallocatedBudgets[existingIndex]
            const currentAmount = Number.parseFloat(existing.budgetedAmount ?? 0) || 0
            reallocatedBudgets[existingIndex] = {
              ...existing,
              budgetedAmount: currentAmount + entry.amount,
            }
          } else {
            const newEntry = {
              category: targetName,
              budgetedAmount: entry.amount,
            }
            if (entry.categoryBudget?.type) {
              newEntry.type = entry.categoryBudget.type
            }
            reallocatedBudgets.push(newEntry)
          }
        })

        return {
          ...budget,
          categoryBudgets: reallocatedBudgets,
        }
      })

      const originalBudgetMap = new Map(budgets.map((budget) => [budget.id, budget]))
      const budgetsToPersist = updatedBudgets.filter((budget) => {
        const original = originalBudgetMap.get(budget.id)
        return (
          JSON.stringify(original?.categoryBudgets || []) !== JSON.stringify(budget.categoryBudgets || [])
        )
      })

      for (const budget of budgetsToPersist) {
        const { error } = await updateBudget(budget.id, {
          name: budget.name,
          categoryBudgets: budget.categoryBudgets || [],
        })
        if (error) {
          throw error
        }
      }

      if (budgetsToPersist.length > 0 && setBudgets) {
        setBudgets(updatedBudgets)
      }

      const updatedCategories = {
        ...categories,
        [categoryType]: categories[categoryType].filter((c) => c.name !== category.name),
      }

      setCategories(updatedCategories)

      if (editingCat?.originalName === category.name) {
        setEditingCat(null)
      }

      closeDeleteModal()
    } catch (error) {
      console.error("Error deleting category:", error)
      alert("Failed to delete category. Please try again.")
      setDeleteLoading(false)
    }
  }

  return (
    <div>
      <button className="cancelButton secondary-button" onClick={() => setViewMode("budgets")}>
        ← Back to Budgets
      </button>
      <h1 className="header">Manage Categories</h1>

      {/* Tabs */}
      <div className="tabRow">
        <button className={tab === "expense" ? "tabActive" : "tabInactive"} onClick={() => setTab("expense")}>
          Expenses
        </button>
        <button className={tab === "income" ? "tabActive" : "tabInactive"} onClick={() => setTab("income")}>
          Income
        </button>
      </div>

      {/* Add category button */}
      <button className="addButton primary-button" onClick={() => setShowAddModal(true)}>
        Add {tab.charAt(0).toUpperCase() + tab.slice(1)} Category
      </button>

      {categories[tab].length === 0 ? (
        <p className="empty-state">No {tab} categories yet.</p>
      ) : (
        categories[tab].map((c) => (
          <div key={c.name} className="transaction category-item">
            {editingCat && editingCat.originalName === c.name ? (
              <div className="category-edit">
                <input
                  className="input"
                  value={editingCat.name}
                  onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
                />
                <div className="icon-selector">
                  {iconBank.map((icon) => (
                    <button
                      key={icon}
                      className={`icon-button ${editingCat.icon === icon ? "selected" : ""}`}
                      onClick={() => setEditingCat({ ...editingCat, icon })}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
                <div className="category-actions">
                  <button className="addButton primary-button" onClick={saveEdit}>
                    Save
                  </button>
                  <button className="cancelButton secondary-button" onClick={() => setEditingCat(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="category-display">
                <span className="category-info">
                  {c.icon} {c.name}
                </span>
                <div className="category-actions">
                  <button className="action-button" onClick={() => startEdit(c)}>
                    Edit
                  </button>
                  <button className="action-button delete" onClick={() => prepareDelete(c)}>
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}

      {/* Add category modal */}
      {showAddModal && (
        <div className="modalBackdrop">
          <div className="modalContent">
            <h2 className="header modal-header">Add {tab.charAt(0).toUpperCase() + tab.slice(1)} Category</h2>
            <input
              className="input"
              placeholder="Category Name"
              value={newCat.name}
              onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
            />
            <div className="icon-selector">
              {iconBank.map((icon) => (
                <button
                  key={icon}
                  className={`icon-button ${newCat.icon === icon ? "selected" : ""}`}
                  onClick={() => setNewCat({ ...newCat, icon })}
                >
                  {icon}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="addButton primary-button" onClick={addCategory}>
                Add
              </button>
              <button className="cancelButton secondary-button" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteContext?.open && (
        <div className="modalBackdrop">
          <div className="modalContent">
            <h2 className="header modal-header">Confirm Deletion</h2>
            <p className="modal-description">
              Removing <strong>{deleteContext.category.name}</strong> will delete the category and reassign any
              remaining budgeted funds. Choose where to move each amount to keep your totals accurate.
            </p>

            {deleteContext.affectedEntries.length > 0 ? (
              <div className="reallocation-list">
                {deleteContext.affectedEntries.map((entry) => {
                  const amountDisplay = `$${entry.amount.toFixed(2)}`
                  const options = categories[deleteContext.categoryType].filter(
                    (option) => option.name !== deleteContext.category.name,
                  )

                  return (
                    <div key={entry.key} className="reallocation-item">
                      <div className="reallocation-details">
                        <span className="reallocation-budget">{entry.budgetName}</span>
                        <span className="reallocation-amount">{amountDisplay}</span>
                      </div>
                      <select
                        className="input"
                        value={reallocationChoices[entry.key] || ""}
                        onChange={(e) =>
                          setReallocationChoices((prev) => ({
                            ...prev,
                            [entry.key]: e.target.value,
                          }))
                        }
                      >
                        <option value="" disabled>
                          Select category
                        </option>
                        {options.map((option) => (
                          <option key={option.name} value={option.name}>
                            {option.icon} {option.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="modal-description">No budgeted funds are tied to this category.</p>
            )}

            <div className="modal-actions">
              <button
                className="addButton primary-button"
                onClick={confirmDelete}
                disabled={
                  deleteLoading ||
                  (deleteContext.affectedEntries.length > 0 &&
                    deleteContext.affectedEntries.some((entry) => !reallocationChoices[entry.key]))
                }
              >
                {deleteLoading ? "Reassigning..." : "Delete Category"}
              </button>
              <button className="cancelButton secondary-button" onClick={closeDeleteModal} disabled={deleteLoading}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
