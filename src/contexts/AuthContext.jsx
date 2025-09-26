"use client"

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import PropTypes from "prop-types"
import { supabase, getCurrentUser, createUserProfile, getUserProfile } from '../lib/supabase'

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
  const [loading, setLoading] = useState(true)
  const [initializing, setInitializing] = useState(true)
  const isMountedRef = useRef(true)

  const setUserProfileSafe = useCallback(
    (profile) => {
      if (isMountedRef.current) {
        setUserProfile(profile)
      }
    },
    [setUserProfile],
  )

  const loadUserProfile = useCallback(async (userId, sessionUser) => {
    try {
      const { data: profile, error } = await getUserProfile(userId)

      if (error && error.code === "PGRST116") {
        if (!sessionUser) {
          setUserProfileSafe(null)
          return
        }

        const { data: newProfile, error: createError } = await createUserProfile(
          sessionUser.id,
          sessionUser.email,
          sessionUser.user_metadata?.full_name || sessionUser.email,
        )

        if (createError) {
          console.error("Error creating user profile:", createError)
          setUserProfileSafe(null)
          return
        }

        setUserProfileSafe(newProfile?.[0] || null)
      } else if (!error) {
        setUserProfileSafe(profile)
      } else {
        console.error("Error loading user profile:", error)
        setUserProfileSafe(null)
      }
    } catch (error) {
      console.error("Error loading user profile:", error)
      // Don't block the app if profile loading fails
      setUserProfileSafe(null)
    }
  }, [setUserProfileSafe])

  useEffect(() => {
    isMountedRef.current = true

    // Get initial session with timeout
    const getInitialSession = async () => {
      try {
        // Add timeout to prevent infinite loading
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Session timeout")), 10000))

        const sessionPromise = getCurrentUser()

        const { user: currentUser } = await Promise.race([sessionPromise, timeoutPromise])

        if (!isMountedRef.current) return

        setUser(currentUser)

        if (currentUser) {
          setLoading(true)
          loadUserProfile(currentUser.id, currentUser).finally(() => {
            if (isMountedRef.current) {
              setLoading(false)
            }
          })
        } else {
          setUserProfileSafe(null)
          setLoading(false)
        }
      } catch (error) {
        console.error("Error getting initial session:", error)
        // Don't stay stuck - continue with no user
        if (isMountedRef.current) {
          setUser(null)
          setUserProfileSafe(null)
          setLoading(false)
        }
      } finally {
        if (isMountedRef.current) {
          setInitializing(false)
        }
      }
    }

    getInitialSession()

    // Listen for auth changes (both Supabase and demo)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMountedRef.current) return

      console.log("Auth state changed:", event, session?.user?.id)

      try {
        setUser(session?.user ?? null)

        if (session?.user) {
          setLoading(true)
          loadUserProfile(session.user.id, session.user)
            .catch((error) => {
              console.error("Error handling auth state change:", error)
            })
            .finally(() => {
              if (isMountedRef.current) {
                setLoading(false)
                setInitializing(false)
              }
            })
          return
        }

        setUserProfileSafe(null)
        if (isMountedRef.current) {
          setLoading(false)
          setInitializing(false)
        }
      } catch (error) {
        console.error("Error handling auth state change:", error)
        if (isMountedRef.current) {
          setLoading(false)
          setInitializing(false)
        }
      }
    })

    // Listen for demo auth changes
    const handleDemoAuthChange = async (event) => {
      if (!isMountedRef.current) return

      const { session, event: authEvent } = event.detail
      console.log("Demo auth state changed:", authEvent, session?.user?.id)

      try {
        setUser(session?.user ?? null)

        if (session?.user) {
          setLoading(true)
          loadUserProfile(session.user.id, session.user)
            .catch((error) => {
              console.error("Error handling demo auth state change:", error)
            })
            .finally(() => {
              if (isMountedRef.current) {
                setLoading(false)
                setInitializing(false)
              }
            })
          return
        }

        setUserProfileSafe(null)
        if (isMountedRef.current) {
          setLoading(false)
          setInitializing(false)
        }
      } catch (error) {
        console.error("Error handling demo auth state change:", error)
        if (isMountedRef.current) {
          setLoading(false)
          setInitializing(false)
        }
      }
    }

    window.addEventListener("demo-auth-change", handleDemoAuthChange)

    return () => {
      isMountedRef.current = false
      subscription.unsubscribe()
      window.removeEventListener("demo-auth-change", handleDemoAuthChange)
    }
  }, [loadUserProfile, setUserProfileSafe])

  const value = {
    user,
    userProfile,
    loading,
    initializing,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
}
