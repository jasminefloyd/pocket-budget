const DAY_IN_MS = 24 * 60 * 60 * 1000

const DEFAULT_TYPE_LENGTHS = {
  weekly: 7,
  biweekly: 14,
  semimonthly: 15,
  "semi-monthly": 15,
  quarterly: 91,
  yearly: 365,
  annual: 365,
}

const STATUS_META = {
  green: { label: "On Track" },
  yellow: { label: "Watch" },
  red: { label: "Over" },
}

const normalizeCategoryKey = (name = "") => name.toLowerCase().trim()

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const parseDate = (value) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const addDays = (date, days) => {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

const addMonths = (date, months) => {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

const resolveCycleType = (budget) => {
  const cycle = budget?.cycle || budget?.cycleMetadata || {}
  return (cycle.type || budget?.cycleType || "monthly").toLowerCase()
}

const resolveCycleStart = (budget, now) => {
  const cycle = budget?.cycle || budget?.cycleMetadata || {}
  return (
    parseDate(cycle.currentStart) ||
    parseDate(cycle.startDate) ||
    parseDate(budget?.cycleStartDate) ||
    parseDate(budget?.createdAt) ||
    parseDate(budget?.created_at) ||
    new Date(now)
  )
}

const resolveCycleLengthDays = (cycleType, budget) => {
  const cycle = budget?.cycle || budget?.cycleMetadata || {}
  if (typeof cycle.lengthDays === "number") return cycle.lengthDays
  if (typeof cycle.days === "number") return cycle.days
  if (cycleType === "custom" && typeof cycle.customDays === "number") return cycle.customDays
  if (cycleType === "per-paycheck" && typeof cycle.payFrequencyDays === "number") {
    return cycle.payFrequencyDays
  }
  if (cycleType === "per_paycheck" && typeof cycle.payFrequencyDays === "number") {
    return cycle.payFrequencyDays
  }
  if (typeof cycle.cadenceDays === "number") return cycle.cadenceDays
  if (typeof cycle.intervalDays === "number") return cycle.intervalDays
  if (cycleType === "monthly") return 30
  if (cycleType === "biweekly") return 14
  if (cycleType === "weekly") return 7
  if (cycleType === "per-paycheck") return 14
  if (cycleType === "per_paycheck") return 14
  if (cycleType === "custom") return 30
  return DEFAULT_TYPE_LENGTHS[cycleType] || 30
}

const addCycle = (startDate, cycleType, budget) => {
  const cycle = budget?.cycle || budget?.cycleMetadata || {}
  switch (cycleType) {
    case "monthly":
      return addMonths(startDate, cycle.repeatEvery || 1)
    case "quarterly":
      return addMonths(startDate, 3)
    case "yearly":
    case "annual":
      return addMonths(startDate, 12)
    case "semimonthly":
    case "semi-monthly": {
      const days = cycle.days || cycle.lengthDays || 15
      return addDays(startDate, days)
    }
    default: {
      const days = resolveCycleLengthDays(cycleType, budget)
      return addDays(startDate, days)
    }
  }
}

const resolveCycleBounds = (budget, now) => {
  const cycleType = resolveCycleType(budget)
  let currentStart = resolveCycleStart(budget, now)
  let nextStart = addCycle(currentStart, cycleType, budget)

  // Prevent infinite loops if cycle configuration is invalid
  let guard = 0
  while (nextStart && now >= nextStart && guard < 500) {
    currentStart = nextStart
    nextStart = addCycle(currentStart, cycleType, budget)
    guard += 1
  }

  const totalMs = nextStart ? nextStart.getTime() - currentStart.getTime() : resolveCycleLengthDays(cycleType, budget) * DAY_IN_MS
  const elapsedMs = now.getTime() - currentStart.getTime()

  const progress = totalMs > 0 ? clamp(elapsedMs / totalMs, 0, 1) : 1

  return {
    cycleType,
    currentStart,
    nextStart,
    totalMs,
    elapsedMs,
    progress,
  }
}

const formatCurrency = (value) => {
  return `$${Number.parseFloat(value || 0).toFixed(2)}`
}

const buildTooltip = (actual, budgeted, expected, progress) => {
  const progressPct = Math.round(progress * 100)
  return `Spent ${formatCurrency(actual)} of ${formatCurrency(budgeted)} with ${progressPct}% of the cycle elapsed (expected ${formatCurrency(
    expected,
  )}).`
}

const evaluateStatus = (actual, budgeted, progress) => {
  const safeBudgeted = Number.isFinite(budgeted) ? budgeted : 0
  const safeActual = Number.isFinite(actual) ? actual : 0
  const expected = safeBudgeted * progress

  if (safeBudgeted <= 0) {
    if (safeActual <= 0) {
      const status = "green"
      return {
        status,
        ...STATUS_META[status],
        tooltip: `No budget set for this period.`,
        actual: safeActual,
        budgeted: safeBudgeted,
        expected,
      }
    }
    const status = "red"
    return {
      status,
      ...STATUS_META[status],
      tooltip: `Spending ${formatCurrency(safeActual)} without a set budget for this cycle.`,
      actual: safeActual,
      budgeted: safeBudgeted,
      expected,
    }
  }

  const ratio = safeActual / safeBudgeted
  const cushion = 0.1 // 10% buffer before turning red
  let status = "green"

  if (ratio > progress + cushion) {
    status = "red"
  } else if (ratio > progress) {
    status = "yellow"
  }

  return {
    status,
    ...STATUS_META[status],
    tooltip: buildTooltip(safeActual, safeBudgeted, expected, progress),
    actual: safeActual,
    budgeted: safeBudgeted,
    expected,
  }
}

export const calculateBudgetPacing = (budget, now = new Date()) => {
  const safeBudget = budget || {}
  const expenses = (safeBudget.transactions || []).filter((tx) => tx.type === "expense")
  const bounds = resolveCycleBounds(safeBudget, now)
  const progress = bounds.progress ?? 1

  const categoryBudgets = safeBudget.categoryBudgets || []
  const categories = categoryBudgets.map((categoryBudget) => {
    const key = normalizeCategoryKey(categoryBudget.category)
    const actual = expenses
      .filter((tx) => normalizeCategoryKey(tx.category) === key)
      .reduce((sum, tx) => sum + (Number.isFinite(tx.amount) ? tx.amount : 0), 0)

    const budgetedAmount = Number.isFinite(categoryBudget.budgetedAmount)
      ? categoryBudget.budgetedAmount
      : Number.isFinite(categoryBudget.amount)
        ? categoryBudget.amount
        : 0

    const pacing = evaluateStatus(actual, budgetedAmount, progress)

    return {
      name: categoryBudget.category,
      key,
      actual,
      budgeted: budgetedAmount,
      ...pacing,
    }
  })

  const categoriesByName = categories.reduce((acc, category) => {
    if (category.key) {
      acc[category.key] = category
    }
    return acc
  }, {})

  const totalBudgeted = categories.reduce((sum, cat) => sum + cat.budgeted, 0)
  const totalActual = expenses.reduce((sum, tx) => sum + (Number.isFinite(tx.amount) ? tx.amount : 0), 0)
  const overall = evaluateStatus(totalActual, totalBudgeted, progress)

  return {
    cycle: {
      type: bounds.cycleType,
      start: bounds.currentStart,
      end: bounds.nextStart,
      progress,
    },
    categories,
    categoriesByName,
    overall,
  }
}

export default calculateBudgetPacing
