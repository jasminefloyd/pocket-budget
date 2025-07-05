import { useState, useEffect } from "react"
import BudgetsScreen from "./screens/BudgetsScreen"
import BudgetDetailsScreen from "./screens/BudgetDetailsScreen"
import CategoriesScreen from "./screens/CategoriesScreen"
import AIInsightsScreen from "./screens/AIInsightsScreen"
import '@fortawesome/fontawesome-free/css/all.min.css';


export default function App() {
  const [budgets, setBudgets] = useState([])
  const [categories, setCategories] = useState({
    income: [
      { name: "Salary", icon: "💼" },
      { name: "Freelance", icon: "💻" },
      { name: "Investment", icon: "📈" },
      { name: "Business", icon: "🏢" },
      { name: "Gift", icon: "🎁" },
    ],
    expense: [
      { name: "Food", icon: "🍔" },
      { name: "Rent", icon: "🏠" },
      { name: "Transportation", icon: "🚗" },
      { name: "Entertainment", icon: "🎮" },
      { name: "Bills", icon: "🧾" },
      { name: "Shopping", icon: "🛍️" },
    ],
  })
  const [selectedBudget, setSelectedBudget] = useState(null)
  const [viewMode, setViewMode] = useState("budgets")
  const [isLoading, setIsLoading] = useState(true)

  // On first mount: show splash + load example budget
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false)
      const example = {
        id: "example-budget",
        name: "Monthly Budget Example",
        transactions: [
          { id: "t1", name: "Salary", amount: 4500, category: "Salary", date: "1/1/2025", type: "income" },
          { id: "t2", name: "Rent", amount: 1200, category: "Bills", date: "1/3/2025", type: "expense" },
          { id: "t3", name: "Groceries", amount: 320, category: "Food", date: "1/5/2025", type: "expense" },
        ],
        createdAt: "1/1/2025",
      }
      setBudgets([example])
    }, 2000)

    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return (
      <div className="container loading-container">
        <div className="loading-content">
          <h1 className="header">Pocket Budget</h1>
          <p className="loading-text">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      {viewMode === "budgets" && (
        <BudgetsScreen
          budgets={budgets}
          setSelectedBudget={setSelectedBudget}
          setViewMode={setViewMode}
          setBudgets={setBudgets}
        />
      )}
      {viewMode === "details" && selectedBudget && (
        <BudgetDetailsScreen
          budget={selectedBudget}
          categories={categories}
          setViewMode={setViewMode}
          setBudgets={setBudgets}
          budgets={budgets}
          setSelectedBudget={setSelectedBudget}
        />
      )}
      {viewMode === "categories" && (
        <CategoriesScreen
          categories={categories}
          setCategories={setCategories}
          budgets={budgets}
          setViewMode={setViewMode}
        />
      )}
      {viewMode === "ai" && selectedBudget && <AIInsightsScreen budget={selectedBudget} setViewMode={setViewMode} />}
    </div>
  )
}
