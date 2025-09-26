"use client"

import { createContext, useContext, useEffect, useState } from "react"
import {
  supabase,
  getCurrentUser,
  createUserProfile,
  getUserProfile,
  updateUserProfile,
  getUserSubscription,
  upsertUserSubscription,
  cancelUserSubscription,
} from "../lib/supabase"
import { PLAN_IDS, calculateTrialEndDate, getPlanById, getPrimaryPaidPlan, isPaidPlan } from "../lib/plans"

const AuthContext = createContext({})

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    let mounted = true

    // Get initial session with timeout
    const getInitialSession = async () => {
      try {
        // Add timeout to prevent infinite loading
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Session timeout")), 10000))

        const sessionPromise = getCurrentUser()

        const { user: currentUser } = await Promise.race([sessionPromise, timeoutPromise])

        if (!mounted) return

        setUser(currentUser)

        if (currentUser) {
          await loadUserProfile(currentUser.id)
        }
      } catch (error) {
        console.error("Error getting initial session:", error)
        // Don't stay stuck - continue with no user
        if (mounted) {
          setUser(null)
          setUserProfile(null)
        }
      } finally {
        if (mounted) {
          setInitializing(false)
          setLoading(false)
        }
      }
    }

    getInitialSession()

    // Listen for auth changes (both Supabase and demo)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      console.log("Auth state changed:", event, session?.user?.id)

      try {
        setUser(session?.user ?? null)

        if (session?.user) {
          await loadUserProfile(session.user.id)
        } else {
          setUserProfile(null)
          setSubscription(null)
        }
      } catch (error) {
        console.error("Error handling auth state change:", error)
      } finally {
        if (mounted) {
          setLoading(false)
          setInitializing(false)
        }
      }
    })

    // Listen for demo auth changes
    const handleDemoAuthChange = async (event) => {
      if (!mounted) return

      const { session, event: authEvent } = event.detail
      console.log("Demo auth state changed:", authEvent, session?.user?.id)

      try {
        setUser(session?.user ?? null)

        if (session?.user) {
          await loadUserProfile(session.user.id)
        } else {
          setUserProfile(null)
          setSubscription(null)
        }
      } catch (error) {
        console.error("Error handling demo auth state change:", error)
      } finally {
        if (mounted) {
          setLoading(false)
          setInitializing(false)
        }
      }
    }

    window.addEventListener("demo-auth-change", handleDemoAuthChange)

    return () => {
      mounted = false
      subscription.unsubscribe()
      window.removeEventListener("demo-auth-change", handleDemoAuthChange)
    }
  }, [])

  const loadUserProfile = async (userId) => {
    try {
      let resolvedProfile = null
      const { data: profile, error } = await getUserProfile(userId)

      if (error && error.code === "PGRST116") {
        // Profile doesn't exist, create it
        const current = await getCurrentUser()
        if (current.user) {
          const { data: newProfile } = await createUserProfile(
            current.user.id,
            current.user.email,
            current.user.user_metadata?.full_name || current.user.email,
          )
          resolvedProfile = newProfile?.[0] || null
        }
      } else if (!error) {
        resolvedProfile = profile
      }

      if (resolvedProfile) {
        setUserProfile(resolvedProfile)
      }

      if (error && error.code !== "PGRST116") {
        console.error("Error loading user profile:", error)
      }

      const { data: subscriptionData, error: subscriptionError } = await getUserSubscription(userId)

      if (subscriptionError && subscriptionError.code && subscriptionError.code !== "PGRST116") {
        console.error("Error loading subscription:", subscriptionError)
      }

      if (subscriptionData) {
        setSubscription(subscriptionData)
      } else if (resolvedProfile) {
        // Seed a default subscription record so entitlement calculations stay consistent
        const trialEndsAt = resolvedProfile.trial_ends_at ?? null
        const isTrialActive = trialEndsAt ? new Date(trialEndsAt).getTime() > Date.now() : false
        const status = isPaidPlan(resolvedProfile.plan) ? "active" : isTrialActive ? "trialing" : "inactive"

        const { data: seededSubscription, error: seedError } = await upsertUserSubscription(userId, {
          plan: resolvedProfile.plan ?? PLAN_IDS.FREE,
          status,
          trial_ends_at: trialEndsAt,
          ads_enabled: resolvedProfile.ads_enabled ?? true,
        })

        if (!seedError) {
          setSubscription(seededSubscription)
        } else {
          console.error("Error creating default subscription record:", seedError)
          setSubscription(null)
        }
      } else {
        setSubscription(null)
      }
    } catch (error) {
      console.error("Error loading user profile:", error)
      // Don't block the app if profile loading fails
      setUserProfile(null)
      setSubscription(null)
    }
  }

  const refreshSubscription = async () => {
    if (!user) {
      return { data: null, error: new Error("Not authenticated") }
    }

    const { data, error } = await getUserSubscription(user.id)

    if (!error) {
      setSubscription(data)
    }

    return { data, error }
  }

  const applyProfileSync = async (updates) => {
    if (!user) return

    setUserProfile((prev) => (prev ? { ...prev, ...updates } : prev))
    try {
      await updateUserProfile(user.id, updates)
    } catch (error) {
      console.error("Failed to persist profile updates:", error)
    }
  }

  const upgradeToPlan = async (planId, { startTrial = false } = {}) => {
    if (!user) {
      return { data: null, error: new Error("Not authenticated") }
    }

    const trialEndsAt = startTrial ? calculateTrialEndDate().toISOString() : null

    const { data, error } = await upsertUserSubscription(user.id, {
      plan: planId,
      status: "active",
      trial_ends_at: startTrial ? trialEndsAt : null,
      ads_enabled: isPaidPlan(planId) ? false : true,
    })

    if (!error) {
      setSubscription(data)
      await applyProfileSync({
        plan: data?.plan ?? planId,
        trial_ends_at: data?.trial_ends_at ?? (startTrial ? trialEndsAt : null),
        ads_enabled: data?.ads_enabled ?? (isPaidPlan(planId) ? false : true),
      })
    }

    return { data, error }
  }

  const downgradeToFree = async () => {
    if (!user) {
      return { data: null, error: new Error("Not authenticated") }
    }

    const { data, error } = await cancelUserSubscription(user.id)

    if (!error) {
      setSubscription(data)
      await applyProfileSync({
        plan: PLAN_IDS.FREE,
        trial_ends_at: null,
        ads_enabled: true,
      })
    }

    return { data, error }
  }

  const planId = subscription?.plan || userProfile?.plan || PLAN_IDS.FREE
  const planInfo = getPlanById(planId)
  const adsEnabled = subscription?.ads_enabled ?? userProfile?.ads_enabled ?? true
  const trialEndsAt = subscription?.trial_ends_at || userProfile?.trial_ends_at || null
  const trialEndDate = trialEndsAt ? new Date(trialEndsAt) : null
  const isTrialActive = trialEndDate ? trialEndDate.getTime() > Date.now() : false
  const subscriptionStatus = subscription?.status || (isPaidPlan(planId) ? "active" : isTrialActive ? "trialing" : "inactive")
  const isPaid = isPaidPlan(planId) && subscriptionStatus === "active"
  const primaryPaidPlan = getPrimaryPaidPlan()

  const value = {
    user,
    userProfile,
    subscription,
    loading,
    initializing,
    plan: planId,
    planInfo,
    isPaid,
    isTrialActive,
    trialEndsAt,
    adsEnabled,
    upgradeToPlan,
    downgradeToFree,
    refreshSubscription,
    primaryPaidPlan,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
