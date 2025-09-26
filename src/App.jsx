"use client"

import { useState, useEffect } from "react"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import { getBudgets, getUserCategories, updateUserCategories } from "./lib/supabase"
import BudgetsScreen from "./screens/BudgetsScreen"
import BudgetDetailsScreen from "./screens/BudgetDetailsScreen"
import CategoriesScreen from "./screens/CategoriesScreen"
import AIInsightsScreen from "./screens/AIInsightsScreen"
import GoalsScreen from "./screens/GoalsScreen"
import LoginScreen from "./screens/LoginScreen"
import LoadingScreen from "./components/LoadingScreen"
import Header from "./components/Header"
import Footer from "./components/Footer"
import InstallPrompt from "./components/InstallPrompt"

function AppContent() {
  const { user, loading: authLoading, initializing, userProfile } = useAuth()
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
  const [previousViewBeforeGoals, setPreviousViewBeforeGoals] = useState("budgets")
  const [goals, setGoals] = useState([
    {
      id: "goal-1",
      name: "Emergency Fund",
      targetAmount: 5000,
      savedAmount: 2600,
      dueDate: "2025-01-15",
      milestones: [
        { id: "goal-1-m1", name: "Starter Cushion", amount: 1000, completed: true },
        { id: "goal-1-m2", name: "3 Months of Expenses", amount: 3000, completed: false },
        { id: "goal-1-m3", name: "6 Months of Expenses", amount: 5000, completed: false },
      ],
    },
    {
      id: "goal-2",
      name: "Home Down Payment",
      targetAmount: 20000,
      savedAmount: 8200,
      dueDate: "2026-06-01",
      milestones: [
        { id: "goal-2-m1", name: "Research Neighborhoods", amount: 0, completed: true },
        { id: "goal-2-m2", name: "Save 25%", amount: 5000, completed: true },
        { id: "goal-2-m3", name: "Save 50%", amount: 10000, completed: false },
        { id: "goal-2-m4", name: "Save 100%", amount: 20000, completed: false },
      ],
    },
  ])
  const [isLoading, setIsLoading] = useState(false)

  const resolvePlan = (profile) => {
    if (!profile) return "Free"

    const possibleKeys = [
      "planTier",
      "plan_tier",
      "plan",
      "subscriptionTier",
      "subscription_tier",
      "accountType",
      "account_type",
      "membership",
      "membership_tier",
    ]

    for (const key of possibleKeys) {
      const value = profile?.[key]
      if (typeof value === "string" && value.trim()) {
        return value
      }
    }

    return "Free"
  }

  const planName = resolvePlan(userProfile)
  const isPaidUser = planName?.toLowerCase?.() !== "free"

  const navigateTo = (mode) => {
    if (!mode || mode === viewMode) return

    if (mode === "goals") {
      setPreviousViewBeforeGoals(viewMode)
      setViewMode("goals")
      return
    }

    setPreviousViewBeforeGoals(mode)
    setViewMode(mode)
  }

  const exitGoals = () => {
    setViewMode(previousViewBeforeGoals || "budgets")
  }

  const handleCreateGoal = () => {
    if (!isPaidUser) {
      return
    }

    const newGoalId = `goal-${Date.now()}`
    const newGoal = {
      id: newGoalId,
      name: "New Savings Goal",
      targetAmount: 1000,
      savedAmount: 0,
      dueDate: new Date().toISOString().slice(0, 10),
      milestones: [
        { id: `${newGoalId}-m1`, name: "Define the goal", amount: 0, completed: true },
        { id: `${newGoalId}-m2`, name: "Save the first $250", amount: 250, completed: false },
        { id: `${newGoalId}-m3`, name: "Save the first $500", amount: 500, completed: false },
        { id: `${newGoalId}-m4`, name: "Celebrate progress", amount: 1000, completed: false },
      ],
    }

    setGoals((prev) => [newGoal, ...prev])
  }

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

  return (
    <div className="container">
      <Header
        title="Pocket Budget"
        showLogout={viewMode === "budgets"}
        activeView={viewMode}
        onNavigate={navigateTo}
        onExitGoals={exitGoals}
        isPaidUser={isPaidUser}
        planName={planName}
      />
      <InstallPrompt />

      {viewMode === "budgets" && (
        <BudgetsScreen
          budgets={budgets}
          setSelectedBudget={setSelectedBudget}
          setViewMode={navigateTo}
          setBudgets={setBudgets}
          userId={user.id}
        />
      )}
      {viewMode === "details" && selectedBudget && (
        <BudgetDetailsScreen
          budget={selectedBudget}
          categories={categories}
          setViewMode={navigateTo}
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
          setViewMode={navigateTo}
        />
      )}
      {viewMode === "ai" && selectedBudget && (
        <AIInsightsScreen budget={selectedBudget} setViewMode={navigateTo} />
      )}
      {viewMode === "goals" && (
        <GoalsScreen
          goals={goals}
          isPaidUser={isPaidUser}
          onCreateGoal={handleCreateGoal}
          onExit={exitGoals}
          previousViewMode={previousViewBeforeGoals}
          planName={planName}
        />
      )}
      <Footer
        activeView={viewMode}
        onNavigate={navigateTo}
        onExitGoals={exitGoals}
        isPaidUser={isPaidUser}
        planName={planName}
      />
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
