export const clonePreferencesState = (preferences) => {
  if (!preferences) return {}
  try {
    return JSON.parse(JSON.stringify(preferences))
  } catch (error) {
    console.warn("Failed to clone preferences state", error)
    return preferences
  }
}

const revertPreferencesState = (pendingRef, requestToken, setPreferencesState) => {
  if (!pendingRef?.current || pendingRef.current.token !== requestToken) return
  const { previous } = pendingRef.current
  pendingRef.current = null
  setPreferencesState(previous)
}

export const persistPreferencesUpdate = async ({
  userId,
  updater,
  getCurrentPreferences,
  setPreferencesState,
  setPreferencesStatus,
  setPreferencesError,
  setUtilityStatus,
  updateUserProfileFn,
  setUserProfile,
  refreshProfile,
  pendingRef,
}) => {
  if (!userId) {
    return { success: false, reason: "missing-user" }
  }

  setPreferencesStatus?.("saving")
  setPreferencesError?.(null)
  setUtilityStatus?.(null)

  const currentPreferences = getCurrentPreferences?.() ?? {}
  const previousPreferences = clonePreferencesState(currentPreferences)
  const baseForUpdate = clonePreferencesState(previousPreferences)
  const nextPreferences =
    typeof updater === "function" ? updater(baseForUpdate) : updater

  const requestToken = Symbol("preferences-update")
  if (pendingRef) {
    pendingRef.current = { token: requestToken, previous: previousPreferences }
  }

  setPreferencesState(nextPreferences)

  try {
    const { data, error } = await updateUserProfileFn(userId, {
      preferences: nextPreferences,
    })
    if (error) {
      const message = error.message || "Unable to save preferences"
      setPreferencesError?.(message)
      setPreferencesStatus?.("error")
      revertPreferencesState(pendingRef, requestToken, setPreferencesState)
      return { success: false, reason: "api-error", message }
    }

    if (data) {
      setUserProfile?.(data)
    } else {
      await refreshProfile?.()
    }

    if (pendingRef?.current && pendingRef.current.token === requestToken) {
      pendingRef.current = null
    }

    setPreferencesStatus?.("saved")
    return { success: true }
  } catch (error) {
    const message = error.message || "Unexpected error saving preferences"
    console.error("Failed to update preferences", error)
    setPreferencesError?.(message)
    setPreferencesStatus?.("error")
    revertPreferencesState(pendingRef, requestToken, setPreferencesState)
    return { success: false, reason: "exception", message }
  }
}
