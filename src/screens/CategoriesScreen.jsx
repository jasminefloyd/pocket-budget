import { useState } from "react"

export default function CategoriesScreen({ categories, setCategories, budgets, setViewMode }) {
  const [tab, setTab] = useState("expense")
  const [showAddModal, setShowAddModal] = useState(false)
  const [newCat, setNewCat] = useState({ name: "", icon: "💲" })
  const [editingCat, setEditingCat] = useState(null)

  const iconBank = ["💼", "💻", "📈", "🏢", "🎁", "🍔", "🚗", "🎮", "🧾", "🛍️", "💲", "🏠", "🍿"]

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
    const updated = {
      ...categories,
      [tab]: categories[tab].filter((c) => c.name !== name),
    }
    setCategories(updated)
  }

  return (
    <div>
      <button className="cancelButton secondary-button" onClick={() => setViewMode("budgets")}>
        <i className="fa-solid fa-left-long"></i> Back to Budgets
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
                  {c.icon}  {c.name}
                </span>
                <div className="category-actions">
                  <button className="action-button" onClick={() => startEdit(c)}>
                    <i className="fa-solid fa-pen"></i>
                  </button>
                  <button className="action-button delete" onClick={() => deleteCategory(c.name)}>
                    <i className="fa-solid fa-trash"></i>
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
