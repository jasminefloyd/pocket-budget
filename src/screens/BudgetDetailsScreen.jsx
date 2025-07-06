import { useState } from "react";

export default function BudgetDetailsScreen({
  budget,
  categories,
  setViewMode,
  setBudgets,
  budgets,
  setSelectedBudget,
}) {
  const [tab, setTab] = useState("expenses");
  const [showModal, setShowModal] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [expandedReceipts, setExpandedReceipts] = useState({});
  const [formTx, setFormTx] = useState({
    name: "",
    amount: "",
    category: "",
    date: new Date().toLocaleDateString(),
    type: "expense",
    receipt: null,
  });

  const resolveTypeKey = (typeOrTab) => {
    if (typeOrTab === "income" || typeOrTab === "expense") return typeOrTab;
    if (typeOrTab === "expenses") return "expense";
    return "income";
  };

  const openAddModal = (preset = {}, typeArg) => {
    const resolvedType = resolveTypeKey(typeArg || tab);
    setFormTx({
      name: preset.name || "",
      amount: preset.amount || "",
      category: preset.category || "",
      date: new Date().toLocaleDateString(),
      type: resolvedType,
      receipt: null,
    });
    setEditingTx(null);
    setShowModal(true);
  };

  const openEditModal = (tx) => {
    setFormTx({ ...tx });
    setEditingTx(tx);
    setShowModal(true);
  };

  const saveTransaction = () => {
    if (!formTx.name.trim() || isNaN(formTx.amount) || !formTx.category.trim()) {
      alert("Please fill in all fields correctly");
      return;
    }

    const cleanedTx = {
      ...formTx,
      amount: Number.parseFloat(formTx.amount),
      type: resolveTypeKey(formTx.type),
    };

    let updatedTransactions;
    if (editingTx) {
      updatedTransactions = budget.transactions.map((t) =>
        t.id === editingTx.id ? cleanedTx : t
      );
    } else {
      updatedTransactions = [
        ...budget.transactions,
        { ...cleanedTx, id: Date.now().toString() },
      ];
    }

    const updatedBudget = { ...budget, transactions: updatedTransactions };
    const updatedBudgets = budgets.map((b) =>
      b.id === budget.id ? updatedBudget : b
    );

    setBudgets(updatedBudgets);
    setSelectedBudget(updatedBudget);
    setShowModal(false);
    setEditingTx(null);
  };

  const toggleReceipt = (txId) => {
    setExpandedReceipts((prev) => ({
      ...prev,
      [txId]: !prev[txId],
    }));
  };

  const totalIncome = budget.transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = budget.transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = totalIncome - totalExpenses;

  const transactions = budget.transactions
    .filter((t) => t.type === resolveTypeKey(tab))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div>
      <div className="header-nav">
        <button
          className="cancelButton secondary-button"
          onClick={() => setViewMode("budgets")}
        >
          <i className="fa-solid fa-left-long"></i> Back
        </button>
         <button
        className="aiInsightsButton"
        onClick={() => setViewMode("ai")}
        title="View AI Insights"
      >
        <i className="fa-solid fa-brain"></i>
      </button>
      </div>

      <input
        className="input budget-title-input no-border"
        value={budget.name}
        onChange={(e) => {
          const newName = e.target.value;
          const updatedBudgets = budgets.map((b) =>
            b.id === budget.id ? { ...b, name: newName } : b
          );
          setBudgets(updatedBudgets);
          setSelectedBudget(updatedBudgets.find((b) => b.id === budget.id));
        }}
      />

      <div className="balance main-balance">
        Balance:{" "}
        <span className={balance >= 0 ? "income" : "expense"}>
          ${balance.toFixed(2)}
        </span>
      </div>
      {/* Income vs Expenses Bar Chart */}
      <div className="chartContainer">
        <h3 className="chartTitle">Budget Overview</h3>
        <div className="chartWrapper">
          {/* Income Bar (Green) */}
          <div className="incomeBar">
            <div className="incomeBarContent">
              <span className="barLabel">${totalIncome.toFixed(2)}</span>
            </div>
            {/* Expenses Bar (Red) - nested within income bar */}
            {totalIncome > 0 && (
              <div
                className="expenseBar"
                style={{
                  width: `${Math.min((totalExpenses / totalIncome) * 100, 100)}%`,
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: "100%",
                }}
              >
                <span className="barLabel expenseLabel"> ${totalExpenses.toFixed(2)}</span>
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
                You've spent {((totalExpenses / totalIncome) * 100).toFixed(1)}% of your total Budget
                {totalExpenses > totalIncome && <span className="overBudget"> (Over budget!)</span>}
              </span>
            ) : (
              <span>No transactions added yet</span>
            )}
          </div>
        </div>
      </div>
      <hr></hr>

      <div className="category-budgets">
        <h3 className="chartTitle">Transaction Details</h3>
        {(budget.categoryBudgets || []).map((cb) => {
          const actualSpent = budget.transactions
            .filter(
              (t) => t.category === cb.category && t.type === "expense"
            )
            .reduce((sum, t) => sum + t.amount, 0);
          const remaining = cb.budgetedAmount - actualSpent;
          const percentage =
            cb.budgetedAmount > 0
              ? (actualSpent / cb.budgetedAmount) * 100
              : 0;
          const isOver = remaining < 0;

          return (
            <div key={cb.category} className="category-budget-row">
              <div className="category-budget-name">{cb.category}</div>
              <div className="category-budget-progress">
                <span className="category-budget-amounts">
                  ${actualSpent.toFixed(2)} spent / $
                  {cb.budgetedAmount.toFixed(2)} budgeted →
                  <span
                    className={`remaining-amount ${
                      isOver ? "expense" : "income"
                    }`}
                    onClick={() =>
                      openAddModal(
                        {
                          name: `${cb.category} Expense`,
                          category: cb.category,
                          amount: "",
                        },
                        "expense"
                      )
                    }
                  >
                    {isOver
                      ? `Over by $${Math.abs(remaining).toFixed(2)}`
                      : `$${remaining.toFixed(2)} left (click to log)`}
                  </span>
                </span>
                <div className="progress-bar">
                  <div
                    className={`progress-fill ${isOver ? "over" : ""}`}
                    style={{
                      width: `${Math.min(percentage, 100)}%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="tabRow">
        <button
          className={tab === "expenses" ? "tabActive" : "tabInactive"}
          onClick={() => setTab("expenses")}
        >
          Expenses
        </button>
        <button
          className={tab === "income" ? "tabActive" : "tabInactive"}
          onClick={() => setTab("income")}
        >
          Income
        </button>
      </div>

      {transactions.length === 0 ? (
        <p className="empty-state">No {resolveTypeKey(tab)} transactions yet.</p>
      ) : (
        transactions.map((t) => (
          <div
            key={t.id}
            className="transaction"
            onClick={() => openEditModal(t)}
          >
            <div className="transaction-info">
              <div className="transaction-main">
                <span className="transaction-icon">
                  {
                    categories[t.type].find(
                      (c) => c.name === t.category
                    )?.icon
                  }
                </span>
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

      <button className="fab" onClick={() => openAddModal({}, tab)}>
        +
      </button>
  

      {showModal && (
        <div className="modalBackdrop">
          <div className="modalContent">
            <h2 className="header modal-header">
              {editingTx
                ? "Edit Transaction"
                : `Add ${
                    formTx.type.charAt(0).toUpperCase() +
                    formTx.type.slice(1)
                  }`}
            </h2>
            <input
              className="input"
              placeholder="Name"
              value={formTx.name}
              onChange={(e) =>
                setFormTx({ ...formTx, name: e.target.value })
              }
            />
            <input
              className="input"
              placeholder="Amount"
              type="number"
              value={formTx.amount}
              onChange={(e) =>
                setFormTx({ ...formTx, amount: e.target.value })
              }
            />
            <select
              className="input"
              value={formTx.category}
              onChange={(e) =>
                setFormTx({ ...formTx, category: e.target.value })
              }
            >
              <option value="">Select Category</option>
              {categories[resolveTypeKey(formTx.type)]?.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    setFormTx({
                      ...formTx,
                      receipt: reader.result,
                    });
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
            <div className="modal-actions">
              <button
                className="addButton primary-button"
                onClick={saveTransaction}
              >
                {editingTx ? "Update" : "Add"}
              </button>
              <button
                className="cancelButton secondary-button"
                onClick={() => {
                  setShowModal(false);
                  setEditingTx(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
