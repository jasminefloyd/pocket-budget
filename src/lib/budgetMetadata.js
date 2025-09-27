const STORAGE_KEY = "pb:budget-metadata:v1"

const isBrowser = typeof window !== "undefined" && typeof window.localStorage !== "undefined"

const readStore = () => {
  if (!isBrowser) return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch (error) {
    console.warn("Failed to parse budget metadata", error)
    return {}
  }
}

const writeStore = (store) => {
  if (!isBrowser) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch (error) {
    console.warn("Failed to persist budget metadata", error)
  }
}

export const createDefaultBudgetMetadata = () => {
  const now = new Date().toISOString()
  return {
    cycle: {
      type: "monthly",
      label: "Monthly",
      currentStart: now,
      payFrequencyDays: 30,
      createdAt: now,
      lastEditedAt: null,
    },
    changeLog: [],
    insights: {
      trackedCategories: [],
      reportSchedule: {
        day: "sunday",
        time: "08:00",
      },
      quietHours: {
        start: 21,
        end: 7,
      },
      nudges: {
        enabled: false,
        threshold: 0.8,
        snoozedUntil: null,
        acknowledged: {},
      },
    },
    dismissals: {
      summary: {},
      recommendations: {},
    },
  }
}

export const getBudgetMetadata = (budgetId) => {
  if (!budgetId) return createDefaultBudgetMetadata()
  const store = readStore()
  if (!store[budgetId]) {
    store[budgetId] = createDefaultBudgetMetadata()
    writeStore(store)
  }
  return { ...createDefaultBudgetMetadata(), ...store[budgetId] }
}

export const setBudgetMetadata = (budgetId, metadata) => {
  if (!budgetId) return metadata
  const store = readStore()
  store[budgetId] = { ...createDefaultBudgetMetadata(), ...metadata }
  writeStore(store)
  return store[budgetId]
}

export const updateBudgetMetadata = (budgetId, updater) => {
  const current = getBudgetMetadata(budgetId)
  const next = typeof updater === "function" ? updater(current) : { ...current, ...updater }
  return setBudgetMetadata(budgetId, next)
}

export const removeBudgetMetadata = (budgetId) => {
  if (!budgetId) return
  const store = readStore()
  if (store[budgetId]) {
    delete store[budgetId]
    writeStore(store)
  }
}
