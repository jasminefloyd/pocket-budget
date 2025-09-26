"use client"

import { useState, useEffect } from "react"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import { getBudgets, getUserCategories, updateUserCategories } from "./lib/supabase"
import UpgradeBanner from "./components/UpgradeBanner"
import BudgetsScreen from "./screens/BudgetsScreen"
import BudgetDetailsScreen from "./screens/BudgetDetailsScreen"
import CategoriesScreen from "./screens/CategoriesScreen"
import AIInsightsScreen from "./screens/AIInsightsScreen"
import LoginScreen from "./screens/LoginScreen"
import LoadingScreen from "./components/LoadingScreen"
import Header from "./components/Header"
import InstallPrompt from "./components/InstallPrompt"

function AppContent() {
  const {
    user,
    loading: authLoading,
    initializing,
    isPaid,
    isTrialActive,
    trialEndsAt,
    upgradeToPlan,
    planInfo,
    primaryPaidPlan,
  } = useAuth()
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
  const [isLoading, setIsLoading] = useState(false)
  const canAccessAiInsights = isPaid || isTrialActive
  const upgradePlanId = primaryPaidPlan?.id || planInfo?.id

  useEffect(() => {
    if (viewMode === "ai" && !canAccessAiInsights) {
      setViewMode("ai-upsell")
    }
  }, [viewMode, canAccessAiInsights])

  useEffect(() => {
    if (viewMode === "ai-upsell" && canAccessAiInsights) {
      setViewMode("ai")
    }
  }, [viewMode, canAccessAiInsights])

  // Load user data when authenticated
  useEffect(() => {
    if (user && !authLoading && !initializing) {
      loadUserData()
    }
  }, [user, authLoading, initializing])

  const handleUpgrade = async (options = {}) => {
    if (!upgradePlanId) return

    const { error } = await upgradeToPlan(upgradePlanId, options)
    if (error) {
      console.error("Upgrade failed:", error)
    }
  }

  const handleRequestAiReport = () => {
    if (canAccessAiInsights) {
      setViewMode("ai")
    } else {
      setViewMode("ai-upsell")
    }
  }

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
      <Header title="Pocket Budget" showLogout={viewMode === "budgets"} />
      <InstallPrompt />

      {isTrialActive && (
        <UpgradeBanner
          variant="trial"
          plan={primaryPaidPlan || planInfo}
          trialEndsAt={trialEndsAt}
          isTrialActive={isTrialActive}
          onUpgrade={() => handleUpgrade({ startTrial: false })}
        />
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
      {viewMode === "details" && selectedBudget && (
        <BudgetDetailsScreen
          budget={selectedBudget}
          categories={categories}
          setViewMode={setViewMode}
          setBudgets={setBudgets}
          budgets={budgets}
          setSelectedBudget={setSelectedBudget}
          userId={user.id}
          onRequestAi={handleRequestAiReport}
          canAccessAi={canAccessAiInsights}
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
      {viewMode === "ai" && selectedBudget && canAccessAiInsights && (
        <AIInsightsScreen budget={selectedBudget} setViewMode={setViewMode} />
      )}
      {viewMode === "ai-upsell" && selectedBudget && (
        <UpgradeBanner
          variant="upsell"
          plan={primaryPaidPlan || planInfo}
          headline={`Unlock AI Finance Reports for ${selectedBudget.name}`}
          message="AI Finance Reports are available on Pocket Plus. Upgrade to turn your spending into instant insights."
          onUpgrade={() => handleUpgrade({ startTrial: false })}
          secondaryAction={{ label: "Back to budget", onClick: () => setViewMode("details") }}
        />
      )}
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
