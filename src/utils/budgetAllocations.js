export const DEFAULT_ALLOCATION_NAMES = [
  "Housing",
  "Groceries",
  "Transportation",
  "Utilities",
  "Insurance",
  "Healthcare",
  "Savings",
  "Entertainment",
]

const randomSegment = () => Math.random().toString(36).slice(2, 10)

export const createClientId = (prefix = "id") => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${randomSegment()}`
}

export const normalizeAmount = (value) => {
  if (value === null || value === undefined || value === "") {
    return 0
  }
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Number(parsed) : 0
}

export const ensureCategoryBudgetShape = (budgets = []) =>
  budgets.map((item) => ({
    id: item.id || createClientId("alloc"),
    category: item.category || "",
    budgetedAmount: normalizeAmount(item.budgetedAmount),
    lastUpdated: item.lastUpdated || null,
  }))

export const buildDefaultCategoryBudgets = (expenseCategories = []) => {
  const timestamp = new Date().toISOString()
  const seen = new Set()
  const defaults = []

  DEFAULT_ALLOCATION_NAMES.forEach((name) => {
    const trimmed = name.trim()
    if (!seen.has(trimmed) && trimmed) {
      seen.add(trimmed)
      defaults.push({
        id: createClientId("alloc"),
        category: trimmed,
        budgetedAmount: 0,
        lastUpdated: timestamp,
      })
    }
  })

  expenseCategories
    .filter(Boolean)
    .forEach((item) => {
      const name = typeof item === "string" ? item : item.name
      const trimmed = (name || "").trim()
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed)
        defaults.push({
          id: createClientId("alloc"),
          category: trimmed,
          budgetedAmount: 0,
          lastUpdated: timestamp,
        })
      }
    })

  return defaults
}

export const haveCategoryBudgetsChanged = (nextBudgets = [], prevBudgets = []) => {
  if (nextBudgets.length !== prevBudgets.length) {
    return true
  }

  const prevMap = new Map(prevBudgets.map((item) => [item.id, item]))

  for (const item of nextBudgets) {
    const previous = prevMap.get(item.id)
    if (!previous) {
      return true
    }

    const prevCategory = (previous.category || "").trim()
    const nextCategory = (item.category || "").trim()
    if (prevCategory !== nextCategory) {
      return true
    }

    if (normalizeAmount(previous.budgetedAmount) !== normalizeAmount(item.budgetedAmount)) {
      return true
    }
  }

  return false
}
