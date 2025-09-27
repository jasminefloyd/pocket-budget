import PropTypes from "prop-types"

const NAV_ITEMS = [
  { key: "home", label: "Home", icon: "🏠" },
  { key: "goals", label: "Goals", icon: "🎯" },
  { key: "reports", label: "Reports", icon: "📊" },
  { key: "settings", label: "Settings", icon: "⚙️" },
]

const keyToViewMode = {
  home: "budgets",
  goals: "goals",
  reports: "ai",
  settings: "settings",
}

const getActiveKey = (viewMode) => {
  if (!viewMode) return "home"

  switch (viewMode) {
    case "budgets":
    case "details":
    case "categories":
      return "home"
    case "goals":
      return "goals"
    case "ai":
    case "reports":
      return "reports"
    case "settings":
    case "profile":
      return "settings"
    default:
      return viewMode
  }
}

export default function Footer({ viewMode, setViewMode, onSelect }) {
  const activeKey = getActiveKey(viewMode)

  const handleSelect = (key) => {
    onSelect?.(key)

    if (setViewMode) {
      const nextView = keyToViewMode[key] || key
      setViewMode(nextView)
    }
  }

  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {NAV_ITEMS.map((item) => {
        const isActive = item.key === activeKey
        return (
          <button
            key={item.key}
            type="button"
            className={`bottom-nav__item${isActive ? " is-active" : ""}`}
            onClick={() => handleSelect(item.key)}
            aria-pressed={isActive}
          >
            <span className="bottom-nav__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="bottom-nav__label">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

Footer.propTypes = {
  viewMode: PropTypes.string,
  setViewMode: PropTypes.func,
  onSelect: PropTypes.func,
}

Footer.defaultProps = {
  viewMode: "budgets",
  setViewMode: undefined,
  onSelect: undefined,
}
