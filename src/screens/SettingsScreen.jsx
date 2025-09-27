import PropTypes from "prop-types"
import { signOut } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"

export default function SettingsScreen({ user, categories, onManageCategories }) {
  const { userProfile } = useAuth()

  const handleSignOut = async () => {
    if (confirm("Are you sure you want to sign out?")) {
      await signOut()
    }
  }

  const incomeCount = categories?.income?.length || 0
  const expenseCount = categories?.expense?.length || 0

  return (
    <div className="settings-screen">
      <section className="settings-section">
        <h2>Account</h2>
        <div className="settings-card">
          <p className="settings-name">{userProfile?.full_name || user?.email}</p>
          <p className="settings-email">{user?.email}</p>
          <button type="button" className="secondary-button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>Categories</h2>
        <div className="settings-card">
          <p className="settings-description">
            You have {incomeCount} income categories and {expenseCount} expense categories configured.
          </p>
          <button type="button" className="primary-button" onClick={onManageCategories}>
            Manage categories
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>About Pocket Budget</h2>
        <div className="settings-card">
          <p>Version 1.0 — all features are unlocked for every account.</p>
          <p>
            Need help or have feedback? Reach out at <a href="mailto:support@pocketbudget.app">support@pocketbudget.app</a>.
          </p>
        </div>
      </section>
    </div>
  )
}

SettingsScreen.propTypes = {
  user: PropTypes.shape({
    email: PropTypes.string,
  }),
  categories: PropTypes.shape({
    income: PropTypes.array,
    expense: PropTypes.array,
  }),
  onManageCategories: PropTypes.func,
}

SettingsScreen.defaultProps = {
  user: null,
  categories: { income: [], expense: [] },
  onManageCategories: undefined,
}
