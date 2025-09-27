import { persistPreferencesUpdate } from "../src/screens/preferencesPersistence.js"

const initialPreferences = {
  budgetStyle: "zero-based",
  currency: "USD",
  notifications: {
    weeklyReports: true,
    aiNudges: true,
  },
}

const state = { current: initialPreferences }
const logs = []

const pendingRef = { current: null }

const result = await persistPreferencesUpdate({
  userId: "user-123",
  updater: (current) => ({
    ...current,
    currency: "EUR",
    notifications: {
      ...current.notifications,
      weeklyReports: false,
    },
  }),
  getCurrentPreferences: () => state.current,
  setPreferencesState: (next) => {
    logs.push({ type: "state", next })
    state.current = next
  },
  setPreferencesStatus: (status) => logs.push({ type: "status", status }),
  setPreferencesError: (error) => logs.push({ type: "error", error }),
  setUtilityStatus: () => logs.push({ type: "utility", cleared: true }),
  updateUserProfileFn: async () => {
    throw new Error("Simulated failure")
  },
  setUserProfile: () => logs.push({ type: "profile" }),
  refreshProfile: async () => logs.push({ type: "refresh" }),
  pendingRef,
})

console.log(
  JSON.stringify(
    {
      result,
      finalState: state.current,
      logs,
    },
    null,
    2,
  ),
)
