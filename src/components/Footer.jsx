export default function Footer({ activeView, onNavigate, onExitGoals, isPaidUser, planName }) {
  const handleBudgetsClick = () => {
    if (activeView === "goals" && typeof onExitGoals === "function") {
      onExitGoals()
      return
    }

    onNavigate?.("budgets")
  }

  return (
    <footer className="app-footer">
      <div className="footer-nav" role="tablist" aria-label="Quick navigation">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "budgets"}
          className={`footer-tab ${activeView === "budgets" ? "footer-tab-active" : ""}`}
          onClick={handleBudgetsClick}
        >
          Budgets
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "categories"}
          className={`footer-tab ${activeView === "categories" ? "footer-tab-active" : ""}`}
          onClick={() => onNavigate?.("categories")}
        >
          Categories
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "goals"}
          className={`footer-tab ${activeView === "goals" ? "footer-tab-active" : ""}`}
          onClick={() => onNavigate?.("goals")}
        >
          Goals
          {!isPaidUser && <span className="footer-tab-pill">Pro</span>}
        </button>
      </div>
      <p className="tagline">
        🏆 Greatness Magnified - Made with ❤️
        {!isPaidUser && planName && <span className="tagline-plan"> • Current plan: {planName}</span>}
      </p>
    </footer>
  )
}
