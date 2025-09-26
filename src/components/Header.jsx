import PropTypes from "prop-types"
import { signOut } from "../lib/supabase-mock"
import { useAuth } from "../contexts/AuthContext"

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
        <h1 className="header-title">{title}</h1>
        {showLogout && user && (
          <div className="header-user">
            <span className="user-email">{userProfile?.full_name || user.email}</span>
            <button onClick={handleSignOut} className="logout-button" title="Sign out">
              🚪
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
