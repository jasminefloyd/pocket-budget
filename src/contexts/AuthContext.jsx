"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { supabase, getCurrentUser, createUserProfile, getUserProfile } from "../lib/supabase-mock"

const AuthContext = createContext({})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const { user: currentUser } = await getCurrentUser()
        setUser(currentUser)

        if (currentUser) {
          await loadUserProfile(currentUser.id)
        }
      } catch (error) {
        console.error("Error getting initial session:", error)
      } finally {
        setInitializing(false)
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed:", event, session?.user?.id)

      setUser(session?.user ?? null)

      if (session?.user) {
        await loadUserProfile(session.user.id)
      } else {
        setUserProfile(null)
      }

      setLoading(false)
    })

    return () => subscription.unsubscribe()
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
