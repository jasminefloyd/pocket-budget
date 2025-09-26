const MS_IN_DAY = 1000 * 60 * 60 * 24
const EPSILON = 0.01

const GUARDRAIL_LABELS = {
  green: "On Track",
  yellow: "Monitor",
  red: "Over Budget",
}

const normalizeGuardKey = (key) => (GUARDRAIL_LABELS[key] ? key : "green")

const coerceNumber = (value) => {
  if (value === undefined || value === null) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const parseDate = (value) => {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime())
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate()

const addMonths = (date, count) => {
  const result = new Date(date.getTime())
  const desiredDay = result.getDate()
  result.setDate(1)
  result.setMonth(result.getMonth() + count)
  const maxDay = daysInMonth(result.getFullYear(), result.getMonth())
  result.setDate(Math.min(desiredDay, maxDay))
  return result
}

const addDays = (date, days) => {
  const result = new Date(date.getTime())
  result.setDate(result.getDate() + days)
  return result
}

const resolveCadenceSettings = (budget = {}) => {
  const metadataCandidate =
    budget.cadenceMetadata ||
    budget.cadence_settings ||
    budget.cadenceSettings ||
    budget.metadata?.cadence ||
    budget.cadence

  const cadence = typeof metadataCandidate === "string" ? { type: metadataCandidate } : metadataCandidate || {}

  const type = (cadence.type || cadence.interval || cadence.name || "monthly").toString().toLowerCase()

  const startDate =
    parseDate(cadence.startDate || cadence.start || cadence.anchorDate || budget.cadenceStart || budget.createdAt || budget.created_at) ||
    new Date()

  const customDays =
    coerceNumber(cadence.customDays) ??
    coerceNumber(cadence.days) ??
    coerceNumber(cadence.length) ??
    coerceNumber(cadence.daysPerCycle) ??
    coerceNumber(cadence.intervalDays) ??
    coerceNumber(cadence.periodDays) ??
    coerceNumber(cadence.paycheckFrequencyDays) ??
    coerceNumber(budget.cadenceDays) ??
    null

  return { type, startDate, customDays }
}

const resolveCycleLengthInDays = (type, customDays) => {
  switch (type) {
    case "weekly":
      return 7
    case "biweekly":
    case "bi-weekly":
    case "fortnightly":
      return 14
    case "semi-monthly":
    case "semimonthly":
      return 15
    case "quarterly":
      return 91
    case "yearly":
    case "annually":
      return 365
    case "per-paycheck":
    case "custom":
      return Math.max(1, customDays || 14)
    default:
      return Math.max(1, customDays || 30)
  }
}

const advanceCycle = (date, cadence, direction) => {
  if (cadence.type === "monthly") {
    return addMonths(date, direction)
  }

  const days = resolveCycleLengthInDays(cadence.type, cadence.customDays)
  return addDays(date, days * direction)
}

const getCycleWindow = (budget, referenceDate = new Date()) => {
  const cadence = resolveCadenceSettings(budget)
  const reference = parseDate(referenceDate) || new Date()
  reference.setHours(0, 0, 0, 0)

  let cycleStart = parseDate(cadence.startDate) || new Date(reference.getTime())
  cycleStart.setHours(0, 0, 0, 0)

  const maxIterations = 730 // roughly two years of cycles in either direction
  let iterations = 0

  // Move backwards until the start is <= reference
  while (cycleStart.getTime() > reference.getTime() && iterations < maxIterations) {
    cycleStart = advanceCycle(cycleStart, cadence, -1)
    iterations += 1
  }

  let cycleEnd = advanceCycle(cycleStart, cadence, 1)

  while (reference.getTime() >= cycleEnd.getTime() && iterations < maxIterations) {
    cycleStart = cycleEnd
    cycleEnd = advanceCycle(cycleStart, cadence, 1)
    iterations += 1
  }

  if (iterations >= maxIterations) {
    const today = new Date(reference.getTime())
    const tomorrow = addDays(today, 1)
    return {
      start: today,
      end: tomorrow,
      cycleLengthDays: 1,
      elapsedDays: 1,
      elapsedRatio: 1,
    }
  }

  const cycleLengthMs = Math.max(cycleEnd.getTime() - cycleStart.getTime(), MS_IN_DAY)
  const elapsedMs = Math.min(reference.getTime(), cycleEnd.getTime()) - cycleStart.getTime()
  const cycleLengthDays = cycleLengthMs / MS_IN_DAY
  const elapsedDays = Math.max(0, elapsedMs) / MS_IN_DAY
  const elapsedRatio = Math.min(1, Math.max(0, cycleLengthDays > 0 ? elapsedDays / cycleLengthDays : 1))

  return {
    start: cycleStart,
    end: cycleEnd,
    cycleLengthDays,
    elapsedDays,
    elapsedRatio,
  }
}

const determineStatus = (actual, expected, budgeted) => {
  if (!budgeted || budgeted <= 0) {
    return actual > EPSILON ? "red" : "green"
  }

  if (actual <= expected + EPSILON) {
    return "green"
  }

  if (actual <= budgeted + EPSILON) {
    return "yellow"
  }

  return "red"
}

const getBudgetPacing = (budget = {}, referenceDate = new Date()) => {
  const cycleWindow = getCycleWindow(budget, referenceDate)
  const { elapsedRatio, start, end } = cycleWindow
  const transactions = Array.isArray(budget.transactions) ? budget.transactions : []
  const categoryBudgets = Array.isArray(budget.categoryBudgets) ? budget.categoryBudgets : []

  const startTime = start.getTime()
  const endTime = end.getTime()

  const inCycleTransactions = transactions.filter((tx) => {
    if (tx.type !== "expense") return false
    if (!tx.date) return true
    const txDate = parseDate(tx.date)
    if (!txDate) return true
    const txTime = txDate.getTime()
    return txTime >= startTime && txTime < endTime
  })

  const categoryMap = {}
  let totalActual = 0
  let totalBudgeted = 0

  categoryBudgets.forEach((categoryConfig) => {
    const categoryName = categoryConfig?.category || "Uncategorized"
    const budgetedAmount = Number(categoryConfig?.budgetedAmount) || 0
    const normalizedName = categoryName.toLowerCase().trim()

    const actual = inCycleTransactions
      .filter((tx) => (tx.category || "").toLowerCase().trim() === normalizedName)
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)

    const expected = budgetedAmount * elapsedRatio
    const status = determineStatus(actual, expected, budgetedAmount)

    categoryMap[categoryName] = {
      status,
      actual,
      expected,
      budgeted: budgetedAmount,
      elapsedRatio,
    }

    totalActual += actual
    totalBudgeted += budgetedAmount
  })

  const expectedTotal = totalBudgeted * elapsedRatio
  const overallStatus = determineStatus(totalActual, expectedTotal, totalBudgeted)

  return {
    overall: {
      status: overallStatus,
      actual: totalActual,
      expected: expectedTotal,
      budgeted: totalBudgeted,
      elapsedRatio,
      cycleStart: start,
      cycleEnd: end,
    },
    categories: categoryMap,
  }
}

export { getBudgetPacing, GUARDRAIL_LABELS, normalizeGuardKey }
