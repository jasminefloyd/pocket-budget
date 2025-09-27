const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.round(value || 0))

const safeNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const countSyllables = (word) => {
  const sanitized = word.toLowerCase().replace(/[^a-z]/g, "")
  if (!sanitized) return 0
  const vowels = sanitized.match(/[aeiouy]+/g)
  if (!vowels) return 1
  let count = vowels.length
  if (sanitized.endsWith("e") && !sanitized.endsWith("le")) {
    count -= 1
  }
  return Math.max(1, count)
}

export const calculateGradeLevel = (text) => {
  if (!text) return 0
  const sentences = text.split(/[.!?]+/).filter(Boolean)
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length || !sentences.length) return 0
  const syllables = words.reduce((total, word) => total + countSyllables(word), 0)
  const wordsPerSentence = words.length / sentences.length
  const syllablesPerWord = syllables / words.length
  const grade = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59
  return Math.max(0, Number.isFinite(grade) ? Number(grade.toFixed(2)) : 0)
}

export const buildReadableSummary = (metrics = {}, insightPayload = {}) => {
  const balance = safeNumber(metrics.balance)
  const savingsRate = Math.max(0, Math.round(safeNumber(metrics.savingsRate)))
  const topCategory = Array.isArray(metrics.topExpenseCategory)
    ? metrics.topExpenseCategory[0]
    : metrics.topExpenseCategory?.category || null
  const last7 = safeNumber(metrics.last7Days)
  const prev7 = safeNumber(metrics.previous7Days)
  const balanceSentence =
    balance >= 0
      ? `You kept ${formatCurrency(balance)} after bills.`
      : `Spending was ${formatCurrency(Math.abs(balance))} higher than income.`
  const savingsSentence = `Your savings rate is ${savingsRate}%.`
  let categorySentence = "Spending stayed balanced across categories."
  if (topCategory) {
    categorySentence = `${topCategory} is your biggest spend this week.`
  }
  let trendSentence = ""
  if (last7 && prev7) {
    const diff = last7 - prev7
    if (Math.abs(diff) >= 25) {
      trendSentence = diff > 0 ? `That is ${formatCurrency(diff)} more than last week.` : `That is ${formatCurrency(Math.abs(diff))} less than last week.`
    }
  }
  const summary = [balanceSentence, savingsSentence, categorySentence, trendSentence].filter(Boolean).join(" ")
  if (summary.trim()) {
    return summary.trim()
  }
  return insightPayload.summary || "Your finances are on track this week."
}

export const buildAIRecommendations = (metrics = {}, insightPayload = {}) => {
  const recommendations = []
  const totalIncome = safeNumber(metrics.totalIncome)
  const balance = safeNumber(metrics.balance)
  const topExpenseCategory = Array.isArray(metrics.topExpenseCategory)
    ? metrics.topExpenseCategory
    : metrics.topExpenseCategory
    ? [metrics.topExpenseCategory.category, safeNumber(metrics.topExpenseCategory.amount)]
    : null
  const last7 = safeNumber(metrics.last7Days)
  const prev7 = safeNumber(metrics.previous7Days)

  if (topExpenseCategory) {
    const [category, amount] = topExpenseCategory
    const trimAmount = amount * 0.1
    recommendations.push({
      id: "category-trim",
      title: `Dial back ${category}`,
      summary: `Set a simple limit for ${category} this week. Shift ${formatCurrency(trimAmount)} to savings instead.`,
      impact: `${formatCurrency(trimAmount)} / wk`,
      details:
        "Check the last few receipts in this category and cap one outing or order. Moving a small slice now builds the habit without a shock.",
    })
  }

  if (totalIncome > 0) {
    const targetSavings = totalIncome * 0.2
    const actualSavings = balance > 0 ? balance : 0
    if (targetSavings > actualSavings + 1) {
      const gap = targetSavings - actualSavings
      recommendations.push({
        id: "auto-transfer",
        title: "Schedule payday transfers",
        summary: `Automate ${formatCurrency(gap / 4)} into savings every week to hit a 20% savings rate.`,
        impact: `${formatCurrency(gap)} / mo`,
        details:
          "Set the transfer to run the morning after your paycheck hits. Treat it like a bill so the money moves before you can spend it.",
      })
    }
  }

  const diff = last7 - prev7
  if (Math.abs(diff) >= 50) {
    recommendations.push({
      id: "midweek-check",
      title: "Hold a midweek check-in",
      summary:
        diff > 0
          ? `Add a 5-minute review on Wednesday to cut ${formatCurrency(diff / 2)} of extra spend before the weekend.`
          : `Use Wednesday to plan how to save another ${formatCurrency(Math.abs(diff) / 2)} while momentum is high.`,
      impact: `${formatCurrency(Math.abs(diff) / 2)} / wk`,
      details:
        "Put the reminder on your phone. Look at the top 3 transactions so far, then choose one swap or skip for the rest of the week.",
    })
  }

  if (!recommendations.length && insightPayload?.improvements?.length) {
    recommendations.push(
      ...insightPayload.improvements.slice(0, 3).map((item, index) => ({
        id: `insight-${index}`,
        title: item.area || "Quick win",
        summary: item.action || "Take one small action this week to stay on track.",
        impact: item.impact || "—",
        details: item.context || "Tap learn more to review the AI guidance in detail.",
      })),
    )
  }

  return recommendations.slice(0, 3)
}
