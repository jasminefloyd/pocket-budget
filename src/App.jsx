"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import { getBudgets, getUserCategories, updateUserCategories } from "./lib/supabase"
import BudgetsScreen from "./screens/BudgetsScreen"
import BudgetDetailsScreen from "./screens/BudgetDetailsScreen"
import CategoriesScreen from "./screens/CategoriesScreen"
import GoalsScreen from "./screens/GoalsScreen"
import AIInsightsScreen from "./screens/AIInsightsScreen"
import LoadingScreen from "./components/LoadingScreen"
import LoginScreen from "./screens/LoginScreen"
import Header from "./components/Header"
import InstallPrompt from "./components/InstallPrompt"
import Footer from "./components/Footer"
import {
  createDefaultBudgetMetadata,
  getBudgetMetadata,
  removeBudgetMetadata,
  updateBudgetMetadata,
} from "./lib/budgetMetadata"

const DEFAULT_CATEGORIES = {
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

const cloneDefaultCategories = () => ({
  income: DEFAULT_CATEGORIES.income.map((category) => ({ ...category })),
  expense: DEFAULT_CATEGORIES.expense.map((category) => ({ ...category })),
})

function AppContent() {
  const { user, loading: authLoading, initializing, status: authStatus } = useAuth()
  const [budgets, setBudgetsState] = useState([])
  const [categories, setCategories] = useState(cloneDefaultCategories)
  const [selectedBudget, setSelectedBudget] = useState(null)
  const [viewMode, setViewMode] = useState("budgets")
  const [dataPhase, setDataPhase] = useState("idle")

  const shouldShowAuthLoading = initializing || authLoading || authStatus === "auth-transition"

  const applyMetadata = useCallback((budget, metadataOverride) => {
    if (!budget?.id) return budget
    const metadata = metadataOverride || budget.metadata || getBudgetMetadata(budget.id)
    const defaults = createDefaultBudgetMetadata()
    const safeMetadata = {
      ...defaults,
      ...metadata,
      cycle: { ...defaults.cycle, ...(metadata?.cycle || {}) },
      ads: { ...defaults.ads, ...(metadata?.ads || {}) },
      insights: {
        ...defaults.insights,
        ...(metadata?.insights || {}),
        nudges: {
          ...defaults.insights.nudges,
          ...(metadata?.insights?.nudges || {}),
        },
      },
      dismissals: { ...defaults.dismissals, ...(metadata?.dismissals || {}) },
    }

    return {
      ...budget,
      metadata: safeMetadata,
      cycleMetadata: safeMetadata.cycle,
      changeLog: safeMetadata.changeLog || [],
      adsEnabled: safeMetadata.ads?.enabled !== false,
      insightsPreferences: safeMetadata.insights,
      dismissedInsights: safeMetadata.dismissals,
    }
  }, [])

  const setBudgets = useCallback(
    (updater) => {
      setBudgetsState((prev) => {
        const nextValue = typeof updater === "function" ? updater(prev) : updater
        if (!Array.isArray(nextValue)) return prev
        return nextValue.map((budget) => applyMetadata(budget, budget?.metadata))
      })
    },
    [applyMetadata],
  )

  useEffect(() => {
    if (!user) {
      setBudgets([])
      setCategories(cloneDefaultCategories())
      setSelectedBudget(null)
      setViewMode("budgets")
      setDataPhase("idle")
    }
  }, [user, setBudgets])

  useEffect(() => {
    if (!user || authLoading || initializing) {
      return
    }

    let isCurrent = true
    setDataPhase("loading")

    const fetchBudgets = getBudgets(user.id)
    const fetchCategories = getUserCategories(user.id)

    Promise.allSettled([fetchBudgets, fetchCategories]).then((results) => {
      if (!isCurrent) return

      const [budgetResult, categoryResult] = results

      if (budgetResult.status === "fulfilled") {
        const { data: budgetsData, error } = budgetResult.value
        if (error) {
          console.error("Error loading budgets:", error)
        }
        const normalizedBudgets = (budgetsData || []).map((budget) => ({
          id: budget.id,
          name: budget.name,
          createdAt: new Date(budget.created_at).toLocaleDateString(),
          categoryBudgets: budget.category_budgets || [],
          transactions: (budget.transactions || []).map((tx) => ({
            id: tx.id,
            name: tx.name,
            amount: Number(tx.amount || 0),
            budgetedAmount: tx.budgeted_amount ?? null,
            category: tx.category,
            type: tx.type,
            date: tx.date,
            receipt: tx.receipt_url ?? null,
          })),
        }))
        setBudgets(normalizedBudgets.map((budget) => applyMetadata(budget)))
      } else {
        console.error("Unexpected error resolving budgets:", budgetResult.reason)
      }

      if (categoryResult.status === "fulfilled") {
        const { data: categoriesData, error } = categoryResult.value
        if (error && error.code !== "PGRST116") {
          console.error("Error loading categories:", error)
        }
        if (categoriesData?.categories) {
          setCategories(categoriesData.categories)
        } else if (error?.code === "PGRST116") {
          setCategories(cloneDefaultCategories())
        }
      } else {
        console.error("Unexpected error resolving categories:", categoryResult.reason)
      }

      setDataPhase("ready")
    })

    return () => {
      isCurrent = false
    }
  }, [user, authLoading, initializing, setBudgets, applyMetadata])

  const updateCategories = async (nextCategories) => {
    setCategories(nextCategories)
    if (!user) return
    try {
      await updateUserCategories(user.id, nextCategories)
    } catch (error) {
      console.error("Error updating categories:", error)
    }
  }

  const handleBudgetMetadataUpdate = useCallback(
    (budgetId, updater) => {
      if (!budgetId) return
      const nextMetadata = updateBudgetMetadata(budgetId, updater)
      setBudgets((prev) =>
        prev.map((budget) => (budget.id === budgetId ? applyMetadata({ ...budget }, nextMetadata) : budget)),
      )
      setSelectedBudget((current) => {
        if (!current || current.id !== budgetId) return current
        return applyMetadata({ ...current }, nextMetadata)
      })
    },
    [applyMetadata, setBudgets],
  )

  const handleBudgetMetadataRemoval = useCallback(
    (budgetId) => {
      if (!budgetId) return
      removeBudgetMetadata(budgetId)
      setSelectedBudget((current) => {
        if (current?.id === budgetId) {
          return null
        }
        return current
      })
    },
    [],
  )

  const activeBudget = useMemo(
    () => budgets.find((budget) => budget.id === selectedBudget?.id) || selectedBudget,
    [budgets, selectedBudget],
  )

  if (initializing) {
    return <LoadingScreen message="Checking your account" />
  }

  if (!user && !authLoading) {
    return (
      <>
        <LoginScreen />
        <InstallPrompt />
      </>
    )
  }

  if (shouldShowAuthLoading) {
    return <LoadingScreen message="Preparing your experience" />
  }

  if (user && dataPhase !== "ready") {
    return <LoadingScreen message={dataPhase === "loading" ? "Loading your budgets" : "Setting things up"} />
  }

  return (
    <div className="container">
      <Header title="Pocket Budget" showLogout={viewMode !== "ai"} />
      <InstallPrompt />

      {viewMode === "budgets" && (
        <BudgetsScreen
          budgets={budgets}
          setSelectedBudget={setSelectedBudget}
          setViewMode={setViewMode}
          setBudgets={setBudgets}
          userId={user.id}
          onMetadataChange={handleBudgetMetadataUpdate}
          onMetadataRemove={handleBudgetMetadataRemoval}
        />
      )}

      {viewMode === "goals" && (
        <GoalsScreen setViewMode={setViewMode} budgets={budgets} setBudgets={setBudgets} />
      )}

      {viewMode === "details" && activeBudget && (
        <BudgetDetailsScreen
          budget={activeBudget}
          categories={categories}
          setViewMode={setViewMode}
          setBudgets={setBudgets}
          budgets={budgets}
          setSelectedBudget={setSelectedBudget}
          onMetadataChange={handleBudgetMetadataUpdate}
        />
      )}

      {viewMode === "categories" && (
        <CategoriesScreen
          categories={categories}
          setCategories={updateCategories}
          budgets={budgets}
          setViewMode={setViewMode}
        />
      )}
      {viewMode === "ai" && activeBudget && <AIInsightsScreen budget={activeBudget} setViewMode={setViewMode} />}

      <Footer viewMode={viewMode} setViewMode={setViewMode} />
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
