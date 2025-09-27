"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import PropTypes from "prop-types"
import {
  clearLoginTimestamp,
  createUserProfile,
  getCurrentUser,
  getStoredLoginTimestamp,
  getUserProfile,
  persistLoginTimestamp,
  supabase,
} from "../lib/supabase"
import { hasSessionExpired } from "../lib/session"

const AuthContext = createContext(undefined)

const SESSION_TIMEOUT_MS = 10000
const PROFILE_TIMEOUT_MS = 10000

const createTimeoutError = (message) => {
  const error = new Error(message)
  error.name = "TimeoutError"
  return error
}

const withProfileTimeout = (promise, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(createTimeoutError(message)), PROFILE_TIMEOUT_MS),
    ),
  ])

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
  const [loading, setLoading] = useState(true)
  const [initializing, setInitializing] = useState(true)
  const [status, setStatus] = useState("checking-session")

  const mountedRef = useRef(true)

  const safeSetState = useCallback((setter) => {
    if (!mountedRef.current) return
    setter()
  }, [])

  const applyProfile = useCallback(
    (profile) => {
      safeSetState(() => setUserProfile(profile))
    },
    [safeSetState],
  )

  const ensureProfile = useCallback(
    async (sessionUser) => {
      if (!sessionUser) {
        applyProfile(null)
        return
      }

      let shouldFinalize = true
      let finalizeStatus = "ready"

      try {
        setStatus("loading-profile")
        const { data, error } = await withProfileTimeout(
          getUserProfile(sessionUser.id),
          "Profile lookup timed out",
        )

        if (error && error.code === "PGRST116") {
          const fullName = sessionUser.user_metadata?.full_name || sessionUser.email
          const { data: newProfile, error: createError } = await withProfileTimeout(
            createUserProfile(sessionUser.id, sessionUser.email, fullName),
            "Profile creation timed out",
          )

          if (createError) {
            console.error("Error creating profile", createError)
            applyProfile(null)
            return
          }

          applyProfile(newProfile?.[0] || null)
          return
        }

        if (error) {
          console.error("Error loading profile", error)
          applyProfile(null)
          return
        }

        applyProfile(data)
      } catch (profileError) {
        if (profileError?.name === "TimeoutError") {
          console.warn(
            "Supabase did not respond in time while loading the profile. Falling back to signed-out state.",
            profileError,
          )
          applyProfile(null)
          safeSetState(() => setLoading(false))
          setStatus("profile-timeout")
          shouldFinalize = false
          finalizeStatus = "profile-timeout"
          return
        }

        console.error("Unexpected profile error", profileError)
        applyProfile(null)
      } finally {
        if (shouldFinalize) {
          safeSetState(() => setLoading(false))
          setStatus(finalizeStatus)
        }
      }
    },
    [applyProfile, safeSetState],
  )

  const handleSession = useCallback(
    async (sessionUser) => {
      safeSetState(() => setUser(sessionUser))
      if (sessionUser) {
        safeSetState(() => setLoading(true))
        await ensureProfile(sessionUser)
      } else {
        applyProfile(null)
        safeSetState(() => setLoading(false))
        setStatus("signed-out")
      }
    },
    [applyProfile, ensureProfile, safeSetState],
  )

  useEffect(() => {
    mountedRef.current = true

    const resolveInitialSession = async () => {
      try {
        setStatus("checking-session")
        const timestamp = getStoredLoginTimestamp()
        const hasStoredTimestamp = timestamp != null
        const sessionExpired = hasSessionExpired(timestamp)
        if (sessionExpired) {
          clearLoginTimestamp()
          if (hasStoredTimestamp) {
            try {
              await supabase.auth.signOut()
            } catch (signOutError) {
              console.warn(
                "Failed to clear Supabase session while expiring stored session",
                signOutError,
              )
            }
          }
          if (!mountedRef.current) return
          safeSetState(() => {
            setUser(null)
            setUserProfile(null)
            setLoading(false)
          })
          setStatus("signed-out")
          return
        }
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Session lookup timed out")), SESSION_TIMEOUT_MS),
        )
        const { user: sessionUser } = await Promise.race([getCurrentUser(), timeout])
        if (!mountedRef.current) return
        if (sessionUser) {
          persistLoginTimestamp()
        }
        await handleSession(sessionUser)
      } catch (error) {
        console.warn("Failed to resolve initial session", error)
        if (!mountedRef.current) return
        safeSetState(() => {
          setUser(null)
          setUserProfile(null)
          setLoading(false)
        })
        setStatus("signed-out")
      } finally {
        if (mountedRef.current) {
          setInitializing(false)
        }
      }
    }

    resolveInitialSession()

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN") {
        persistLoginTimestamp()
      }
      if (event === "SIGNED_OUT") {
        clearLoginTimestamp()
      }
      if (!mountedRef.current) return
      setStatus("auth-transition")
      await handleSession(session?.user ?? null)
    })

    return () => {
      mountedRef.current = false
      authListener.subscription.unsubscribe()
    }
  }, [handleSession, safeSetState])

  const value = useMemo(
    () => ({
      user,
      userProfile,
      loading,
      initializing,
      status,
      refreshProfile: async () => {
        if (!user) return null
        return ensureProfile(user)
      },
      setUserProfile: applyProfile,
    }),
    [user, userProfile, loading, initializing, status, ensureProfile, applyProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
}
