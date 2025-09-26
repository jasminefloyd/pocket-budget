import { useState } from "react"
import { updateBudget } from "../lib/supabase"

export default function CategoriesScreen({ categories, setCategories, budgets, setViewMode }) {
  const [tab, setTab] = useState("expense")
  const [showAddModal, setShowAddModal] = useState(false)
  const [newCat, setNewCat] = useState({ name: "", icon: "💲" })
  const [editingCat, setEditingCat] = useState(null)
  const [deleteContext, setDeleteContext] = useState(null)
  const [reallocationSelections, setReallocationSelections] = useState({})
  const [deleteError, setDeleteError] = useState("")
  const [deleteLoading, setDeleteLoading] = useState(false)

  const REMOVE_OPTION = "__REMOVE__"

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

  const deleteCategory = (name) => {
    const inUse = budgets.some((b) => b.transactions.some((t) => t.category === name && t.type === tab))
    if (inUse) {
      alert("Cannot delete category in use.")
      return
    }
    const budgetsUsingCategory = budgets.filter((budget) =>
      (budget.categoryBudgets || []).some((categoryBudget) => categoryBudget.category === name),
    )

    setDeleteContext({
      category: name,
      type: tab,
      budgets: budgetsUsingCategory,
      step: "confirm",
    })
    setReallocationSelections({})
    setDeleteError("")
  }

  const closeDeleteModal = () => {
    setDeleteContext(null)
    setReallocationSelections({})
    setDeleteError("")
    setDeleteLoading(false)
  }

  const finalizeCategoryRemoval = () => {
    if (!deleteContext) return

    const updated = {
      ...categories,
      [deleteContext.type]: categories[deleteContext.type].filter((c) => c.name !== deleteContext.category),
    }

    setCategories(updated)

    if (editingCat?.originalName === deleteContext.category) {
      setEditingCat(null)
    }

    closeDeleteModal()
  }

  const proceedToReallocation = () => {
    if (!deleteContext) return

    if (deleteContext.budgets.length === 0) {
      finalizeCategoryRemoval()
      return
    }

    const otherCategories = categories[deleteContext.type].filter(
      (category) => category.name !== deleteContext.category,
    )

    const initialSelections = {}
    deleteContext.budgets.forEach((budget) => {
      initialSelections[budget.id] = otherCategories.length === 0 ? REMOVE_OPTION : ""
    })

    setReallocationSelections(initialSelections)
    setDeleteError("")
    setDeleteContext((prev) => (prev ? { ...prev, step: "reallocate" } : prev))
  }

  const handleReallocationChange = (budgetId, value) => {
    setDeleteError("")
    setReallocationSelections((prev) => ({
      ...prev,
      [budgetId]: value,
    }))
  }

  const submitReallocation = async () => {
    if (!deleteContext) return

    const otherCategories = categories[deleteContext.type].filter(
      (category) => category.name !== deleteContext.category,
    )

    const needsSelection = deleteContext.budgets.some(
      (budget) => !reallocationSelections[budget.id] && otherCategories.length > 0,
    )

    if (needsSelection) {
      setDeleteError("Please select a destination for each allocation or choose to remove it.")
      return
    }

    setDeleteLoading(true)
    setDeleteError("")

    try {
      await Promise.all(
        deleteContext.budgets.map(async (budget) => {
          const allocation = (budget.categoryBudgets || []).find(
            (categoryBudget) => categoryBudget.category === deleteContext.category,
          )

          if (!allocation) return

          const amount = Number.parseFloat(allocation.budgetedAmount) || 0

          const updatedAllocations = (budget.categoryBudgets || [])
            .filter((categoryBudget) => categoryBudget.category !== deleteContext.category)
            .map((categoryBudget) => ({ ...categoryBudget }))

          const selection =
            reallocationSelections[budget.id] || (otherCategories.length === 0 ? REMOVE_OPTION : "")

          if (selection && selection !== REMOVE_OPTION && amount > 0) {
            const existingTarget = updatedAllocations.find((entry) => entry.category === selection)
            if (existingTarget) {
              const currentAmount = Number.parseFloat(existingTarget.budgetedAmount) || 0
              existingTarget.budgetedAmount = currentAmount + amount
            } else {
              updatedAllocations.push({ category: selection, budgetedAmount: amount })
            }
          }

          const { error } = await updateBudget(budget.id, {
            name: budget.name,
            categoryBudgets: updatedAllocations,
          })

          if (error) {
            throw error
          }
        }),
      )

      finalizeCategoryRemoval()
    } catch (error) {
      console.error("Error updating budget allocations:", error)
      setDeleteError("Failed to update budget allocations. Please try again.")
    } finally {
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
                  <button className="action-button delete" onClick={() => deleteCategory(c.name)}>
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

      {deleteContext && (
        <div className="modalBackdrop">
          <div className="modalContent">
            {deleteContext.step === "confirm" ? (
              <>
                <h2 className="header modal-header">Delete Category</h2>
                <p>
                  Are you sure you want to delete the <strong>{deleteContext.category}</strong> {deleteContext.type}
                  {" "}
                  category?
                </p>
                {deleteContext.budgets.length > 0 && (
                  <p>
                    This category has allocations in {deleteContext.budgets.length} budget
                    {deleteContext.budgets.length > 1 ? "s" : ""}. You'll need to reallocate them before
                    continuing.
                  </p>
                )}
                <div className="modal-actions">
                  <button className="cancelButton secondary-button" onClick={closeDeleteModal}>
                    Cancel
                  </button>
                  <button className="addButton primary-button" onClick={proceedToReallocation}>
                    {deleteContext.budgets.length > 0 ? "Continue" : "Delete"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="header modal-header">Reallocate Budget</h2>
                <p>
                  Move the remaining budget from <strong>{deleteContext.category}</strong> before deleting it.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
                  {deleteContext.budgets.map((budget) => {
                    const allocation = (budget.categoryBudgets || []).find(
                      (categoryBudget) => categoryBudget.category === deleteContext.category,
                    )
                    const amount = Number.parseFloat(allocation?.budgetedAmount) || 0
                    const availableCategories = categories[deleteContext.type].filter(
                      (category) => category.name !== deleteContext.category,
                    )

                    return (
                      <div
                        key={budget.id}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: "12px",
                          padding: "0.75rem 1rem",
                          background: "#f9fafb",
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{budget.name}</div>
                        <div style={{ margin: "0.25rem 0 0.75rem", color: "#4b5563" }}>
                          ${amount.toFixed(2)} allocated to {deleteContext.category}
                        </div>
                        {availableCategories.length === 0 ? (
                          <div style={{ color: "#6b7280" }}>
                            No other categories available. This allocation will be removed.
                          </div>
                        ) : (
                          <select
                            className="input"
                            value={reallocationSelections[budget.id] ?? ""}
                            onChange={(e) => handleReallocationChange(budget.id, e.target.value)}
                          >
                            <option value="" disabled>
                              Select a new category
                            </option>
                            {availableCategories.map((option) => (
                              <option key={option.name} value={option.name}>
                                {option.icon} {option.name}
                              </option>
                            ))}
                            <option value={REMOVE_OPTION}>Remove allocation</option>
                          </select>
                        )}
                      </div>
                    )
                  })}
                </div>
                {deleteError && <div className="error-message">{deleteError}</div>}
                <div className="modal-actions">
                  <button
                    className="cancelButton secondary-button"
                    onClick={() => setDeleteContext((prev) => (prev ? { ...prev, step: "confirm" } : prev))}
                    disabled={deleteLoading}
                  >
                    Back
                  </button>
                  <button className="addButton primary-button" onClick={submitReallocation} disabled={deleteLoading}>
                    {deleteLoading ? "Saving..." : "Save & Delete"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
