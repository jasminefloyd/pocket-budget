import { useEffect, useMemo, useState } from "react"
import PropTypes from "prop-types"
import { signOut, updateUserProfile } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"

const THEME_STORAGE_KEY = "pb:theme-preference"

const resolveSystemTheme = () => {
  if (typeof window === "undefined") return "light"
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

const useThemePreference = () => {
  const [preference, setPreference] = useState(() => {
    if (typeof window === "undefined") return "system"
    return localStorage.getItem(THEME_STORAGE_KEY) || "system"
  })
  const [systemTheme, setSystemTheme] = useState(resolveSystemTheme)

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = (event) => setSystemTheme(event.matches ? "dark" : "light")
    if (media.addEventListener) {
      media.addEventListener("change", handleChange)
    } else if (media.addListener) {
      media.addListener(handleChange)
    }
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener("change", handleChange)
      } else if (media.removeListener) {
        media.removeListener(handleChange)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (preference === "system") {
      localStorage.removeItem(THEME_STORAGE_KEY)
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, preference)
    }
  }, [preference])

  useEffect(() => {
    if (typeof document === "undefined") return
    const effectiveTheme = preference === "system" ? systemTheme : preference
    document.documentElement.dataset.theme = effectiveTheme
  }, [preference, systemTheme])

  return {
    preference,
    systemTheme,
    effectiveTheme: preference === "system" ? systemTheme : preference,
    setThemePreference: setPreference,
    resetToSystem: () => setPreference("system"),
  }
}

const DEFAULT_PREFERENCES = {
  budgetStyle: "zero-based",
  currency: "USD",
  notifications: {
    weeklyReports: true,
    aiNudges: true,
  },
}

const formatInitials = (name, email) => {
  if (name?.trim()) {
    const segments = name.trim().split(" ")
    return segments
      .slice(0, 2)
      .map((segment) => segment.charAt(0).toUpperCase())
      .join("")
  }
  if (email) {
    return email.charAt(0).toUpperCase()
  }
  return "U"
}

const mergePreferences = (profilePreferences) => {
  if (!profilePreferences) return DEFAULT_PREFERENCES
  return {
    ...DEFAULT_PREFERENCES,
    ...profilePreferences,
    notifications: {
      ...DEFAULT_PREFERENCES.notifications,
      ...(profilePreferences.notifications || {}),
    },
  }
}

const currencyOptions = ["USD", "EUR", "GBP", "AUD", "CAD", "JPY", "INR"]

export default function SettingsScreen({ user, categories, budgets, onManageCategories }) {
  const { userProfile, refreshProfile, setUserProfile } = useAuth()
  const [editOpen, setEditOpen] = useState(false)
  const [profileDraft, setProfileDraft] = useState({ name: "", email: "" })
  const [profileStatus, setProfileStatus] = useState(null)
  const [preferencesState, setPreferencesState] = useState(DEFAULT_PREFERENCES)
  const [preferencesStatus, setPreferencesStatus] = useState(null)
  const [preferencesError, setPreferencesError] = useState(null)
  const [utilityStatus, setUtilityStatus] = useState(null)
  const [utilityLoading, setUtilityLoading] = useState(false)
  const { preference, effectiveTheme, setThemePreference, resetToSystem } = useThemePreference()

  useEffect(() => {
    setProfileDraft({
      name: userProfile?.full_name || "",
      email: userProfile?.email || user?.email || "",
    })
  }, [user?.email, userProfile?.email, userProfile?.full_name])

  useEffect(() => {
    setPreferencesState(mergePreferences(userProfile?.preferences))
  }, [userProfile?.preferences])

  const handleSignOut = async () => {
    if (confirm("Are you sure you want to sign out?")) {
      await signOut()
    }
  }

  const tier = useMemo(() => {
    const candidate = userProfile?.tier || userProfile?.subscription_tier
    if (!candidate) return "Free"
    return candidate.charAt(0).toUpperCase() + candidate.slice(1)
  }, [userProfile?.subscription_tier, userProfile?.tier])

  const preferencesDirty = useMemo(() => preferencesStatus === "saving", [preferencesStatus])

  const updatePreferences = async (updater) => {
    if (!user?.id) return
    setPreferencesStatus("saving")
    setPreferencesError(null)
    setUtilityStatus(null)
    const nextPreferences = typeof updater === "function" ? updater(preferencesState) : updater
    setPreferencesState(nextPreferences)
    try {
      const { data, error } = await updateUserProfile(user.id, { preferences: nextPreferences })
      if (error) {
        setPreferencesError(error.message || "Unable to save preferences")
        setPreferencesStatus("error")
        return
      }
      if (data) {
        setUserProfile?.(data)
      } else {
        await refreshProfile?.()
      }
      setPreferencesStatus("saved")
    } catch (error) {
      console.error("Failed to update preferences", error)
      setPreferencesError(error.message || "Unexpected error saving preferences")
      setPreferencesStatus("error")
    }
  }

  const handleProfileSubmit = async (event) => {
    event.preventDefault()
    if (!user?.id) return
    setProfileStatus("saving")
    try {
      const { data, error } = await updateUserProfile(user.id, {
        full_name: profileDraft.name,
        email: profileDraft.email,
      })
      if (error) {
        setProfileStatus(error.message || "Unable to update profile")
        return
      }
      if (data) {
        setUserProfile?.(data)
      } else {
        await refreshProfile?.()
      }
      setProfileStatus("Profile updated")
      setEditOpen(false)
    } catch (error) {
      console.error("Failed to update profile", error)
      setProfileStatus(error.message || "Unexpected error updating profile")
    }
  }

  const handleThemeToggle = () => {
    if (preference === "system") {
      setThemePreference(effectiveTheme === "dark" ? "light" : "dark")
      return
    }
    setThemePreference(effectiveTheme === "dark" ? "light" : "dark")
  }

  const handleExportData = () => {
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      user: {
        id: user?.id,
        email: user?.email,
      },
      profile: userProfile,
      categories,
      budgets: (budgets || []).map((budget) => ({
        id: budget.id,
        name: budget.name,
        categoryBudgets: budget.categoryBudgets,
        transactions: budget.transactions,
      })),
    }

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `pocket-budget-export-${new Date().toISOString().split("T")[0]}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setUtilityStatus("Data exported successfully")
  }

  const handleClearCache = async () => {
    if (typeof window === "undefined") return
    setUtilityLoading(true)
    setUtilityStatus(null)
    try {
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i)
        if (!key) continue
        if (key.startsWith("pb:") || key.includes("budgets_") || key.includes("transactions_") || key.includes("mock")) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key))
      if (window.caches) {
        const cacheKeys = await window.caches.keys()
        await Promise.all(cacheKeys.map((cacheKey) => window.caches.delete(cacheKey)))
      }
      setUtilityStatus("Local cache cleared")
    } catch (error) {
      console.error("Failed to clear cache", error)
      setUtilityStatus(error.message || "Unable to clear cache")
    } finally {
      setUtilityLoading(false)
    }
  }

  const incomeCount = categories?.income?.length || 0
  const expenseCount = categories?.expense?.length || 0

  return (
    <div className="settings-screen">
      <section className="settings-section">
        <h2>Profile &amp; Account</h2>
        <div className="settings-card profile-card">
          <div className="profile-header">
            <div className="avatar" aria-hidden="true">
              {formatInitials(userProfile?.full_name, user?.email)}
            </div>
            <div>
              <p className="settings-name">{userProfile?.full_name || user?.email}</p>
              <p className="settings-email">{userProfile?.email || user?.email}</p>
            </div>
          </div>
          <div className="profile-actions">
            <button type="button" className="secondary-button" onClick={() => setEditOpen(true)}>
              Edit profile
            </button>
            <button type="button" className="link-button" onClick={handleSignOut}>
              Log out
            </button>
          </div>
          {typeof profileStatus === "string" && profileStatus !== "saving" && (
            <p className="status-text">{profileStatus}</p>
          )}
        </div>
      </section>

      <section className="settings-section">
        <h2>Subscription &amp; Billing</h2>
        <div className="settings-card subscription-card">
          <div>
            <p className="subscription-tier">Current plan: {tier}</p>
            <p className="settings-description">
              Unlock unlimited AI reports, sharing, and premium widgets with Pocket Budget Pro.
            </p>
          </div>
          <button type="button" className="primary-button">
            {tier.toLowerCase() === "pro" ? "Manage plan" : "Upgrade to Pro"}
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>Preferences</h2>
        <div className="settings-card">
          <div className="settings-row">
            <div>
              <h3>Budget style</h3>
              <p className="settings-description">Choose how Pocket Budget frames your envelopes.</p>
            </div>
            <div className="segmented-control" role="group" aria-label="Budget style">
              {[
                { value: "zero-based", label: "Zero-based" },
                { value: "envelope", label: "Envelope" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={preferencesState.budgetStyle === option.value ? "is-active" : ""}
                  onClick={() => updatePreferences((prev) => ({ ...prev, budgetStyle: option.value }))}
                  disabled={preferencesDirty}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div>
              <h3>Currency</h3>
              <p className="settings-description">Display budgets and reports in your preferred currency.</p>
            </div>
            <select
              value={preferencesState.currency}
              onChange={(event) => updatePreferences((prev) => ({ ...prev, currency: event.target.value }))}
              disabled={preferencesDirty}
            >
              {currencyOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          <div className="settings-row">
            <div>
              <h3>Notifications</h3>
              <p className="settings-description">Stay on top of weekly digests and AI nudges.</p>
            </div>
            <div className="toggle-group">
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(preferencesState.notifications.weeklyReports)}
                  onChange={(event) =>
                    updatePreferences((prev) => ({
                      ...prev,
                      notifications: {
                        ...prev.notifications,
                        weeklyReports: event.target.checked,
                      },
                    }))
                  }
                />
                Weekly reports
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(preferencesState.notifications.aiNudges)}
                  onChange={(event) =>
                    updatePreferences((prev) => ({
                      ...prev,
                      notifications: {
                        ...prev.notifications,
                        aiNudges: event.target.checked,
                      },
                    }))
                  }
                />
                AI nudges
              </label>
            </div>
          </div>
          {preferencesStatus === "saved" && <p className="status-text">Preferences saved</p>}
          {preferencesStatus === "error" && <p className="status-text error">{preferencesError}</p>}
        </div>
      </section>

      <section className="settings-section">
        <h2>App Settings</h2>
        <div className="settings-card">
          <div className="settings-row">
            <div>
              <h3>Dark mode</h3>
              <p className="settings-description">Pocket Budget follows your system theme automatically.</p>
            </div>
            <div className="theme-toggle">
              <button type="button" className={effectiveTheme === "dark" ? "is-active" : ""} onClick={handleThemeToggle}>
                {effectiveTheme === "dark" ? "Dark" : "Light"}
              </button>
              <button type="button" className="link-button" onClick={resetToSystem}>
                Use system default
              </button>
            </div>
          </div>

          <div className="settings-row">
            <div>
              <h3>Export data</h3>
              <p className="settings-description">Download a copy of your budgets and transaction history.</p>
            </div>
            <button type="button" className="secondary-button" onClick={handleExportData}>
              Export JSON
            </button>
          </div>

          <div className="settings-row">
            <div>
              <h3>Clear cache</h3>
              <p className="settings-description">Remove stored sessions and offline data.</p>
            </div>
            <button type="button" className="link-button" onClick={handleClearCache} disabled={utilityLoading}>
              {utilityLoading ? "Clearing…" : "Clear cache"}
            </button>
          </div>
          {utilityStatus && <p className="status-text">{utilityStatus}</p>}
        </div>
      </section>

      <section className="settings-section">
        <h2>Categories</h2>
        <div className="settings-card">
          <p className="settings-description">
            You have {incomeCount} income categories and {expenseCount} expense categories configured.
          </p>
          <button type="button" className="primary-button" onClick={onManageCategories}>
            Manage categories
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>About Pocket Budget</h2>
        <div className="settings-card about-card">
          <p>Version 1.0.0</p>
          <p>
            <a href="https://pocketbudget.app/privacy" target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
            <span aria-hidden="true"> · </span>
            <a href="https://pocketbudget.app/terms" target="_blank" rel="noreferrer">
              Terms of Service
            </a>
          </p>
        </div>
      </section>

      {editOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="modal" onSubmit={handleProfileSubmit}>
            <h2>Edit profile</h2>
            <label>
              Full name
              <input
                className="input"
                value={profileDraft.name}
                onChange={(event) => setProfileDraft((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label>
              Email
              <input
                className="input"
                type="email"
                value={profileDraft.email}
                onChange={(event) => setProfileDraft((prev) => ({ ...prev, email: event.target.value }))}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setEditOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary-button">
                Save changes
              </button>
            </div>
            {profileStatus === "saving" && <p className="status-text">Saving…</p>}
          </form>
        </div>
      )}
    </div>
  )
}

SettingsScreen.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.string,
    email: PropTypes.string,
  }),
  categories: PropTypes.shape({
    income: PropTypes.array,
    expense: PropTypes.array,
  }),
  budgets: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      name: PropTypes.string,
      categoryBudgets: PropTypes.array,
      transactions: PropTypes.array,
    }),
  ),
  onManageCategories: PropTypes.func,
}

SettingsScreen.defaultProps = {
  user: null,
  categories: { income: [], expense: [] },
  budgets: [],
  onManageCategories: undefined,
}
