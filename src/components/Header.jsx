import PropTypes from "prop-types"
import { signOut } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"

const LeafIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
  </svg>
)

const SignOutIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16,17 21,12 16,7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)

export default function Header({ title, showLogout = false }) {
  const { user, userProfile } = useAuth()

  const handleSignOut = async () => {
    if (confirm("Are you sure you want to sign out?")) {
      await signOut()
    }
  }

  return (
    <div className="app-header">
      <div className="header-content">
        <div className="header-wordmark">
          <span className="header-wordmark-icon" aria-hidden="true">
            <LeafIcon />
          </span>
          <h1 className="header-title">{title}</h1>
        </div>
        {showLogout && user && (
          <div className="header-user">
            <span className="user-email">{userProfile?.full_name || user.email}</span>
            <button onClick={handleSignOut} className="logout-button" title="Sign out" aria-label="Sign out">
              <SignOutIcon />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

Header.propTypes = {
  title: PropTypes.string.isRequired,
  showLogout: PropTypes.bool,
}
