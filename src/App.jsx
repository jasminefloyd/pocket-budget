"use client"

import { useState, useEffect } from "react"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import { getBudgets, getGoals, getUserCategories, updateUserCategories } from "./lib/supabase"
import BudgetsScreen from "./screens/BudgetsScreen"
import BudgetDetailsScreen from "./screens/BudgetDetailsScreen"
import CategoriesScreen from "./screens/CategoriesScreen"
import AIInsightsScreen from "./screens/AIInsightsScreen"
import GoalsScreen from "./screens/GoalsScreen"
import LoginScreen from "./screens/LoginScreen"
import LoadingScreen from "./components/LoadingScreen"
import Header from "./components/Header"
import InstallPrompt from "./components/InstallPrompt"

function AppContent() {
  const { user, userProfile, loading: authLoading, initializing } = useAuth()
  const [budgets, setBudgets] = useState([])
  const [goals, setGoals] = useState([])
  const [categories, setCategories] = useState({
    income: [
      { name: "Salary", icon: "💼" },
      { name: "Freelance", icon: "💻" },
      { name: "Investment", icon: "📈" },
      { name: "Business", icon: "🏢" },
      { name: "Gift", icon: "🎁" },
    ],
    expense: [
      { name: "Groceries", icon: "🛒" },
      { name: "Rent", icon: "🏠" },
      { name: "Transportation", icon: "🚗" },
      { name: "Entertainment", icon: "🎮" },
      { name: "Bills", icon: "🧾" },
      { name: "Shopping", icon: "🛍️" },
    ],
  })
  const [selectedBudget, setSelectedBudget] = useState(null)
  const [viewMode, setViewMode] = useState("budgets")
  const [isLoading, setIsLoading] = useState(false)

  // Load user data when authenticated
  useEffect(() => {
    if (user && !authLoading && !initializing) {
      loadUserData()
    }
  }, [user, authLoading, initializing])

  const loadUserData = async () => {
    try {
      setIsLoading(true)

      // Load budgets
      const { data: budgetsData, error: budgetsError } = await getBudgets(user.id)
      if (budgetsError) {
        console.error("Error loading budgets:", budgetsError)
      } else {
        // Transform the data to match the existing structure
        const transformedBudgets =
          budgetsData?.map((budget) => ({
            id: budget.id,
            name: budget.name,
            createdAt: new Date(budget.created_at).toLocaleDateString(),
            categoryBudgets: budget.category_budgets || [],
            transactions:
              budget.transactions?.map((tx) => ({
                id: tx.id,
                name: tx.name,
                amount: tx.amount,
                budgetedAmount: tx.budgeted_amount,
                category: tx.category,
                type: tx.type,
                date: tx.date,
                receipt: tx.receipt_url,
              })) || [],
          })) || []

        setBudgets(transformedBudgets)
      }

      // Load user categories
      const { data: categoriesData, error: categoriesError } = await getUserCategories(user.id)
      if (categoriesError && categoriesError.code !== "PGRST116") {
        console.error("Error loading categories:", categoriesError)
      } else if (categoriesData?.categories) {
        setCategories(categoriesData.categories)
      }

      const { data: goalsData, error: goalsError } = await getGoals(user.id)
      if (goalsError) {
        console.error("Error loading goals:", goalsError)
      } else if (goalsData) {
        setGoals(goalsData)
      }
    } catch (error) {
      console.error("Error loading user data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCategoriesUpdate = async (newCategories) => {
    setCategories(newCategories)
    if (user) {
      try {
        await updateUserCategories(user.id, newCategories)
      } catch (error) {
        console.error("Error updating categories:", error)
      }
    }
  }

  // Show loading screen only during initial auth check (with timeout protection)
  if (initializing) {
    return <LoadingScreen message="Initializing" />
  }

  // Show login screen if not authenticated
  if (!user && !authLoading) {
    return (
      <>
        <LoginScreen />
        <InstallPrompt />
      </>
    )
  }

  // Show loading screen while loading user data (only after auth is confirmed)
  if (user && isLoading) {
    return <LoadingScreen message="Loading your data" />
  }

  // If we have a user but still loading auth, show a brief loading state
  if (authLoading && user) {
    return <LoadingScreen message="Setting up your account" />
  }

  const showPrimaryTabs = ["budgets", "goals"].includes(viewMode)

  return (
    <div className="container">
      <Header title="Pocket Budget" showLogout={viewMode === "budgets" || viewMode === "goals"} />
      <InstallPrompt />

      {showPrimaryTabs && (
        <div className="view-tabs">
          <button
            className={`view-tab ${viewMode === "budgets" ? "active" : ""}`}
            onClick={() => setViewMode("budgets")}
          >
            Budgets
          </button>
          <button
            className={`view-tab ${viewMode === "goals" ? "active" : ""}`}
            onClick={() => setViewMode("goals")}
          >
            Goals
          </button>
        </div>
      )}

      {viewMode === "budgets" && (
        <BudgetsScreen
          budgets={budgets}
          setSelectedBudget={setSelectedBudget}
          setViewMode={setViewMode}
          setBudgets={setBudgets}
          userId={user.id}
        />
      )}
      {viewMode === "goals" && (
        <GoalsScreen
          goals={goals}
          setGoals={setGoals}
          setViewMode={setViewMode}
          userId={user.id}
          userProfile={userProfile}
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
          userId={user.id}
        />
      )}
      {viewMode === "categories" && (
        <CategoriesScreen
          categories={categories}
          setCategories={handleCategoriesUpdate}
          budgets={budgets}
          setViewMode={setViewMode}
        />
      )}
      {viewMode === "ai" && selectedBudget && <AIInsightsScreen budget={selectedBudget} setViewMode={setViewMode} />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
