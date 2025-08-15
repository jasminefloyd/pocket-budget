import { useState } from "react"
import { signIn, signUp, signInWithGoogle } from "../lib/supabase-mock"

export default function LoginScreen() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleEmailAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      if (isSignUp) {
        if (password !== confirmPassword) {
          setError("Passwords do not match")
          setLoading(false)
          return
        }

        if (password.length < 6) {
          setError("Password must be at least 6 characters")
          setLoading(false)
          return
        }

        const { error } = await signUp(email, password)
        if (error) {
          setError(error.message)
        } else {
          setError("")
          alert("Account created successfully! You can now sign in.")
          setIsSignUp(false)
          setPassword("")
          setConfirmPassword("")
        }
      } else {
        const { error } = await signIn(email, password)
        if (error) {
          setError(error.message)
        }
      }
    } catch (error) {
      setError("An unexpected error occurred")
      console.error("Auth error:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleAuth = async () => {
    setLoading(true)
    setError("")

    try {
      const { error } = await signInWithGoogle()
      if (error) {
        setError(error.message)
      }
    } catch (error) {
      setError("Failed to sign in with Google")
      console.error("Google auth error:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-content">
        <div className="login-header">
          <h1 className="login-title">Pocket Budget</h1>
          <p className="login-subtitle">
            {isSignUp ? "Create your account to get started" : "Welcome back! Sign in to continue"}
          </p>
        </div>

        <div className="login-form-container">
          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleEmailAuth} className="login-form">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input login-input"
              required
              disabled={loading}
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input login-input"
              required
              disabled={loading}
              minLength={6}
            />

            {isSignUp && (
              <input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input login-input"
                required
                disabled={loading}
                minLength={6}
              />
            )}

            <button type="submit" className="primary-button login-button" disabled={loading}>
              {loading ? "Please wait..." : isSignUp ? "Create Account" : "Sign In"}
            </button>
          </form>

          <div className="login-divider">
            <span>or</span>
          </div>

          <button onClick={handleGoogleAuth} className="google-button" disabled={loading}>
            <svg className="google-icon" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="login-switch">
            <p>
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp)
                  setError("")
                  setEmail("")
                  setPassword("")
                  setConfirmPassword("")
                }}
                className="login-switch-button"
                disabled={loading}
              >
                {isSignUp ? "Sign In" : "Sign Up"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
