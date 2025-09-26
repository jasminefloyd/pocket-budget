"use client"

import { useState, useEffect } from "react"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import { getBudgets, getUserCategories, updateUserCategories } from "./lib/supabase"
import BudgetsScreen from "./screens/BudgetsScreen"
import BudgetDetailsScreen from "./screens/BudgetDetailsScreen"
import CategoriesScreen from "./screens/CategoriesScreen"
import AIInsightsScreen from "./screens/AIInsightsScreen"
import LoginScreen from "./screens/LoginScreen"
import LoadingScreen from "./components/LoadingScreen"
import Header from "./components/Header"
import InstallPrompt from "./components/InstallPrompt"

const BASE_CATEGORIES = {
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
}

const createDefaultCategories = () => ({
  income: BASE_CATEGORIES.income.map((category) => ({ ...category })),
  expense: BASE_CATEGORIES.expense.map((category) => ({ ...category })),
})

function AppContent() {
  const { user, loading: authLoading, initializing } = useAuth()
  const [budgets, setBudgets] = useState([])
  const [categories, setCategories] = useState(createDefaultCategories)
  const [selectedBudget, setSelectedBudget] = useState(null)
  const [viewMode, setViewMode] = useState("budgets")
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!user) {
      setBudgets([])
      setCategories(createDefaultCategories())
      setIsLoading(false)
    }
  }, [user])

  // Load user data when authenticated
  useEffect(() => {
    if (!user || authLoading || initializing) {
      return undefined
    }

    let isActive = true
    setIsLoading(true)

    const budgetsPromise = getBudgets(user.id)
    const categoriesPromise = getUserCategories(user.id)

    budgetsPromise
      .then(({ data: budgetsData, error: budgetsError }) => {
        if (!isActive) return

        if (budgetsError) {
          console.error("Error loading budgets:", budgetsError)
          return
        }

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
      })
      .catch((error) => {
        if (!isActive) return
        console.error("Error loading budgets:", error)
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false)
        }
      })

    categoriesPromise
      .then(({ data: categoriesData, error: categoriesError }) => {
        if (!isActive) return

        if (categoriesError && categoriesError.code !== "PGRST116") {
          console.error("Error loading categories:", categoriesError)
          return
        }

        if (categoriesData?.categories) {
          setCategories(categoriesData.categories)
        }
      })
      .catch((error) => {
        if (!isActive) return
        console.error("Error loading categories:", error)
      })

    return () => {
      isActive = false
    }
  }, [user, authLoading, initializing])

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

  return (
    <div className="container">
      <Header title="Pocket Budget" showLogout={viewMode === "budgets"} />
      <InstallPrompt />

      {viewMode === "budgets" && (
        <BudgetsScreen
          budgets={budgets}
          setSelectedBudget={setSelectedBudget}
          setViewMode={setViewMode}
          setBudgets={setBudgets}
          userId={user.id}
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
