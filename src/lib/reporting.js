const DAY_IN_MS = 24 * 60 * 60 * 1000

const parseDate = (value) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const startOfDay = (date) => {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

const endOfDay = (date) => {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

export const flattenTransactions = (budgets = []) => {
  return budgets.flatMap((budget) =>
    (budget.transactions || []).map((transaction) => ({
      ...transaction,
      amount: Number.isFinite(transaction.amount) ? transaction.amount : Number.parseFloat(transaction.amount) || 0,
      budgetId: budget.id,
      budgetName: budget.name,
    })),
  )
}

export const getPeriodRange = (period = "week", referenceDate = new Date()) => {
  const today = endOfDay(referenceDate)

  if (period === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    const end = endOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0))
    const days = Math.max(1, Math.round((end - start) / DAY_IN_MS) + 1)
    return {
      period,
      start,
      end,
      days,
      label: start.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    }
  }

  if (period === "custom") {
    // Placeholder custom range (last 14 days)
    const start = startOfDay(new Date(today.getTime() - 13 * DAY_IN_MS))
    const end = today
    return {
      period,
      start,
      end,
      days: 14,
      label: "Last 14 days",
    }
  }

  // Default to trailing 7 day window
  const start = startOfDay(new Date(today.getTime() - 6 * DAY_IN_MS))
  return {
    period: "week",
    start,
    end: today,
    days: 7,
    label: "Last 7 days",
  }
}

export const getPreviousRange = (range) => {
  if (!range) return null
  const { period, start, days } = range
  if (period === "month") {
    const startPrev = new Date(start.getFullYear(), start.getMonth() - 1, 1)
    const endPrev = endOfDay(new Date(start.getFullYear(), start.getMonth(), 0))
    const prevDays = Math.max(1, Math.round((endPrev - startPrev) / DAY_IN_MS) + 1)
    return {
      period,
      start: startOfDay(startPrev),
      end: endPrev,
      days: prevDays,
      label: startPrev.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    }
  }

  const prevEnd = endOfDay(new Date(start.getTime() - 1))
  const prevStart = startOfDay(new Date(prevEnd.getTime() - (days - 1) * DAY_IN_MS))
  return {
    period,
    start: prevStart,
    end: prevEnd,
    days,
    label: "Previous period",
  }
}

export const filterTransactionsByRange = (transactions, range) => {
  if (!range) return []
  return transactions.filter((transaction) => {
    const txDate = parseDate(transaction.date)
    if (!txDate) return false
    return txDate >= range.start && txDate <= range.end
  })
}

export const sumByType = (transactions, type) => {
  return transactions
    .filter((tx) => tx.type === type)
    .reduce((sum, tx) => sum + (Number.isFinite(tx.amount) ? tx.amount : 0), 0)
}

export const buildCategoryBreakdown = (transactions) => {
  if (!transactions.length) return []
  const totals = transactions.reduce((acc, tx) => {
    const key = (tx.category || "Uncategorized").trim().toLowerCase()
    const label = tx.category?.trim() || "Uncategorized"
    const amount = Number.isFinite(tx.amount) ? tx.amount : 0
    const entry = acc.get(key) || { key, label, amount: 0 }
    entry.amount += amount
    acc.set(key, entry)
    return acc
  }, new Map())

  const aggregateTotal = Array.from(totals.values()).reduce((sum, entry) => sum + entry.amount, 0)
  if (aggregateTotal <= 0) {
    return Array.from(totals.values()).map((entry) => ({ ...entry, percent: 0 }))
  }
  return Array.from(totals.values())
    .map((entry) => ({ ...entry, percent: (entry.amount / aggregateTotal) * 100 }))
    .sort((a, b) => b.amount - a.amount)
}

const enumerateDays = (range) => {
  const days = []
  const cursor = new Date(range.start)
  while (cursor <= range.end) {
    days.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

export const buildIncomeExpenseSeries = (transactions, range) => {
  const days = enumerateDays(range)
  return days.map((date) => {
    const dayKey = date.toISOString().split("T")[0]
    const totals = transactions.reduce(
      (acc, tx) => {
        const txDate = parseDate(tx.date)
        if (!txDate) return acc
        if (txDate.toISOString().split("T")[0] !== dayKey) return acc
        const amount = Number.isFinite(tx.amount) ? tx.amount : 0
        if (tx.type === "income") {
          acc.income += amount
        } else if (tx.type === "expense") {
          acc.expense += amount
        }
        return acc
      },
      { income: 0, expense: 0 },
    )
    return {
      date,
      label: range.period === "month" ? date.getDate().toString() : date.toLocaleDateString(undefined, { weekday: "short" }),
      ...totals,
    }
  })
}

export const calculateTrendComparisons = (transactions, range, previousRange) => {
  if (!range || !previousRange) return []
  const currentExpenses = buildCategoryBreakdown(
    filterTransactionsByRange(transactions.filter((tx) => tx.type === "expense"), range),
  )
  const previousExpenses = buildCategoryBreakdown(
    filterTransactionsByRange(transactions.filter((tx) => tx.type === "expense"), previousRange),
  )

  const previousLookup = new Map(previousExpenses.map((entry) => [entry.key, entry]))

  return currentExpenses
    .map((entry) => {
      const previous = previousLookup.get(entry.key)
      const previousAmount = previous?.amount ?? 0
      const change = entry.amount - previousAmount
      const percentChange = previousAmount > 0 ? (change / previousAmount) * 100 : entry.amount > 0 ? 100 : 0
      return {
        ...entry,
        previousAmount,
        change,
        percentChange,
      }
    })
    .filter((entry) => Number.isFinite(entry.percentChange))
    .sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange))
}

export const buildCashBurnSummary = (budgets, transactions, range) => {
  const totalBudgeted = budgets.reduce((sum, budget) => {
    return (
      sum +
      (budget.categoryBudgets || []).reduce((inner, category) => inner + (Number(category.budgetedAmount) || 0), 0)
    )
  }, 0)

  const expensesThisPeriod = filterTransactionsByRange(
    transactions.filter((tx) => tx.type === "expense"),
    range,
  )
  const spent = expensesThisPeriod.reduce((sum, tx) => sum + (Number.isFinite(tx.amount) ? tx.amount : 0), 0)
  const avgDailySpend = range.days > 0 ? spent / range.days : 0
  const remaining = Math.max(0, totalBudgeted - spent)
  const projectedDaysLeft = avgDailySpend > 0 ? remaining / avgDailySpend : null
  const progress = totalBudgeted > 0 ? Math.min(1, spent / totalBudgeted) : 0

  return {
    totalBudgeted,
    spent,
    remaining,
    avgDailySpend,
    projectedDaysLeft,
    progress,
  }
}

export const summarizeReport = (budgets, period = "week", referenceDate = new Date()) => {
  const allTransactions = flattenTransactions(budgets)
  const range = getPeriodRange(period, referenceDate)
  const previousRange = getPreviousRange(range)
  const scopedTransactions = filterTransactionsByRange(allTransactions, range)
  const totalIncome = sumByType(scopedTransactions, "income")
  const totalExpenses = sumByType(scopedTransactions, "expense")
  const avgDailySpend = range.days > 0 ? totalExpenses / range.days : 0
  const balance = totalIncome - totalExpenses

  const categoryBreakdown = buildCategoryBreakdown(scopedTransactions.filter((tx) => tx.type === "expense"))
  const incomeExpenseSeries = buildIncomeExpenseSeries(scopedTransactions, range)
  const trends = calculateTrendComparisons(allTransactions, range, previousRange)
  const cashBurn = buildCashBurnSummary(budgets, allTransactions, getPeriodRange("month", referenceDate))

  return {
    range,
    previousRange,
    totalIncome,
    totalExpenses,
    avgDailySpend,
    balance,
    categoryBreakdown,
    incomeExpenseSeries,
    cashBurn,
    trends,
  }
}

export const formatCurrency = (value, currency = "USD") => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number.isFinite(value) ? value : 0)
  } catch (error) {
    return `$${Number(value || 0).toFixed(2)}`
  }
}

export const formatPercent = (value) => {
  if (!Number.isFinite(value)) return "0%"
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`
}

export const abbreviateCurrency = (value, currency = "USD") => {
  if (!Number.isFinite(value)) {
    return formatCurrency(0, currency)
  }
  const absValue = Math.abs(value)
  if (absValue >= 1_000_000_000) {
    return `${value < 0 ? "-" : ""}${formatCurrency(absValue / 1_000_000_000, currency)}B`
  }
  if (absValue >= 1_000_000) {
    return `${value < 0 ? "-" : ""}${formatCurrency(absValue / 1_000_000, currency)}M`
  }
  if (absValue >= 1_000) {
    return `${value < 0 ? "-" : ""}${formatCurrency(absValue / 1_000, currency)}K`
  }
  return formatCurrency(value, currency)
}

