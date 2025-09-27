"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import PropTypes from "prop-types"
import { createTransaction, updateTransaction, updateBudget, getCashBurn } from "../lib/supabase"
import { calculateBudgetPacing } from "../lib/pacing"
import { useAuth } from "../contexts/AuthContext"

const PAID_PLAN_TIERS = ["trial", "paid", "pro", "premium", "plus"]
const CYCLE_OPTIONS = [
  { type: "monthly", label: "Monthly", requiresPaid: false },
  { type: "per-paycheck", label: "Per-paycheck", requiresPaid: true },
  { type: "custom", label: "Custom", requiresPaid: true },
]

const getCycleLabel = (type) => {
  const option = CYCLE_OPTIONS.find((candidate) => candidate.type === type)
  if (option) return option.label
  if (!type) return "Monthly"
  return type
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
}

const sparklineBlocks = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]

const toSparkline = (values) => {
  if (!values?.length) return "▁▁▁▁▁▁"
  const max = Math.max(...values)
  if (max <= 0) return "▁".repeat(values.length)
  return values
    .map((value) => {
      const normalized = Math.max(0, value) / max
      const index = Math.min(sparklineBlocks.length - 1, Math.round(normalized * (sparklineBlocks.length - 1)))
      return sparklineBlocks[index]
    })
    .join("")
}

const DAY_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const formatCurrency = (value) => `$${Number.parseFloat(value || 0).toFixed(2)}`

const getTodayISODate = () => new Date().toISOString().split("T")[0]

const ensureISODate = (value, fallback) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const attempt = value ? new Date(value) : null
  if (attempt && !Number.isNaN(attempt.getTime())) {
    return attempt.toISOString().split("T")[0]
  }

  if (fallback !== undefined) {
    if (typeof fallback === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fallback)) {
      return fallback
    }
    const fallbackAttempt = fallback ? new Date(fallback) : null
    if (fallbackAttempt && !Number.isNaN(fallbackAttempt.getTime())) {
      return fallbackAttempt.toISOString().split("T")[0]
    }
  }

  return getTodayISODate()
}

const formatTransactionDate = (isoDate) => {
  if (!isoDate) return ""
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return parsed.toLocaleDateString()
}

export default function BudgetDetailsScreen({
  budget,
  categories,
  setViewMode,
  setBudgets,
  budgets,
  setSelectedBudget,
  onMetadataChange,
}) {
  const { user, userProfile } = useAuth()
  const planTier = userProfile?.plan_tier || userProfile?.planTier || "free"
  const hasAdvancedStructures = PAID_PLAN_TIERS.includes(String(planTier).toLowerCase())
  const isFreePlan = !hasAdvancedStructures
  const metadata = useMemo(() => budget.metadata || {}, [budget.metadata])
  const insightsPreferences = useMemo(
    () => budget.insightsPreferences || metadata.insights || {},
    [budget.insightsPreferences, metadata.insights],
  )
  const changeLog = useMemo(() => budget.changeLog || metadata.changeLog || [], [budget.changeLog, metadata.changeLog])

  const [tab, setTab] = useState("expenses")
  const [showModal, setShowModal] = useState(false)
  const [editingTx, setEditingTx] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [formTx, setFormTx] = useState({
    name: "",
    amount: "",
    budgetedAmount: "",
    category: "",
    date: getTodayISODate(),
    type: "expense",
    receipt: null,
  })

  const [selectedSlice, setSelectedSlice] = useState(null)
  const [budgetNameDraft, setBudgetNameDraft] = useState(budget.name || "")
  const [allocationDraft, setAllocationDraft] = useState(() =>
    (budget.categoryBudgets || []).map((entry) => ({ ...entry })),
  )
  const [allocationDirty, setAllocationDirty] = useState(false)
  const [snackbar, setSnackbar] = useState(null)
  const [changeLogOpen, setChangeLogOpen] = useState(false)
  const [cycleModalOpen, setCycleModalOpen] = useState(false)
  const [pendingDeletion, setPendingDeletion] = useState(null)
  const [expandedLeak, setExpandedLeak] = useState(null)
  const [nudgeToast, setNudgeToast] = useState(null)
  const [trackedCategories, setTrackedCategories] = useState(() =>
    new Set(insightsPreferences.trackedCategories || []),
  )
  const [reportSchedule, setReportSchedule] = useState(() => ({
    day: insightsPreferences.reportSchedule?.day || "sunday",
    time: insightsPreferences.reportSchedule?.time || "08:00",
  }))
  const [nudgeConfig, setNudgeConfig] = useState(() => ({
    enabled: Boolean(insightsPreferences.nudges?.enabled),
    threshold: insightsPreferences.nudges?.threshold || 0.8,
    quietStart: insightsPreferences.quietHours?.start ?? 21,
    quietEnd: insightsPreferences.quietHours?.end ?? 7,
  }))
  const [cycleDraft, setCycleDraft] = useState(() => ({
    type: budget.cycleMetadata?.type || "monthly",
    startDate: budget.cycleMetadata?.currentStart
      ? new Date(budget.cycleMetadata.currentStart).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
    payFrequencyDays: budget.cycleMetadata?.payFrequencyDays || 14,
    customDays:
      budget.cycleMetadata?.customDays ||
      budget.cycleMetadata?.lengthDays ||
      budget.cycleMetadata?.cycleLength ||
      30,
  }))
  const [insightsDirty, setInsightsDirty] = useState(false)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newCategoryAmount, setNewCategoryAmount] = useState("")
  const [remoteBurnSummary, setRemoteBurnSummary] = useState(null)
  const [burnSyncError, setBurnSyncError] = useState(null)
  const [burnSyncLoading, setBurnSyncLoading] = useState(false)

  const transactions = useMemo(
    () => (budget.transactions || []).map((tx) => ({ ...tx, date: ensureISODate(tx.date) })),
    [budget.transactions],
  )

  const normalizedBudget = useMemo(
    () => ({ ...budget, transactions }),
    [budget, transactions],
  )

  useEffect(() => {
    setAllocationDraft((budget.categoryBudgets || []).map((entry) => ({ ...entry })))
    setAllocationDirty(false)
  }, [budget.id, budget.categoryBudgets])

  useEffect(() => {
    setBudgetNameDraft(budget.name || "")
  }, [budget.id, budget.name])

  useEffect(() => {
    setTrackedCategories(new Set(insightsPreferences.trackedCategories || []))
    setReportSchedule({
      day: insightsPreferences.reportSchedule?.day || "sunday",
      time: insightsPreferences.reportSchedule?.time || "08:00",
    })
    setNudgeConfig({
      enabled: Boolean(insightsPreferences.nudges?.enabled),
      threshold: insightsPreferences.nudges?.threshold || 0.8,
      quietStart: insightsPreferences.quietHours?.start ?? 21,
      quietEnd: insightsPreferences.quietHours?.end ?? 7,
    })
    setCycleDraft({
      type: budget.cycleMetadata?.type || "monthly",
      startDate: budget.cycleMetadata?.currentStart
        ? new Date(budget.cycleMetadata.currentStart).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      payFrequencyDays: budget.cycleMetadata?.payFrequencyDays || 14,
      customDays:
        budget.cycleMetadata?.customDays ||
        budget.cycleMetadata?.lengthDays ||
        budget.cycleMetadata?.cycleLength ||
        30,
    })
    setInsightsDirty(false)
  }, [budget.id, budget.cycleMetadata, insightsPreferences])

  const ITEMS_PER_PAGE = 7

  const persistMetadata = useCallback(
    (updater) => {
      if (!onMetadataChange) return
      onMetadataChange(budget.id, updater)
    },
    [onMetadataChange, budget.id],
  )

  const handleAllocationChange = (categoryName, value) => {
    const parsed = Number.parseFloat(value)
    setAllocationDraft((prev) =>
      prev.map((entry) =>
        entry.category === categoryName
          ? { ...entry, budgetedAmount: Number.isFinite(parsed) ? parsed : 0 }
          : entry,
      ),
    )
    setAllocationDirty(true)
  }

  const handleAddCategory = () => {
    const trimmed = newCategoryName.trim()
    if (!trimmed) return
    setAllocationDraft((prev) => {
      if (prev.some((entry) => entry.category.toLowerCase() === trimmed.toLowerCase())) {
        return prev
      }
      const parsed = Number.parseFloat(newCategoryAmount)
      const nextEntry = {
        category: trimmed,
        budgetedAmount: Number.isFinite(parsed) ? parsed : 0,
      }
      setAllocationDirty(true)
      return [...prev, nextEntry]
    })
    setNewCategoryName("")
    setNewCategoryAmount("")
    setShowAddCategory(false)
  }

  const cancelAddCategory = () => {
    setShowAddCategory(false)
    setNewCategoryName("")
    setNewCategoryAmount("")
  }

  const openDeleteCategoryModal = (category) => {
    const actual = transactions
      .filter((tx) => tx.type === "expense" && tx.category === category.category)
      .reduce((sum, tx) => sum + tx.amount, 0)
    const remaining = Math.max(0, Number(category.budgetedAmount || 0) - actual)
    setPendingDeletion({ ...category, remaining, actual, reallocateTo: "" })
  }

  const confirmDeleteAllocation = () => {
    if (!pendingDeletion) return
    const { category, remaining, reallocateTo } = pendingDeletion
    if (remaining > 0 && !reallocateTo) {
      alert("Please choose a category to reallocate the remaining budget.")
      return
    }
    setAllocationDraft((prev) => {
      const filtered = prev.filter((entry) => entry.category !== category)
      if (remaining > 0 && reallocateTo) {
        return filtered.map((entry) =>
          entry.category === reallocateTo
            ? { ...entry, budgetedAmount: Number(entry.budgetedAmount || 0) + remaining }
            : entry,
        )
      }
      return filtered
    })
    setAllocationDirty(true)
    setPendingDeletion(null)
  }

  const cancelDeleteAllocation = () => {
    setPendingDeletion(null)
  }

  const applyBudgetUpdates = (updatedBudget) => {
    setBudgets((prev) => prev.map((b) => (b.id === budget.id ? updatedBudget : b)))
    setSelectedBudget(updatedBudget)
  }

  const handleUndoAllocations = async (previousAllocations) => {
    if (!previousAllocations) return
    try {
      setLoading(true)
      const { error } = await updateBudget(budget.id, {
        name: budget.name,
        categoryBudgets: previousAllocations,
      })
      if (error) {
        console.error("Error undoing allocations:", error)
        alert("Failed to undo allocation change. Please try again.")
        return
      }
      const updatedBudget = { ...budget, categoryBudgets: previousAllocations }
      applyBudgetUpdates(updatedBudget)
      setAllocationDraft(previousAllocations.map((entry) => ({ ...entry })))
      setAllocationDirty(false)
      persistMetadata((metadata) => ({
        ...metadata,
        changeLog: [
          {
            at: new Date().toISOString(),
            message: "Reverted allocation change",
            type: "undo",
          },
          ...(metadata.changeLog || []),
        ],
      }))
    } finally {
      setLoading(false)
      setSnackbar(null)
    }
  }

  const saveAllocations = async () => {
    const sanitized = allocationDraft.map((entry) => ({
      category: entry.category,
      budgetedAmount: Number.isFinite(Number(entry.budgetedAmount))
        ? Number(entry.budgetedAmount)
        : 0,
    }))

    setLoading(true)
    try {
      const { error } = await updateBudget(budget.id, {
        name: budget.name,
        categoryBudgets: sanitized,
      })
      if (error) {
        console.error("Error saving allocations:", error)
        alert("Failed to save category allocations.")
        return
      }
      const previous = budget.categoryBudgets || []
      const updatedBudget = { ...budget, categoryBudgets: sanitized }
      applyBudgetUpdates(updatedBudget)
      setAllocationDirty(false)
      const now = new Date().toISOString()
      persistMetadata((metadata) => ({
        ...metadata,
        changeLog: [
          {
            at: now,
            message: "Updated category allocations",
            type: "allocation",
          },
          ...(metadata.changeLog || []),
        ],
      }))
      setSnackbar({
        message: "Allocations updated",
        actionLabel: "Undo",
        action: () => handleUndoAllocations(previous),
      })
    } finally {
      setLoading(false)
    }
  }

  const closeSnackbar = () => setSnackbar(null)

  const handleCycleSave = () => {
    const now = new Date().toISOString()
    persistMetadata((metadata) => ({
      ...metadata,
      cycle: {
        ...metadata.cycle,
        type: cycleDraft.type,
        label: getCycleLabel(cycleDraft.type),
        currentStart: cycleDraft.startDate
          ? new Date(cycleDraft.startDate).toISOString()
          : metadata.cycle?.currentStart,
        payFrequencyDays:
          cycleDraft.type === "per-paycheck" ? Number(cycleDraft.payFrequencyDays) || 14 : undefined,
        customDays: cycleDraft.type === "custom" ? Number(cycleDraft.customDays) || 30 : undefined,
        lastEditedAt: now,
      },
      changeLog: [
        {
          at: now,
          message: `Updated cycle to ${getCycleLabel(cycleDraft.type)}`,
          type: "cycle",
        },
        ...(metadata.changeLog || []),
      ],
    }))
    setCycleModalOpen(false)
  }

  const handleTrackedCategoryToggle = (categoryName) => {
    setTrackedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryName)) {
        next.delete(categoryName)
      } else {
        next.add(categoryName)
      }
      setInsightsDirty(true)
      return next
    })
  }

  const handleReportScheduleChange = (field, value) => {
    setReportSchedule((prev) => ({ ...prev, [field]: value }))
    setInsightsDirty(true)
  }

  const handleNudgeConfigChange = (partial) => {
    setNudgeConfig((prev) => ({ ...prev, ...partial }))
    setInsightsDirty(true)
  }

  useEffect(() => {
    if (!insightsDirty) return
    const trackedList = Array.from(trackedCategories)
    persistMetadata((metadata) => ({
      ...metadata,
      insights: {
        ...(metadata.insights || {}),
        trackedCategories: trackedList,
        reportSchedule: { ...metadata.insights?.reportSchedule, ...reportSchedule },
        quietHours: {
          ...(metadata.insights?.quietHours || {}),
          start: Number(nudgeConfig.quietStart) ?? 21,
          end: Number(nudgeConfig.quietEnd) ?? 7,
        },
        nudges: {
          ...(metadata.insights?.nudges || {}),
          enabled: Boolean(nudgeConfig.enabled),
          threshold: Number(nudgeConfig.threshold) || 0.8,
        },
      },
    }))
    setInsightsDirty(false)
  }, [insightsDirty, trackedCategories, reportSchedule, nudgeConfig, persistMetadata])

  const categoriesToAnalyse = useMemo(() => {
    if (trackedCategories.size) {
      return Array.from(trackedCategories)
    }
    const totals = {}
    transactions
      .filter((tx) => tx.type === "expense")
      .forEach((tx) => {
        totals[tx.category] = (totals[tx.category] || 0) + tx.amount
      })
    const sorted = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([category]) => category)
    const baseline = (budget.categoryBudgets || []).map((entry) => entry.category)
    return Array.from(new Set([...sorted, ...baseline])).slice(0, 6)
  }, [trackedCategories, transactions, budget.categoryBudgets])

  const availableCategories = useMemo(() => {
    const registry = new Set((budget.categoryBudgets || []).map((entry) => entry.category))
    ;(categories.expense || []).forEach((cat) => registry.add(cat.name))
    return Array.from(registry).sort((a, b) => a.localeCompare(b))
  }, [budget.categoryBudgets, categories.expense])

  const parseTimeParts = useCallback((timeString) => {
    const [hours = "08", minutes = "00"] = (timeString || "08:00").split(":")
    const parsedHours = Number.parseInt(hours, 10)
    const parsedMinutes = Number.parseInt(minutes, 10)
    return {
      hours: Number.isFinite(parsedHours) ? parsedHours : 8,
      minutes: Number.isFinite(parsedMinutes) ? parsedMinutes : 0,
    }
  }, [])

  const resolveScheduleStart = useCallback(
    (referenceDate) => {
      const anchor = new Date(referenceDate)
      const scheduleKey = String(reportSchedule.day || "sunday").toLowerCase()
      const targetDay = DAY_INDEX[scheduleKey] ?? 0
      const diff = (anchor.getDay() - targetDay + 7) % 7
      anchor.setDate(anchor.getDate() - diff)
      const { hours, minutes } = parseTimeParts(reportSchedule.time)
      anchor.setHours(hours, minutes, 0, 0)
      return anchor
    },
    [reportSchedule.day, reportSchedule.time, parseTimeParts],
  )

  const weeklyReport = useMemo(() => {
    const now = new Date()
    const currentStart = resolveScheduleStart(now)
    const currentEnd = new Date(currentStart)
    currentEnd.setDate(currentEnd.getDate() + 7)
    const previousStart = new Date(currentStart)
    previousStart.setDate(previousStart.getDate() - 7)
    const previousEnd = new Date(currentStart)

    const sumForRange = (category, start, end) =>
      transactions
        .filter((tx) => tx.type === "expense" && tx.category === category)
        .filter((tx) => {
          const txDate = new Date(tx.date)
          return txDate >= start && txDate < end
        })
        .reduce((sum, tx) => sum + tx.amount, 0)

    const cards = categoriesToAnalyse
      .map((category) => {
        const current = sumForRange(category, currentStart, currentEnd)
        const previous = sumForRange(category, previousStart, previousEnd)
        const delta = current - previous
        const pctChange = previous > 0 ? (delta / previous) * 100 : current > 0 ? 100 : 0
        const categoryKey = category.toLowerCase().trim()
        const pacingMeta = pacing.categoriesByName?.[categoryKey]
        const trend = []
        for (let index = 5; index >= 0; index -= 1) {
          const periodEnd = new Date(currentEnd)
          periodEnd.setDate(periodEnd.getDate() - 7 * index)
          const periodStart = new Date(periodEnd)
          periodStart.setDate(periodStart.getDate() - 7)
          trend.push(sumForRange(category, periodStart, periodEnd))
        }
        return {
          category,
          current,
          previous,
          delta,
          pctChange,
          status: pacingMeta?.status || "green",
          statusLabel: pacingMeta?.label || "On Track",
          trend,
        }
      })
      .sort((a, b) => b.current - a.current)

    return {
      cards,
      topCards: cards.slice(0, 3),
      trends: cards.reduce((acc, card) => ({ ...acc, [card.category]: card.trend }), {}),
      currentStart,
      currentEnd,
    }
  }, [transactions, categoriesToAnalyse, pacing, resolveScheduleStart])

  const quietHoursStart = Number(nudgeConfig.quietStart) ?? 21
  const quietHoursEnd = Number(nudgeConfig.quietEnd) ?? 7

  const isWithinQuietHours = useCallback(
    (date) => {
      const hour = date.getHours()
      if (quietHoursStart === quietHoursEnd) return false
      if (quietHoursStart < quietHoursEnd) {
        return hour >= quietHoursStart && hour < quietHoursEnd
      }
      return hour >= quietHoursStart || hour < quietHoursEnd
    },
    [quietHoursStart, quietHoursEnd],
  )

  useEffect(() => {
    if (!hasAdvancedStructures || !nudgeConfig.enabled) return
    if (isWithinQuietHours(new Date())) return
    const snoozedUntil = metadata.insights?.nudges?.snoozedUntil
    if (snoozedUntil && new Date(snoozedUntil) > new Date()) return
    const threshold = Number(nudgeConfig.threshold) || 0.8
    const cycleAnchor = budget.cycleMetadata?.currentStart
      ? new Date(budget.cycleMetadata.currentStart).toISOString()
      : budget.id
    const acknowledged = metadata.insights?.nudges?.acknowledged || {}
    const candidate = (pacing.categories || []).find((cat) => {
      if (!cat || !Number.isFinite(cat.budgeted) || cat.budgeted <= 0) return false
      const ratio = cat.actual / cat.budgeted
      const key = `${cycleAnchor}:${cat.name}`.toLowerCase()
      if (ratio >= threshold && !acknowledged[key]) {
        return true
      }
      return false
    })
    if (candidate && !nudgeToast) {
      setNudgeToast({
        category: candidate.name,
        ratio: candidate.actual / (candidate.budgeted || 1),
        actual: candidate.actual,
        budgeted: candidate.budgeted,
      })
    }
    }, [
      hasAdvancedStructures,
      nudgeConfig,
      metadata.insights,
      budget.cycleMetadata,
      budget.id,
      pacing.categories,
      nudgeToast,
      isWithinQuietHours,
    ])

  const acknowledgeNudge = (categoryName) => {
    const cycleAnchor = budget.cycleMetadata?.currentStart
      ? new Date(budget.cycleMetadata.currentStart).toISOString()
      : budget.id
    const key = `${cycleAnchor}:${categoryName}`.toLowerCase()
    persistMetadata((metadata) => ({
      ...metadata,
      insights: {
        ...(metadata.insights || {}),
        nudges: {
          ...(metadata.insights?.nudges || {}),
          acknowledged: {
            ...(metadata.insights?.nudges?.acknowledged || {}),
            [key]: new Date().toISOString(),
          },
        },
      },
    }))
    setNudgeToast(null)
  }

  const snoozeNudges = (hours = 6) => {
    const snoozeUntil = new Date()
    snoozeUntil.setHours(snoozeUntil.getHours() + hours)
    persistMetadata((metadata) => ({
      ...metadata,
      insights: {
        ...(metadata.insights || {}),
        nudges: {
          ...(metadata.insights?.nudges || {}),
          snoozedUntil: snoozeUntil.toISOString(),
        },
      },
    }))
    setNudgeToast(null)
  }

  const resolveTypeKey = (typeOrTab) => {
    if (typeOrTab === "income" || typeOrTab === "expense") return typeOrTab
    if (typeOrTab === "expenses") return "expense"
    return "income"
  }

  const openAddModal = (typeArg) => {
    const resolvedType = resolveTypeKey(typeArg || tab)
    setFormTx({
      name: "",
      amount: "",
      budgetedAmount: "",
      category: "",
      date: getTodayISODate(),
      type: resolvedType,
      receipt: null,
    })
    setEditingTx(null)
    setShowModal(true)
  }

  const openEditModal = (tx) => {
    setFormTx({
      ...tx,
      date: ensureISODate(tx.date),
      budgetedAmount: tx.budgetedAmount || "",
    })
    setEditingTx(tx)
    setShowModal(true)
  }

  const saveTransaction = async () => {
    const trimmedName = formTx.name.trim()
    const trimmedCategory = formTx.category.trim()
    const trimmedAmount = String(formTx.amount ?? "").trim()
    const parsedAmount = Number.parseFloat(trimmedAmount)
    const amountIsValid = trimmedAmount !== "" && Number.isFinite(parsedAmount)

    const trimmedBudgeted =
      formTx.budgetedAmount === null || formTx.budgetedAmount === undefined
        ? ""
        : String(formTx.budgetedAmount).trim()
    const parsedBudgeted =
      trimmedBudgeted === "" ? null : Number.parseFloat(trimmedBudgeted)
    const budgetedIsValid =
      parsedBudgeted === null || Number.isFinite(parsedBudgeted)

    if (!trimmedName || !amountIsValid || !trimmedCategory || !budgetedIsValid) {
      alert("Please fill in all required fields with valid numbers where applicable.")
      return
    }

    setLoading(true)
    try {
      const cleanedTx = {
        name: trimmedName,
        amount: parsedAmount,
        budgetedAmount: parsedBudgeted,
        category: trimmedCategory,
        type: resolveTypeKey(formTx.type),
        date: ensureISODate(formTx.date),
        receipt: formTx.receipt,
      }

      let updatedTransactions
      if (editingTx) {
        const { error } = await updateTransaction(editingTx.id, cleanedTx)
        if (error) {
          console.error("Error updating transaction:", error)
          alert("Failed to update transaction. Please try again.")
          return
        }
        updatedTransactions = transactions.map((t) =>
          t.id === editingTx.id ? { ...cleanedTx, id: editingTx.id } : t,
        )
      } else {
        const { data, error } = await createTransaction(budget.id, cleanedTx)
        if (error) {
          console.error("Error creating transaction:", error)
          alert("Failed to create transaction. Please try again.")
          return
        }
        const newTransaction = {
          ...cleanedTx,
          id: data[0].id,
        }
        updatedTransactions = [...transactions, newTransaction]
      }

      const updatedBudget = { ...budget, transactions: updatedTransactions }
      const updatedBudgets = budgets.map((b) => (b.id === budget.id ? updatedBudget : b))

      setBudgets(updatedBudgets)
      setSelectedBudget(updatedBudgets.find((b) => b.id === budget.id))
      setShowModal(false)
      setEditingTx(null)
    } catch (error) {
      console.error("Error saving transaction:", error)
      alert("Failed to save transaction. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleBudgetNameSubmit = async () => {
    const trimmed = budgetNameDraft.trim()

    if (!trimmed) {
      setBudgetNameDraft(budget.name || "")
      return
    }

    if (trimmed === (budget.name || "").trim()) {
      setBudgetNameDraft(budget.name || "")
      return
    }

    try {
      const { error } = await updateBudget(budget.id, {
        name: trimmed,
        categoryBudgets: budget.categoryBudgets,
      })

      if (error) {
        console.error("Error updating budget name:", error)
        setBudgetNameDraft(budget.name || "")
        return
      }

      let updatedBudgetState = { ...budget, name: trimmed }
      setBudgets((prev) =>
        prev.map((b) => {
          if (b.id !== budget.id) return b
          updatedBudgetState = { ...b, ...budget, name: trimmed }
          return updatedBudgetState
        }),
      )

      setSelectedBudget((prevSelected) => {
        if (prevSelected?.id === budget.id) {
          return updatedBudgetState
        }
        return prevSelected
      })

      setBudgetNameDraft(trimmed)
    } catch (error) {
      console.error("Error updating budget name:", error)
      setBudgetNameDraft(budget.name || "")
    }
  }

  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0)

  const totalExpenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0)

  const totalBudgeted = transactions
    .filter((t) => t.type === "expense" && t.budgetedAmount)
    .reduce((sum, t) => sum + t.budgetedAmount, 0)

  const balance = totalIncome - totalExpenses

  const expenseTransactions = useMemo(
    () => transactions.filter((tx) => tx.type === "expense"),
    [transactions],
  )

  const localBurnSummary = useMemo(() => {
    if (expenseTransactions.length === 0) {
      return {
        burnPerDay: 0,
        burnPerWeek: 0,
        burnPerMonth: 0,
        daysLeft: null,
        projectionDate: null,
        status: "safe",
        badgeLabel: "Safe Zone",
      }
    }

    const DAY_MS = 1000 * 60 * 60 * 24
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)

    const sampledTransactions = expenseTransactions.filter((tx) => {
      const txDate = new Date(tx.date)
      return !Number.isNaN(txDate.getTime()) && txDate >= cutoff
    })

    const windowed = sampledTransactions.length ? sampledTransactions : expenseTransactions

    let earliest = Number.POSITIVE_INFINITY
    let latest = 0
    let total = 0

    windowed.forEach((tx) => {
      const timestamp = new Date(tx.date).getTime()
      if (!Number.isFinite(timestamp)) return
      earliest = Math.min(earliest, timestamp)
      latest = Math.max(latest, timestamp)
      total += tx.amount
    })

    if (!Number.isFinite(earliest) || !Number.isFinite(latest)) {
      return {
        burnPerDay: 0,
        burnPerWeek: 0,
        burnPerMonth: 0,
        daysLeft: null,
        projectionDate: null,
        status: "safe",
        badgeLabel: "Safe Zone",
      }
    }

    const spanDays = Math.max(1, Math.round((latest - earliest) / DAY_MS) + 1)
    const burnPerDay = total / spanDays
    const burnPerWeek = burnPerDay * 7
    const burnPerMonth = burnPerDay * 30

    const safeBalance = Math.max(0, balance)
    const daysLeft = burnPerDay > 0 ? Math.floor(safeBalance / burnPerDay) : null
    const projectionDate = typeof daysLeft === "number" ? new Date(Date.now() + daysLeft * DAY_MS) : null

    const status = typeof daysLeft === "number" && daysLeft < 15 ? "critical" : "safe"
    const badgeLabel = status === "critical" ? "Critical Burn" : "Safe Zone"

    return {
      burnPerDay,
      burnPerWeek,
      burnPerMonth,
      daysLeft,
      projectionDate,
      status,
      badgeLabel,
    }
  }, [expenseTransactions, balance])

  useEffect(() => {
    if (!user?.id) return
    let isActive = true

    const loadBurnSummary = async () => {
      setBurnSyncLoading(true)
      try {
        const { data, error } = await getCashBurn(user.id)
        if (!isActive) return
        if (error) {
          console.error("Failed to fetch cash burn", error)
          setBurnSyncError(error.message || "Unable to sync burn metrics")
          setRemoteBurnSummary(null)
          return
        }
        setBurnSyncError(null)
        setRemoteBurnSummary(data || null)
      } catch (burnError) {
        if (!isActive) return
        console.error("Unexpected cash burn error", burnError)
        setBurnSyncError(burnError.message || "Unable to sync burn metrics")
        setRemoteBurnSummary(null)
      } finally {
        if (isActive) {
          setBurnSyncLoading(false)
        }
      }
    }

    loadBurnSummary()

    return () => {
      isActive = false
    }
  }, [user?.id, budget.id, transactions.length])

  const burnSummary = useMemo(() => {
    if (!remoteBurnSummary) {
      return localBurnSummary
    }

    const projectionDate =
      remoteBurnSummary.projectionDate instanceof Date || remoteBurnSummary.projectionDate === null
        ? remoteBurnSummary.projectionDate
        : remoteBurnSummary.projectionDate
        ? new Date(remoteBurnSummary.projectionDate)
        : null

    return {
      ...localBurnSummary,
      ...remoteBurnSummary,
      projectionDate,
    }
  }, [localBurnSummary, remoteBurnSummary])

  const pacing = calculateBudgetPacing(normalizedBudget)

  const cycleType = budget.cycleMetadata?.type || "monthly"
  const cycleLabel = getCycleLabel(cycleType)
  const cycleStartDate = budget.cycleMetadata?.currentStart
    ? new Date(budget.cycleMetadata.currentStart)
    : null
  const cycleStartDisplay = cycleStartDate ? cycleStartDate.toLocaleDateString() : budget.createdAt
  const allocationTotal = allocationDraft.reduce(
    (sum, entry) => sum + (Number(entry.budgetedAmount) || 0),
    0,
  )

  // Calculate category breakdown for pie chart
  const categoryBreakdown = transactions
    .filter((t) => t.type === "expense")
    .reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount
      return acc
    }, {})

  const categoryData = Object.entries(categoryBreakdown)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
      icon: categories.expense.find((c) => c.name === category)?.icon || "💰",
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5) // Show top 5 categories

  // Generate colors for categories
  const categoryColors = [
    "#ef4444", // red-500
    "#f97316", // orange-500
    "#eab308", // yellow-500
    "#22c55e", // green-500
    "#3b82f6", // blue-500
    "#8b5cf6", // purple-500
    "#ec4899", // pink-500
  ]

  // Get all transactions for current tab and sort them
  const allTransactions = transactions
    .filter((t) => t.type === resolveTypeKey(tab))
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  // Calculate pagination
  const totalPages = Math.ceil(allTransactions.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const currentTransactions = allTransactions.slice(startIndex, endIndex)

  // Reset to page 1 when switching tabs
  const handleTabChange = (newTab) => {
    setTab(newTab)
    setCurrentPage(1)
  }

  const handlePageChange = (page) => {
    setCurrentPage(page)
  }

  const renderPagination = () => {
    if (totalPages <= 1) return null

    const pages = []
    const maxVisiblePages = 5

    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2))
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1)

    // Adjust start page if we're near the end
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1)
    }

    // Previous button
    if (currentPage > 1) {
      pages.push(
        <button key="prev" className="pagination-button" onClick={() => handlePageChange(currentPage - 1)}>
          ←
        </button>,
      )
    }

    // First page and ellipsis
    if (startPage > 1) {
      pages.push(
        <button key={1} className="pagination-button" onClick={() => handlePageChange(1)}>
          1
        </button>,
      )
      if (startPage > 2) {
        pages.push(
          <span key="ellipsis1" className="pagination-ellipsis">
            ...
          </span>,
        )
      }
    }

    // Page numbers
    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          className={`pagination-button ${currentPage === i ? "active" : ""}`}
          onClick={() => handlePageChange(i)}
        >
          {i}
        </button>,
      )
    }

    // Last page and ellipsis
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push(
          <span key="ellipsis2" className="pagination-ellipsis">
            ...
          </span>,
        )
      }
      pages.push(
        <button key={totalPages} className="pagination-button" onClick={() => handlePageChange(totalPages)}>
          {totalPages}
        </button>,
      )
    }

    // Next button
    if (currentPage < totalPages) {
      pages.push(
        <button key="next" className="pagination-button" onClick={() => handlePageChange(currentPage + 1)}>
          →
        </button>,
      )
    }

    return (
      <div className="pagination-container">
        <div className="pagination-info">
          Showing {startIndex + 1}-{Math.min(endIndex, allTransactions.length)} of {allTransactions.length} transactions
        </div>
        <div className="pagination-controls">{pages}</div>
      </div>
    )
  }

  return (
    <div>
      <div className="header-nav">
        <button className="cancelButton secondary-button" onClick={() => setViewMode("budgets")}>
          ← Back
        </button>
        <button className="ai-insights-button primary-button" onClick={() => setViewMode("ai")}>
          🧠 AI Finance Report
        </button>
      </div>

      <input
        className="input budget-title-input no-border"
        value={budgetNameDraft}
        onChange={(e) => setBudgetNameDraft(e.target.value)}
        onBlur={handleBudgetNameSubmit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        placeholder="Budget Name"
      />

      <div className="budget-cycle-banner">
        <div className={`cycle-pill cycle-${cycleType}`}>
          {cycleLabel}
        </div>
        <div className="cycle-meta">
          <span>Started {cycleStartDisplay}</span>
          <div className={`pacing-indicator pacing-${pacing.overall.status}`} title={pacing.overall.tooltip} role="status">
            <span className="pacing-dot" aria-hidden="true" />
            <span className="pacing-label">{pacing.overall.label}</span>
          </div>
        </div>
        <div className="cycle-actions">
          <button className="secondary-button" onClick={() => setCycleModalOpen(true)}>
            Edit cycle
          </button>
          <button className="link-button" onClick={() => setChangeLogOpen(true)}>
            Change log
          </button>
        </div>
      </div>

      <div className="category-allocation-card" id="allocations">
        <div className="allocation-header">
          <h3>Category allocations</h3>
          <div className="allocation-header-actions">
            <span className="allocation-total">Total {formatCurrency(allocationTotal)}</span>
            <button className="secondary-button" onClick={() => setShowAddCategory(true)}>
              Add category
            </button>
          </div>
        </div>
        {allocationDraft.length === 0 ? (
          <div className="empty-state small">No allocations yet. Add your first category to plan this cycle.</div>
        ) : (
          <div className="allocation-table">
            {allocationDraft.map((entry) => (
              <div key={entry.category} className="allocation-row">
                <div className="allocation-name">{entry.category}</div>
                <input
                  type="number"
                  className="input allocation-input"
                  value={entry.budgetedAmount}
                  onChange={(e) => handleAllocationChange(entry.category, e.target.value)}
                  min="0"
                  step="0.01"
                />
                <button
                  className="allocation-delete"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openDeleteCategoryModal(entry)
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="allocation-footer">
          <button className="primary-button" onClick={saveAllocations} disabled={!allocationDirty || loading}>
            {loading ? "Saving..." : "Save allocations"}
          </button>
        </div>
      </div>

      {showAddCategory && (
        <div className="modalBackdrop">
          <div className="modalContent small-modal">
            <h3 className="header modal-header">Add category</h3>
            <label className="input-label" htmlFor="new-category-name">
              Name
            </label>
            <input
              id="new-category-name"
              className="input"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Category name"
            />
            <label className="input-label" htmlFor="new-category-amount">
              Allocation amount
            </label>
            <input
              id="new-category-amount"
              className="input"
              type="number"
              step="0.01"
              min="0"
              value={newCategoryAmount}
              onChange={(e) => setNewCategoryAmount(e.target.value)}
            />
            <div className="modal-actions">
              <button className="addButton primary-button" onClick={handleAddCategory}>
                Add
              </button>
              <button className="cancelButton secondary-button" onClick={cancelAddCategory}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Budget Overview Section */}
      <div className="budget-overview-card">
        <h3 className="overview-title">Budget Overview</h3>

        <div className="overview-content">
          <div className="overview-stats">
            <div className="stat-item">
              <div className="stat-label">Total Income</div>
              <div className="stat-value income">${totalIncome.toFixed(2)}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Total Spent</div>
              <div className="stat-value expense">${totalExpenses.toFixed(2)}</div>
            </div>
            {totalBudgeted > 0 && (
              <div className="stat-item stat-item-full-width">
                <div className="stat-label">Total Budgeted</div>
                <div className="stat-value">${totalBudgeted.toFixed(2)}</div>
              </div>
            )}
          </div>

          <div className="balance-display">
            <div className="balance-label">Remaining Balance</div>
            <div className={`balance-amount ${balance >= 0 ? "income" : "expense"}`}>${balance.toFixed(2)}</div>
          </div>

          {/* Pie Chart Section */}
          {categoryData.length > 0 && (
            <div className="category-chart-section">
              <h4 className="chart-section-title">Spending Breakdown</h4>
              <div className="chart-container-centered">
                <div className="pie-chart-wrapper">
                  <svg
                    className="pie-chart"
                    viewBox="0 0 200 200"
                    width="200"
                    height="200"
                    onClick={(e) => {
                      // Check if click was on the background (not a slice)
                      if (e.target.tagName === "svg" || e.target.tagName === "circle" || e.target.tagName === "text") {
                        setSelectedSlice(null)
                      }
                    }}
                  >
                    {categoryData.map((cat, index) => {
                      let cumulativePercentage = 0
                      for (let i = 0; i < index; i++) {
                        cumulativePercentage += categoryData[i].percentage
                      }

                      const startAngle = (cumulativePercentage / 100) * 360
                      const endAngle = ((cumulativePercentage + cat.percentage) / 100) * 360
                      const largeArcFlag = cat.percentage > 50 ? 1 : 0

                      const startAngleRad = (startAngle * Math.PI) / 180
                      const endAngleRad = (endAngle * Math.PI) / 180

                      const x1 = 100 + 80 * Math.cos(startAngleRad)
                      const y1 = 100 + 80 * Math.sin(startAngleRad)
                      const x2 = 100 + 80 * Math.cos(endAngleRad)
                      const y2 = 100 + 80 * Math.sin(endAngleRad)

                      const pathData = [
                        `M 100 100`,
                        `L ${x1} ${y1}`,
                        `A 80 80 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                        `Z`,
                      ].join(" ")

                      return (
                        <path
                          key={cat.category}
                          d={pathData}
                          fill={categoryColors[index % categoryColors.length]}
                          stroke="white"
                          strokeWidth="2"
                          className={`pie-slice ${selectedSlice === index ? "selected" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedSlice(selectedSlice === index ? null : index)
                          }}
                        />
                      )
                    })}
                    {/* Center circle for donut effect */}
                    <circle cx="100" cy="100" r="35" fill="white" />
                    <text x="100" y="95" textAnchor="middle" className="chart-center-text" fontSize="12" fill="#6b7280">
                      Total
                    </text>
                    <text
                      x="100"
                      y="110"
                      textAnchor="middle"
                      className="chart-center-amount"
                      fontSize="14"
                      fontWeight="600"
                      fill="#374151"
                    >
                      ${totalExpenses.toFixed(0)}
                    </text>
                  </svg>
                </div>

                {/* Selected slice details */}
                {selectedSlice !== null && (
                  <div className="slice-details">
                    <div className="slice-details-content">
                      <div className="slice-header">
                        <div
                          className="slice-color-dot"
                          style={{ backgroundColor: categoryColors[selectedSlice % categoryColors.length] }}
                        ></div>
                        <span className="slice-icon">{categoryData[selectedSlice].icon}</span>
                        <span className="slice-category">{categoryData[selectedSlice].category}</span>
                      </div>
                      <div className="slice-amount">${categoryData[selectedSlice].amount.toFixed(2)}</div>
                      <div className="slice-percentage">
                        {categoryData[selectedSlice].percentage.toFixed(1)}% of total spending
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Visual Progress Bar */}
        <div className="budget-progress">
          <div className="progress-labels">
            <span className="income">Income: ${totalIncome.toFixed(2)}</span>
            <span className="expense">Spent: ${totalExpenses.toFixed(2)}</span>
          </div>
          <div className="progress-bar-container">
            <div className="income-bar">
              {totalIncome > 0 && (
                <div
                  className="expense-overlay"
                  style={{
                    width: `${Math.min((totalExpenses / totalIncome) * 100, 100)}%`,
                  }}
                ></div>
              )}
            </div>
          </div>
        </div>
      </div>

      {pacing.categories.length > 0 && (
        <div className="category-budget-list-card">
          <h3 className="category-budget-list-title">Category Pacing</h3>
          <div className="category-budget-list">
            {pacing.categories.map((cat) => {
              const percent = cat.budgeted > 0 ? Math.min((cat.actual / cat.budgeted) * 100, 100) : cat.actual > 0 ? 100 : 0

              return (
                <div key={cat.key || cat.name} className="category-budget-list-row">
                  <div className="category-budget-header">
                    <div className="category-budget-name">{cat.name || "Uncategorized"}</div>
                    <div
                      className={`pacing-indicator pacing-${cat.status}`}
                      title={cat.tooltip}
                      role="status"
                      aria-label={`${cat.name || "Uncategorized"} pacing is ${cat.label}`}
                    >
                      <span className="pacing-dot" aria-hidden="true" />
                      <span className="pacing-label">{cat.label}</span>
                    </div>
                  </div>
                  <div className="category-budget-amounts">
                    ${cat.actual.toFixed(2)} / ${cat.budgeted.toFixed(2)}
                  </div>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill ${cat.actual > cat.budgeted && cat.budgeted > 0 ? "over" : ""}`}
                      style={{ width: `${percent}%` }}
                    ></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="cashburn-section">
        <div className="cashburn-header">
          <h3>Cash burn insights</h3>
          <span className="cashburn-subtitle">
            Weekly digest · next drop {weeklyReport.currentEnd ? new Date(weeklyReport.currentEnd).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "soon"}
          </span>
        </div>

        <div className="cashburn-summary-grid">
          <div className={`cashburn-status-badge status-${burnSummary.status}`}>{burnSummary.badgeLabel}</div>
          <div className="cashburn-metric">
            <span className="cashburn-metric-label">Daily burn</span>
            <span className="cashburn-metric-value">{formatCurrency(burnSummary.burnPerDay)}</span>
          </div>
          <div className="cashburn-metric">
            <span className="cashburn-metric-label">Weekly burn</span>
            <span className="cashburn-metric-value">{formatCurrency(burnSummary.burnPerWeek)}</span>
          </div>
          <div className="cashburn-metric">
            <span className="cashburn-metric-label">Monthly burn</span>
            <span className="cashburn-metric-value">{formatCurrency(burnSummary.burnPerMonth)}</span>
          </div>
          <div className="cashburn-metric projection">
            <span className="cashburn-metric-label">Days left</span>
            <span className="cashburn-metric-value">
              {typeof burnSummary.daysLeft === "number"
                ? `${Math.max(0, burnSummary.daysLeft)} ${burnSummary.daysLeft === 1 ? "day" : "days"}`
                : burnSummary.burnPerDay === 0
                  ? "Not burning"
                  : "—"}
            </span>
            {burnSummary.projectionDate && (
              <span className="cashburn-projection-date">
                until {burnSummary.projectionDate.toLocaleDateString([], { dateStyle: "medium" })}
              </span>
            )}
          </div>
        </div>

        {burnSyncLoading && (
          <div className="cashburn-sync-status" role="status">Syncing latest burn metrics…</div>
        )}
        {burnSyncError && !burnSyncLoading && (
          <div className="cashburn-sync-status error" role="status">
            Using local estimate — {burnSyncError}
          </div>
        )}

        {isFreePlan ? (
          <>
            <div className="plan-teaser">
              Upgrade or start a trial to unlock leak alerts, trend graphs, and burn pacing recommendations.
            </div>
            {budget.adsEnabled && (
              <div className="budget-ad-unit" role="note" aria-label="Sponsored offer">
                <div className="budget-ad-badge">Sponsored</div>
                <div className="budget-ad-copy">Lower recurring bills with Pocket Partner Energy — average savings $18/mo.</div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="cashburn-card-grid">
              {weeklyReport.topCards.length === 0 && (
                <div className="empty-state small">Track spending this week to unlock leak insights.</div>
              )}
              {weeklyReport.topCards.map((card) => (
                <button
                  type="button"
                  key={card.category}
                  className={`cashburn-card pacing-${card.status}`}
                  onClick={() => setExpandedLeak((current) => (current === card.category ? null : card.category))}
                >
                  <div className="cashburn-card-header">
                    <span className="cashburn-category">{card.category}</span>
                    <div className={`pacing-indicator pacing-${card.status}`}>
                      <span className="pacing-dot" aria-hidden="true" />
                      <span className="pacing-label">{card.statusLabel}</span>
                    </div>
                  </div>
                  <div className="cashburn-amount-row">
                    <span className="cashburn-amount">{formatCurrency(card.current)}</span>
                    <span className={`cashburn-delta ${card.delta >= 0 ? "expense" : "income"}`}>
                      {card.delta >= 0 ? "+" : "-"}${Math.abs(card.delta).toFixed(2)} vs last week
                    </span>
                  </div>
                  <div className="cashburn-change">Change {card.pctChange.toFixed(0)}%</div>
                  {expandedLeak === card.category && (
                    <div className="cashburn-trend">
                      <div className="sparkline">{toSparkline(weeklyReport.trends[card.category])}</div>
                      <div className="sparkline-label">Last 6 weeks</div>
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="cashburn-settings">
              <div className="settings-row">
                <label>Report schedule</label>
                <div className="settings-inputs">
                  <select value={reportSchedule.day} onChange={(e) => handleReportScheduleChange("day", e.target.value)}>
                    {Object.keys(DAY_INDEX).map((day) => (
                  <option key={day} value={day}>
                    {day.charAt(0).toUpperCase() + day.slice(1)}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={reportSchedule.time}
                onChange={(e) => handleReportScheduleChange("time", e.target.value)}
              />
            </div>
          </div>

          <div className="settings-row">
            <label>Tracked categories</label>
            <div className="tracked-category-grid">
              {availableCategories.map((name) => {
                const checked = trackedCategories.has(name)
                return (
                  <label key={name} className={`tracked-chip ${checked ? "selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleTrackedCategoryToggle(name)}
                    />
                    <span>{name}</span>
                  </label>
                )
              })}
              {availableCategories.length === 0 && <span>No categories yet.</span>}
            </div>
          </div>

          <div className="settings-row">
            <label>Real-time nudges</label>
            {hasAdvancedStructures ? (
              <div className="nudge-config">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={nudgeConfig.enabled}
                    onChange={(e) => handleNudgeConfigChange({ enabled: e.target.checked })}
                  />
                  <span>Notify me when a category hits {Math.round((Number(nudgeConfig.threshold) || 0.8) * 100)}% of budget</span>
                </label>
                <div className="nudge-threshold">
                  <input
                    type="range"
                    min="0.5"
                    max="1"
                    step="0.05"
                    value={Number(nudgeConfig.threshold) || 0.8}
                    onChange={(e) => handleNudgeConfigChange({ threshold: Number(e.target.value) })}
                  />
                  <span>{Math.round((Number(nudgeConfig.threshold) || 0.8) * 100)}%</span>
                </div>
                <div className="quiet-hours-controls">
                  <span>Quiet hours</span>
                  <div className="settings-inputs">
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={quietHoursStart}
                      onChange={(e) => handleNudgeConfigChange({ quietStart: Number(e.target.value) })}
                    />
                    <span>to</span>
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={quietHoursEnd}
                      onChange={(e) => handleNudgeConfigChange({ quietEnd: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="plan-teaser">Upgrade or start a trial to unlock real-time nudges and advanced budgeting cycles.</div>
            )}
          </div>
        </div>
      </>
      )}
      </div>

      {/* Transaction Tabs and List */}
      <div className="transactions-section">
        <div className="tabRow">
          <button
            className={tab === "expenses" ? "tabActive" : "tabInactive"}
            onClick={() => handleTabChange("expenses")}
          >
            Expenses ({transactions.filter((t) => t.type === "expense").length})
          </button>
          <button className={tab === "income" ? "tabActive" : "tabInactive"} onClick={() => handleTabChange("income")}>
            Income ({transactions.filter((t) => t.type === "income").length})
          </button>
        </div>

        {allTransactions.length === 0 ? (
          <div className="empty-state">
            <p>No {resolveTypeKey(tab)} transactions yet.</p>
            <button className="primary-button" onClick={() => openAddModal(tab)}>
              Add Your First {resolveTypeKey(tab) === "expense" ? "Expense" : "Income"}
            </button>
          </div>
        ) : (
          <>
            {currentTransactions.map((t) => (
              <div key={t.id} className="transaction enhanced-transaction" onClick={() => openEditModal(t)}>
                <div className="transaction-info">
                  <div className="transaction-main">
                    <span className="transaction-icon">
                      {categories[t.type].find((c) => c.name === t.category)?.icon || "💰"}
                    </span>
                    <div className="transaction-details-main">
                      <span className="transaction-name">{t.name}</span>
                      <div className="transaction-meta">
                        {t.category} • {formatTransactionDate(t.date)}
                        {t.receipt && <span className="receipt-indicator">📎</span>}
                      </div>
                    </div>
                    <div className="transaction-amounts">
                      <span className={`transaction-amount ${t.type}`}>
                        {t.type === "income" ? "+" : "-"}${t.amount.toFixed(2)}
                      </span>
                      {t.budgetedAmount && (
                        <span className="budgeted-amount">Budget: ${t.budgetedAmount.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Pagination */}
            {renderPagination()}
          </>
        )}
      </div>

      <button className="fab" onClick={() => openAddModal(tab)}>
        +
      </button>

      {showModal && (
        <div className="modalBackdrop">
          <div className="modalContent enhanced-modal">
            <h2 className="header modal-header">
              {editingTx ? "Edit Transaction" : `Add ${formTx.type === "expense" ? "Expense" : "Income"}`}
            </h2>

            <input
              className="input"
              placeholder="Description"
              value={formTx.name}
              onChange={(e) => setFormTx({ ...formTx, name: e.target.value })}
              disabled={loading}
            />

            <input
              className="input"
              placeholder="Amount"
              type="number"
              step="0.01"
              value={formTx.amount}
              onChange={(e) => setFormTx({ ...formTx, amount: e.target.value })}
              disabled={loading}
            />

            <input
              className="input"
              type="date"
              value={formTx.date}
              onChange={(e) =>
                setFormTx((prev) => ({ ...prev, date: ensureISODate(e.target.value, prev.date) }))
              }
              disabled={loading}
            />

            {formTx.type === "expense" && (
              <input
                className="input"
                placeholder="Budgeted amount (optional)"
                type="number"
                step="0.01"
                value={formTx.budgetedAmount}
                onChange={(e) => setFormTx({ ...formTx, budgetedAmount: e.target.value })}
                disabled={loading}
              />
            )}

            <select
              className="input"
              value={formTx.category}
              onChange={(e) => setFormTx({ ...formTx, category: e.target.value })}
              disabled={loading}
            >
              <option value="">Select Category</option>
              {categories[resolveTypeKey(formTx.type)]?.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>

            {/* Enhanced Receipt Upload Section */}
            <div className="receipt-upload-section">
              <label className="receipt-upload-label">📎 Attach Receipt (Optional)</label>
              <input
                type="file"
                accept="image/*"
                className="receipt-input"
                onChange={(e) => {
                  const file = e.target.files[0]
                  if (file) {
                    const reader = new FileReader()
                    reader.onloadend = () => {
                      setFormTx({ ...formTx, receipt: reader.result })
                    }
                    reader.readAsDataURL(file)
                  }
                }}
                disabled={loading}
              />
              {formTx.receipt && (
                <div className="receipt-preview">
                  <img
                    src={formTx.receipt || "/placeholder.svg"}
                    alt="Receipt preview"
                    className="receipt-preview-img"
                  />
                  <button
                    type="button"
                    className="remove-receipt"
                    onClick={() => setFormTx({ ...formTx, receipt: null })}
                    disabled={loading}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="addButton primary-button" onClick={saveTransaction} disabled={loading}>
                {loading ? "Saving..." : editingTx ? "Update" : "Add"} Transaction
              </button>
              <button
                className="cancelButton secondary-button"
                onClick={() => {
                  setShowModal(false)
                  setEditingTx(null)
                }}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeletion && (
        <div className="modalBackdrop">
          <div className="modalContent small-modal">
            <h3 className="header modal-header">Remove {pendingDeletion.category}</h3>
            {pendingDeletion.remaining > 0 ? (
              <>
                <p>
                  Reallocate {formatCurrency(pendingDeletion.remaining)} from {pendingDeletion.category} before deleting.
                </p>
                <select
                  className="input"
                  value={pendingDeletion.reallocateTo}
                  onChange={(e) =>
                    setPendingDeletion((prev) => ({ ...prev, reallocateTo: e.target.value }))
                  }
                >
                  <option value="">Choose category</option>
                  {allocationDraft
                    .filter((entry) => entry.category !== pendingDeletion.category)
                    .map((entry) => (
                      <option key={entry.category} value={entry.category}>
                        {entry.category}
                      </option>
                    ))}
                </select>
              </>
            ) : (
              <p>Delete {pendingDeletion.category} from this cycle?</p>
            )}
            <div className="modal-actions">
              <button
                className="addButton primary-button"
                onClick={confirmDeleteAllocation}
                disabled={pendingDeletion.remaining > 0 && !pendingDeletion.reallocateTo}
              >
                Confirm
              </button>
              <button className="cancelButton secondary-button" onClick={cancelDeleteAllocation}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {changeLogOpen && (
        <div className="modalBackdrop">
          <div className="modalContent large-modal">
            <h3 className="header modal-header">Change log</h3>
            {changeLog.length === 0 ? (
              <div className="empty-state small">No changes recorded yet.</div>
            ) : (
              <ul className="change-log-list">
                {changeLog.map((entry, index) => {
                  const timestamp = entry?.at || entry?.timestamp
                  const label = timestamp ? new Date(timestamp).toLocaleString() : "Recent"
                  return (
                    <li key={`${label}-${index}`} className="change-log-item">
                      <span className="change-log-time">{label}</span>
                      <span className="change-log-message">{entry?.message || "Updated budget"}</span>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="modal-actions">
              <button className="cancelButton secondary-button" onClick={() => setChangeLogOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {cycleModalOpen && (
        <div className="modalBackdrop">
          <div className="modalContent enhanced-modal">
            <h3 className="header modal-header">Edit cycle</h3>
            <div className="cycle-option-grid">
              {CYCLE_OPTIONS.map((option) => {
                const disabled = option.requiresPaid && !hasAdvancedStructures
                const selected = cycleDraft.type === option.type
                return (
                  <button
                    key={option.type}
                    type="button"
                    className={`cycle-option ${selected ? "selected" : ""} ${disabled ? "locked" : ""}`}
                    onClick={() => {
                      if (disabled) return
                      setCycleDraft((prev) => ({ ...prev, type: option.type }))
                    }}
                    disabled={disabled}
                  >
                    <div className="cycle-option-title">
                      {option.label}
                      {disabled && <span className="lock-icon">🔒</span>}
                    </div>
                    <div className="cycle-option-description">
                      {option.requiresPaid ? "Requires trial or paid" : "Included in Free"}
                    </div>
                  </button>
                )
              })}
            </div>
            {cycleDraft.type === "per-paycheck" && (
              <div className="cycle-config-row">
                <label className="input-label" htmlFor="edit-pay-frequency">
                  Paycheck frequency (days)
                </label>
                <input
                  id="edit-pay-frequency"
                  type="number"
                  className="input"
                  min="7"
                  max="45"
                  value={cycleDraft.payFrequencyDays}
                  onChange={(e) => setCycleDraft((prev) => ({ ...prev, payFrequencyDays: e.target.value }))}
                />
              </div>
            )}
            {cycleDraft.type === "custom" && (
              <div className="cycle-config-row">
                <label className="input-label" htmlFor="edit-cycle-length">
                  Cycle length (days)
                </label>
                <input
                  id="edit-cycle-length"
                  type="number"
                  className="input"
                  min="5"
                  max="120"
                  value={cycleDraft.customDays}
                  onChange={(e) => setCycleDraft((prev) => ({ ...prev, customDays: e.target.value }))}
                />
              </div>
            )}
            <div className="cycle-config-row">
              <label className="input-label" htmlFor="edit-cycle-start">
                Cycle start date
              </label>
              <input
                id="edit-cycle-start"
                type="date"
                className="input"
                value={cycleDraft.startDate}
                onChange={(e) => setCycleDraft((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            {!hasAdvancedStructures && (
              <p className="plan-teaser">Upgrade or begin a trial to use paycheck and custom budgeting cycles.</p>
            )}
            <div className="modal-actions">
              <button
                className="addButton primary-button"
                onClick={handleCycleSave}
                disabled={!hasAdvancedStructures && cycleDraft.type !== "monthly"}
              >
                Save cycle
              </button>
              <button className="cancelButton secondary-button" onClick={() => setCycleModalOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {snackbar && (
        <div className="snackbar">
          <span>{snackbar.message}</span>
          {snackbar.action && (
            <button
              className="link-button"
              onClick={() => {
                snackbar.action()
                closeSnackbar()
              }}
            >
              {snackbar.actionLabel || "Undo"}
            </button>
          )}
          <button className="link-button" onClick={closeSnackbar}>
            Dismiss
          </button>
        </div>
      )}

      {nudgeToast && (
        <div className="nudge-toast" role="status">
          <div className="nudge-copy">
            <strong>{nudgeToast.category}</strong> is at {(nudgeToast.ratio * 100).toFixed(0)}% of its budget.
          </div>
          <div className="nudge-actions">
            <button
              className="link-button"
              onClick={() => {
                acknowledgeNudge(nudgeToast.category)
                document.getElementById("allocations")?.scrollIntoView({ behavior: "smooth" })
              }}
            >
              Adjust budget
            </button>
            <button className="link-button" onClick={() => snoozeNudges()}>
              Snooze
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const transactionShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  amount: PropTypes.number.isRequired,
  budgetedAmount: PropTypes.number,
  category: PropTypes.string.isRequired,
  type: PropTypes.oneOf(["income", "expense"]).isRequired,
  date: PropTypes.string.isRequired,
  receipt: PropTypes.string,
})

const categoryShape = PropTypes.shape({
  name: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
})

BudgetDetailsScreen.propTypes = {
  budget: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    transactions: PropTypes.arrayOf(transactionShape),
    categoryBudgets: PropTypes.arrayOf(
      PropTypes.shape({
        category: PropTypes.string.isRequired,
        budgetedAmount: PropTypes.number.isRequired,
      }),
    ),
    metadata: PropTypes.object,
    insightsPreferences: PropTypes.shape({
      trackedCategories: PropTypes.arrayOf(PropTypes.string),
      reportSchedule: PropTypes.shape({
        day: PropTypes.string,
        time: PropTypes.string,
      }),
      nudges: PropTypes.shape({
        enabled: PropTypes.bool,
        threshold: PropTypes.number,
      }),
    }),
    changeLog: PropTypes.arrayOf(
      PropTypes.shape({
        at: PropTypes.string,
        message: PropTypes.string,
        type: PropTypes.string,
      }),
    ),
    cycleMetadata: PropTypes.shape({
      type: PropTypes.string,
      currentStart: PropTypes.string,
      payFrequencyDays: PropTypes.number,
      customDays: PropTypes.number,
      lengthDays: PropTypes.number,
      cycleLength: PropTypes.number,
    }),
    adsEnabled: PropTypes.bool,
    createdAt: PropTypes.string,
  }).isRequired,
  categories: PropTypes.shape({
    income: PropTypes.arrayOf(categoryShape).isRequired,
    expense: PropTypes.arrayOf(categoryShape).isRequired,
  }).isRequired,
  setViewMode: PropTypes.func.isRequired,
  setBudgets: PropTypes.func.isRequired,
  budgets: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      transactions: PropTypes.arrayOf(transactionShape),
    }),
  ).isRequired,
  setSelectedBudget: PropTypes.func.isRequired,
  onMetadataChange: PropTypes.func,
}

BudgetDetailsScreen.defaultProps = {
  onMetadataChange: undefined,
}
