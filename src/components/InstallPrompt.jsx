import { useEffect, useState } from "react"

const DISMISS_STORAGE_KEY = "installPromptDismissedUntil"
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000

const getStandaloneStatus = () => {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true
  )
}

const storeDismissUntil = () => {
  const hideUntil = Date.now() + DISMISS_DURATION_MS
  localStorage.setItem(DISMISS_STORAGE_KEY, hideUntil.toString())
  return hideUntil
}

const hasActiveDismissal = () => {
  const storedValue = localStorage.getItem(DISMISS_STORAGE_KEY)
  if (!storedValue) return false
  const dismissedUntil = Number.parseInt(storedValue, 10)
  return Number.isFinite(dismissedUntil) && Date.now() < dismissedUntil
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [isStandalone, setIsStandalone] = useState(() => getStandaloneStatus())

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()

      if (isStandalone || hasActiveDismissal()) {
        setDeferredPrompt(null)
        setShowInstallPrompt(false)
        return
      }

      setDeferredPrompt(event)
      setShowInstallPrompt(true)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)

    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
  }, [isStandalone])

  useEffect(() => {
    const handleAppInstalled = () => {
      setIsStandalone(true)
      setShowInstallPrompt(false)
      setDeferredPrompt(null)
    }

    const mediaQuery = window.matchMedia("(display-mode: standalone)")
    const handleMediaChange = () => {
      const standalone = getStandaloneStatus()
      setIsStandalone(standalone)
      if (standalone) {
        setShowInstallPrompt(false)
        setDeferredPrompt(null)
      }
    }

    handleMediaChange()

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleMediaChange)
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(handleMediaChange)
    }

    window.addEventListener("appinstalled", handleAppInstalled)

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", handleMediaChange)
      } else if (typeof mediaQuery.removeListener === "function") {
        mediaQuery.removeListener(handleMediaChange)
      }
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    setDeferredPrompt(null)
    setShowInstallPrompt(false)

    if (outcome === "accepted") {
      console.log("User accepted the install prompt")
    } else {
      console.log("User dismissed the install prompt")
      storeDismissUntil()
    }
  }

  const handleDismiss = () => {
    setShowInstallPrompt(false)
    setDeferredPrompt(null)
    storeDismissUntil()
  }

  if (!showInstallPrompt || isStandalone) {
    return null
  }

  return (
    <div className="install-prompt">
      <div className="install-prompt-content">
        <div className="install-prompt-icon">📱</div>
        <div className="install-prompt-text">
          <h3>Install Pocket Budget</h3>
          <p>Add to your home screen for a better experience!</p>
        </div>
        <div className="install-prompt-actions">
          <button onClick={handleInstallClick} className="install-button">
            Install
          </button>
          <button onClick={handleDismiss} className="dismiss-button">
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
