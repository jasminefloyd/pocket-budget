"use client"

import { useState, useEffect } from "react"

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault()
      // Stash the event so it can be triggered later
      setDeferredPrompt(e)
      setShowInstallPrompt(true)
    }

    window.addEventListener("beforeinstallprompt", handler)

    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return

    // Show the install prompt
    deferredPrompt.prompt()

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === "accepted") {
      console.log("User accepted the install prompt")
    } else {
      console.log("User dismissed the install prompt")
    }

    // Clear the deferredPrompt
    setDeferredPrompt(null)
    setShowInstallPrompt(false)
  }

  const handleDismiss = () => {
    setShowInstallPrompt(false)
    // Hide for 7 days
    localStorage.setItem("installPromptDismissed", Date.now() + 7 * 24 * 60 * 60 * 1000)
  }

  // Check if user previously dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem("installPromptDismissed")
    if (dismissed && Date.now() < Number.parseInt(dismissed)) {
      setShowInstallPrompt(false)
    }
  }, [])

  // Don't show if already installed
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true

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
