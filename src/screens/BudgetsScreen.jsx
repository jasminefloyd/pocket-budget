import { useState } from "react";

export default function BudgetsScreen({ budgets, setSelectedBudget, setViewMode, setBudgets }) {
  const [editingBudgetId, setEditingBudgetId] = useState(null);
  const [budgetNameInput, setBudgetNameInput] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);

  const openBudget = (budget) => {
    setSelectedBudget(budget);
    setViewMode("details");
  };

  const createBudget = () => {
    const newBudget = {
      id: Date.now().toString(),
      name: `Budget ${budgets.length + 1}`,
      transactions: [],
      createdAt: new Date().toLocaleDateString(),
      categoryBudgets: []   // ✅ Ensure new budgets have this
    };
    setBudgets([...budgets, newBudget]);
  };

  const saveBudgetName = (budget) => {
    if (!budgetNameInput.trim()) {
      setEditingBudgetId(null);
      return;
    }
    const updated = budgets.map((b) =>
      b.id === budget.id ? { ...b, name: budgetNameInput.trim() } : b
    );
    setBudgets(updated);
    setEditingBudgetId(null);
  };

  const duplicateBudget = (budget) => {
    const copy = {
      ...budget,
      id: Date.now().toString(),
      name: `${budget.name} (Copy)`,
      createdAt: new Date().toLocaleDateString(),
      categoryBudgets: budget.categoryBudgets || [],  // ✅ Ensure copy has array
    };
    setBudgets([...budgets, copy]);
    setOpenMenuId(null);
  };

  const deleteBudget = (budgetId) => {
    setBudgets(budgets.filter((b) => b.id !== budgetId));
    setOpenMenuId(null);
  };

  return (
    <div>
      <div className="header-section">
        <h1 className="header">Pocket Budget</h1>
        <p className="tagline">Manage your budgets and stay on top of your finances.</p>
      </div>

      {budgets.length === 0 ? (
        <p className="empty-state">No budgets found. Create one to get started!</p>
      ) : (
        budgets.map((budget) => {
          const totalIncome = (budget.transactions || [])
            .filter((t) => t.type === "income")
            .reduce((sum, t) => sum + t.amount, 0);

          const totalExpenses = (budget.transactions || [])
            .filter((t) => t.type === "expense")
            .reduce((sum, t) => sum + t.amount, 0);

          const balance = totalIncome - totalExpenses;

          // ✅ Safely map categoryBudgets
          const categorySummaries = (budget.categoryBudgets || []).map((cat) => {
            const actual = (budget.transactions || [])
              .filter(
                (t) =>
                  t.type === "expense" &&
                  t.category.toLowerCase().trim() === cat.name.toLowerCase().trim()
              )
              .reduce((sum, t) => sum + t.amount, 0);

            const isOver = actual > cat.budgetAmount;
            return { ...cat, actual, isOver };
          });

          const isAnyCategoryOver = categorySummaries.some((cat) => cat.isOver);

          return (
            <div key={budget.id} className="budgetCard">
              <div className="budgetCard-content" onClick={() => openBudget(budget)}>
                <div className="budgetCard-info">
                  {editingBudgetId === budget.id ? (
                    <input
                      className="input budget-name-input"
                      value={budgetNameInput}
                      onChange={(e) => setBudgetNameInput(e.target.value)}
                      onBlur={() => saveBudgetName(budget)}
                      autoFocus
                    />
                  ) : (
                    <div
                      className="budgetName"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingBudgetId(budget.id);
                        setBudgetNameInput(budget.name);
                      }}
                    >
                      {budget.name}
                      {isAnyCategoryOver && (
                        <span className="expense" style={{ marginLeft: "0.5rem" }}>🚩</span>
                      )}
                    </div>
                  )}

                  <div className="budgetBalance">
                    Balance: <span className={balance >= 0 ? "income" : "expense"}>${balance.toFixed(2)}</span>
                  </div>

                  <div className="category-budgets">
                    {categorySummaries.map((cat) => (
                      <div key={cat.name} className="category-budget-row">
                        <div className="category-budget-name">
                          {cat.name}
                          {cat.isOver && <span className="expense" style={{ marginLeft: "0.3rem" }}>⚠</span>}
                        </div>
                        <div className="category-budget-amounts">
                          ${cat.actual.toFixed(2)} / ${cat.budgetAmount.toFixed(2)}
                        </div>
                        <div className="progress-bar">
                          <div
                            className={`progress-fill ${cat.isOver ? "over" : ""}`}
                            style={{
                              width: `${Math.min((cat.actual / cat.budgetAmount) * 100, 100)}%`
                            }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="menuContainer">
                  <button
                    className="menuButton"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === budget.id ? null : budget.id);
                    }}
                  >
                    <i className="fa-solid fa-ellipsis-vertical"></i>
                  </button>
                  {openMenuId === budget.id && (
                    <div className="dropdownMenu">
                      <button className="dropdownItem" onClick={() => duplicateBudget(budget)}>
                        <i className="fa-solid fa-clone"></i> Copy
                      </button>
                      <button className="dropdownItem delete" onClick={() => deleteBudget(budget.id)}>
                        <i className="fa-solid fa-trash"></i> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}

      <button className="addButton primary-button" onClick={createBudget}>
        Create Budget
      </button>
      <button className="cancelButton secondary-button cate-btn" onClick={() => setViewMode("categories")}>
        Manage Categories
      </button>
    </div>
  );
}
