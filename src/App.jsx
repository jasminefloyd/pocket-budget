"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import { getBudgets, getUserCategories, updateUserCategories } from "./lib/supabase"
import BudgetsScreen from "./screens/BudgetsScreen"
import BudgetDetailsScreen from "./screens/BudgetDetailsScreen"
import CategoriesScreen from "./screens/CategoriesScreen"
import GoalsScreen from "./screens/GoalsScreen"
import AIInsightsScreen from "./screens/AIInsightsScreen"
import ReportsScreen from "./screens/ReportsScreen"
import SettingsScreen from "./screens/SettingsScreen"
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

const cloneCategories = (categories) => ({
  income: Array.isArray(categories.income)
    ? categories.income.map((category) => ({ ...category }))
    : [],
  expense: Array.isArray(categories.expense)
    ? categories.expense.map((category) => ({ ...category }))
    : [],
})

const isValidCategoriesShape = (value) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Array.isArray(value.income) &&
  Array.isArray(value.expense)

const sanitizeCategories = (value) => {
  if (!isValidCategoriesShape(value)) {
    return null
  }

  return cloneCategories({
    income: value.income.filter((category) => category && typeof category === "object"),
    expense: value.expense.filter((category) => category && typeof category === "object"),
  })
}

const BUDGET_CACHE_VERSION = 1
const CATEGORY_CACHE_VERSION = 1

const getBudgetCacheKey = (userId) => `pb:cache:budgets:${userId}`
const getCategoryCacheKey = (userId) => `pb:cache:categories:${userId}`

const safeJsonParse = (value) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch (error) {
    console.warn("Failed to parse cached payload", error)
    return null
  }
}

const normalizeCachedTransaction = (transaction) => ({
  id: transaction.id,
  name: transaction.name || "",
  amount: Number(transaction.amount || 0),
  budgetedAmount: transaction.budgetedAmount ?? transaction.budgeted_amount ?? null,
  category: transaction.category || "",
  type: transaction.type === "income" ? "income" : "expense",
  date: transaction.date || null,
  receipt: transaction.receipt ?? transaction.receipt_url ?? null,
})

const normalizeCachedBudget = (budget) => ({
  id: budget.id,
  name: budget.name || "Untitled Budget",
  createdAt: budget.createdAt || budget.created_at || new Date().toLocaleDateString(),
  categoryBudgets: Array.isArray(budget.categoryBudgets || budget.category_budgets)
    ? (budget.categoryBudgets || budget.category_budgets).map((category) => ({
        category: category.category || "",
        budgetedAmount: Number(category.budgetedAmount ?? category.budgeted_amount ?? 0),
      }))
    : [],
  transactions: Array.isArray(budget.transactions)
    ? budget.transactions.map((transaction) => normalizeCachedTransaction(transaction))
    : [],
  metadata: budget.metadata || null,
})

const extractCachedBudgets = (value) => {
  if (!value) return []
  const budgetsArray = Array.isArray(value?.budgets) ? value.budgets : Array.isArray(value) ? value : []
  return budgetsArray
    .filter((budget) => budget && typeof budget === "object" && budget.id)
    .map((budget) => normalizeCachedBudget(budget))
}

const prepareBudgetsForCache = (budgets) =>
  (budgets || [])
    .filter((budget) => budget && typeof budget === "object" && budget.id)
    .map((budget) => normalizeCachedBudget(budget))

const extractCachedCategories = (value) => {
  if (!value) return null
  const payload = value.categories ?? value
  return sanitizeCategories(payload)
}

const prepareCategoriesForCache = (categories) => {
  const sanitized = sanitizeCategories(categories)
  return sanitized ? cloneCategories(sanitized) : null
}

function AppContent() {
  const { user, loading: authLoading, initializing, status: authStatus } = useAuth()
  const [budgets, setBudgetsState] = useState([])
  const [categories, setCategories] = useState(cloneDefaultCategories)
  const [selectedBudget, setSelectedBudget] = useState(null)
  const [viewMode, setViewMode] = useState("budgets")
  const [dataPhase, setDataPhase] = useState("idle")
  const [cacheStatus, setCacheStatus] = useState({ budgets: false, categories: false })
  const lastFetchedUserIdRef = useRef(null)
  const cacheStatusRef = useRef(cacheStatus)
  const refreshTimerRef = useRef(null)
  const budgetsCacheSnapshotRef = useRef("")
  const categoriesCacheSnapshotRef = useRef("")
  const hasCachedData = cacheStatus.budgets || cacheStatus.categories

  useEffect(() => {
    cacheStatusRef.current = cacheStatus
  }, [cacheStatus])

  const shouldShowAuthLoading = initializing || authLoading || authStatus === "auth-transition"
  const markDataAsStale = useCallback(() => {
    if (!user?.id) return
    if (refreshTimerRef.current) return

    const hasCache = cacheStatusRef.current.budgets || cacheStatusRef.current.categories
    const delay = hasCache ? 200 : 0

    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null
      lastFetchedUserIdRef.current = null
      const latestHasCache = cacheStatusRef.current.budgets || cacheStatusRef.current.categories
      setDataPhase((previous) => {
        if (!latestHasCache && previous === "loading") {
          return previous
        }
        return latestHasCache ? "refreshing" : "loading"
      })
    }, delay)
  }, [user?.id])

  const applyMetadata = useCallback((budget, metadataOverride) => {
    if (!budget?.id) return budget
    const metadata = metadataOverride || budget.metadata || getBudgetMetadata(budget.id)
    const defaults = createDefaultBudgetMetadata()
    const safeMetadata = {
      ...defaults,
      ...metadata,
      cycle: { ...defaults.cycle, ...(metadata?.cycle || {}) },
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
      lastFetchedUserIdRef.current = null
      budgetsCacheSnapshotRef.current = ""
      categoriesCacheSnapshotRef.current = ""
      cacheStatusRef.current = { budgets: false, categories: false }
      setCacheStatus({ budgets: false, categories: false })
    }
  }, [user, setBudgets])

  useEffect(() => {
    if (!user?.id) return
    if (typeof window === "undefined") return

    let budgetsFound = false
    let categoriesFound = false

    try {
      const rawBudgets = window.localStorage.getItem(getBudgetCacheKey(user.id))
      const parsedBudgets = safeJsonParse(rawBudgets)
      const cachedBudgets = extractCachedBudgets(parsedBudgets)
      if (cachedBudgets.length > 0) {
        budgetsFound = true
        budgetsCacheSnapshotRef.current = JSON.stringify(cachedBudgets)
        setBudgets(cachedBudgets)
        setSelectedBudget((current) => {
          if (current && cachedBudgets.some((budget) => budget.id === current.id)) {
            return current
          }
          return cachedBudgets[0] || current
        })
      } else {
        budgetsCacheSnapshotRef.current = ""
      }
    } catch (error) {
      console.warn("Failed to restore cached budgets", error)
      budgetsCacheSnapshotRef.current = ""
    }

    try {
      const rawCategories = window.localStorage.getItem(getCategoryCacheKey(user.id))
      const parsedCategories = safeJsonParse(rawCategories)
      const cachedCategories = extractCachedCategories(parsedCategories)
      if (cachedCategories) {
        categoriesFound = true
        categoriesCacheSnapshotRef.current = JSON.stringify(cachedCategories)
        setCategories(cachedCategories)
      } else {
        categoriesCacheSnapshotRef.current = ""
      }
    } catch (error) {
      console.warn("Failed to restore cached categories", error)
      categoriesCacheSnapshotRef.current = ""
    }

    if (budgetsFound || categoriesFound) {
      setDataPhase((prev) => (prev === "idle" ? "hydrated" : prev))
    }

    setCacheStatus((prev) => {
      const next = { budgets: budgetsFound, categories: categoriesFound }
      if (prev.budgets === next.budgets && prev.categories === next.categories) {
        return prev
      }
      return next
    })
  }, [user?.id, setBudgets, setSelectedBudget])

  useEffect(
    () => () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (!user?.id) return
    if (typeof window === "undefined") return
    if (dataPhase === "idle") return

    const payload = prepareBudgetsForCache(budgets)
    const serialized = JSON.stringify(payload)

    if (serialized !== budgetsCacheSnapshotRef.current) {
      budgetsCacheSnapshotRef.current = serialized
      try {
        window.localStorage.setItem(
          getBudgetCacheKey(user.id),
          JSON.stringify({
            version: BUDGET_CACHE_VERSION,
            savedAt: Date.now(),
            budgets: payload,
          }),
        )
      } catch (error) {
        console.warn("Failed to persist budgets cache", error)
      }
    }

    setCacheStatus((prev) => {
      const hasBudgets = payload.length > 0
      if (prev.budgets === hasBudgets) {
        return prev
      }
      return { ...prev, budgets: hasBudgets }
    })
  }, [budgets, user?.id, dataPhase])

  useEffect(() => {
    if (!user?.id) return
    if (typeof window === "undefined") return
    if (dataPhase === "idle") return

    const payload = prepareCategoriesForCache(categories)
    if (!payload) return

    const serialized = JSON.stringify(payload)

    if (serialized !== categoriesCacheSnapshotRef.current) {
      categoriesCacheSnapshotRef.current = serialized
      try {
        window.localStorage.setItem(
          getCategoryCacheKey(user.id),
          JSON.stringify({
            version: CATEGORY_CACHE_VERSION,
            savedAt: Date.now(),
            categories: payload,
          }),
        )
      } catch (error) {
        console.warn("Failed to persist categories cache", error)
      }
    }

    setCacheStatus((prev) => {
      if (prev.categories) {
        return prev
      }
      return { ...prev, categories: true }
    })
  }, [categories, user?.id, dataPhase])

  useEffect(() => {
    if (!user || authLoading || initializing) {
      return
    }

    if (lastFetchedUserIdRef.current === user.id) {
      return
    }

    const currentUserId = user.id
    lastFetchedUserIdRef.current = currentUserId
    let isCurrent = true
    setDataPhase(hasCachedData ? "refreshing" : "loading")

    const fetchBudgets = getBudgets(currentUserId)
    const fetchCategories = getUserCategories(currentUserId)

    Promise.allSettled([fetchBudgets, fetchCategories]).then((results) => {
      if (!isCurrent) return

      const [budgetResult, categoryResult] = results
      let encounteredError = false

      if (budgetResult.status === "fulfilled") {
        const { data: budgetsData, error } = budgetResult.value
        if (error) {
          console.error("Error loading budgets:", error)
          encounteredError = true
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
        setBudgets(normalizedBudgets)
      } else {
        console.error("Unexpected error resolving budgets:", budgetResult.reason)
        encounteredError = true
      }

      if (categoryResult.status === "fulfilled") {
        const { data: categoriesData, error } = categoryResult.value
        if (error && error.code !== "PGRST116") {
          console.error("Error loading categories:", error)
          encounteredError = true
        }
        const validatedCategories = sanitizeCategories(categoriesData?.categories)

        if (validatedCategories) {
          setCategories(validatedCategories)
        } else if (categoriesData?.categories !== undefined) {
          console.warn("Received malformed categories payload, using defaults instead.")
          setCategories(cloneDefaultCategories())
        } else if (error?.code === "PGRST116") {
          setCategories(cloneDefaultCategories())
        }
      } else {
        console.error("Unexpected error resolving categories:", categoryResult.reason)
        encounteredError = true
      }

      if (encounteredError) {
        lastFetchedUserIdRef.current = null
      } else {
        lastFetchedUserIdRef.current = currentUserId
      }
      setDataPhase("ready")
    })

    return () => {
      isCurrent = false
    }
  }, [user, authLoading, initializing, setBudgets, hasCachedData])

  const updateCategories = async (nextCategories) => {
    const validatedCategories = sanitizeCategories(nextCategories)
    const safeCategories = validatedCategories || cloneDefaultCategories()

    if (!validatedCategories) {
      console.warn("Attempted to set invalid categories payload, falling back to defaults.")
    }

    setCategories(safeCategories)
    if (!user) return
    try {
      const { error } = await updateUserCategories(user.id, safeCategories)
      if (!error) {
        markDataAsStale()
      }
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

  const handleOpenAIInsights = useCallback(
    (budgetId) => {
      if (budgetId) {
        const targetBudget = budgets.find((budget) => budget.id === budgetId)
        if (targetBudget) {
          setSelectedBudget(targetBudget)
        }
      } else if (!selectedBudget && budgets.length > 0) {
        setSelectedBudget(budgets[0])
      }
      setViewMode("ai")
    },
    [budgets, selectedBudget, setSelectedBudget, setViewMode],
  )

  useEffect(() => {
    if ((viewMode === "details" || viewMode === "ai") && !activeBudget) {
      if (budgets.length > 0) {
        setSelectedBudget(budgets[0])
      } else if (viewMode !== "budgets") {
        setViewMode("budgets")
      }
    }
  }, [viewMode, activeBudget, budgets, setSelectedBudget])

  useEffect(() => {
    if (!selectedBudget?.id) return
    const stillExists = budgets.some((budget) => budget.id === selectedBudget.id)
    if (!stillExists) {
      if (budgets.length > 0) {
        setSelectedBudget(budgets[0])
      } else {
        setSelectedBudget(null)
        setViewMode("budgets")
      }
    }
  }, [budgets, selectedBudget, setSelectedBudget, setViewMode])

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

  const isBudgetDataPending = user && dataPhase !== "ready" && budgets.length === 0
  const shouldBlockForData =
    user && !hasCachedData && (dataPhase === "idle" || dataPhase === "loading")

  if (shouldBlockForData) {
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
          onDataMutated={markDataAsStale}
          isLoadingBudgets={isBudgetDataPending}
        />
      )}

      {viewMode === "goals" && (
        <GoalsScreen
          setViewMode={setViewMode}
          budgets={budgets}
          setBudgets={setBudgets}
          onDataMutated={markDataAsStale}
        />
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
          onDataMutated={markDataAsStale}
        />
      )}

      {viewMode === "details" && !activeBudget && budgets.length === 0 && (
        <div className="empty-state">
          <p>Create a budget to see its details.</p>
          <button className="primary-button" onClick={() => setViewMode("budgets")}>Go to Home</button>
        </div>
      )}

      {viewMode === "categories" && (
        <CategoriesScreen
          categories={categories}
          setCategories={updateCategories}
          budgets={budgets}
          setViewMode={setViewMode}
        />
      )}

      {viewMode === "reports" && (
        <ReportsScreen budgets={budgets} categories={categories} onViewInsights={handleOpenAIInsights} />
      )}

      {viewMode === "ai" && activeBudget && <AIInsightsScreen budget={activeBudget} setViewMode={setViewMode} />}

      {viewMode === "ai" && !activeBudget && (
        <div className="empty-state">
          <p>Select a budget to generate a report.</p>
          <button className="primary-button" onClick={() => setViewMode("budgets")}>Browse budgets</button>
        </div>
      )}

      {viewMode === "settings" && (
        <SettingsScreen
          user={user}
          categories={categories}
          budgets={budgets}
          onManageCategories={() => setViewMode("categories")}
        />
      )}

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
