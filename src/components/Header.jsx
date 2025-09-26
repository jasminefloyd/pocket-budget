import { signOut } from "../lib/supabase-mock"
import { useAuth } from "../contexts/AuthContext"

const VIEW_LABELS = {
  budgets: "Budgets",
  categories: "Categories",
  details: "Budget",
  ai: "AI Report",
  goals: "Goals",
}

export default function Header({
  title,
  showLogout = false,
  activeView,
  onNavigate,
  onExitGoals,
  isPaidUser,
  planName,
}) {
  const { user, userProfile } = useAuth()

  const handleSignOut = async () => {
    if (confirm("Are you sure you want to sign out?")) {
      await signOut()
    }
  }

  const handleNavigate = (target) => {
    if (!onNavigate) return

    if (activeView === "goals" && target === "budgets" && typeof onExitGoals === "function") {
      onExitGoals()
      return
    }

    onNavigate(target)
  }

  const planBadge = !isPaidUser ? "Pro" : null

  return (
    <div className="app-header">
      <div className="header-content">
        <div>
          <h1 className="header-title">{title}</h1>
          {planBadge && (
            <div className="header-plan-pill" aria-live="polite">
              Goals are a {planBadge} feature • Current plan: {planName || "Free"}
            </div>
          )}
        </div>
        {showLogout && user && (
          <div className="header-user">
            <span className="user-email">{userProfile?.full_name || user.email}</span>
            <button onClick={handleSignOut} className="logout-button" title="Sign out">
              🚪
            </button>
          </div>
        )}
      </div>
      {onNavigate && (
        <div className="header-tabs" role="tablist" aria-label="Main navigation">
          {[
            { id: "budgets", label: "Budgets" },
            { id: "categories", label: "Categories" },
            { id: "goals", label: "Goals" },
          ].map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeView === tab.id}
              className={`header-tab ${activeView === tab.id ? "header-tab-active" : ""}`}
              onClick={() => handleNavigate(tab.id)}
            >
              {tab.label}
              {tab.id === "goals" && !isPaidUser && <span className="header-tab-pill">Pro</span>}
            </button>
          ))}
          {activeView === "details" && (
            <span className="header-tab breadcrumb-pill">{VIEW_LABELS[activeView]}</span>
          )}
          {activeView === "ai" && <span className="header-tab breadcrumb-pill">{VIEW_LABELS[activeView]}</span>}
        </div>
      )}
    </div>
  )
}
