"use client"

import { createContext, useContext, useEffect, useState } from "react"
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
      const { data: profile, error } = await getUserProfile(userId)

      if (error && error.code === "PGRST116") {
        // Profile doesn't exist, create it
        const user = await getCurrentUser()
        if (user.user) {
          const { data: newProfile } = await createUserProfile(
            user.user.id,
            user.user.email,
            user.user.user_metadata?.full_name || user.user.email,
          )
          setUserProfile(newProfile?.[0] || null)
        }
      } else if (!error) {
        setUserProfile(profile)
      }
    } catch (error) {
      console.error("Error loading user profile:", error)
      // Don't block the app if profile loading fails
      setUserProfile(null)
    }
  }

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
