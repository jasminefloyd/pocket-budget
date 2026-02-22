import PropTypes from "prop-types"

/* Inline SVG icons — no external dependency */
const HomeIcon = ({ filled }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={filled ? 0 : 1.75} strokeLinecap="round" strokeLinejoin="round">
    {filled ? (
      <path fill="currentColor" d="M11.47 3.84a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 1-1.06 1.06l-.69-.68V19.5a1.5 1.5 0 0 1-1.5 1.5h-3a.75.75 0 0 1-.75-.75V16.5a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0-.75.75v3.75A.75.75 0 0 1 9.75 21h-3a1.5 1.5 0 0 1-1.5-1.5V12.91l-.69.68a.75.75 0 0 1-1.06-1.06l8.69-8.69Z" />
    ) : (
      <>
        <path d="M3 12l9-9 9 9" />
        <path d="M9 21V12h6v9" />
        <path d="M5 10.5V21h14V10.5" />
      </>
    )}
  </svg>
)

const TargetIcon = ({ filled }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.12 : 0} />
    <circle cx="12" cy="12" r="6" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.2 : 0} />
    <circle cx="12" cy="12" r="2" fill={filled ? "currentColor" : "none"} />
  </svg>
)

const ChartIcon = ({ filled }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="12" width="4" height="9" rx="1" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 1.75} />
    <rect x="10" y="7" width="4" height="14" rx="1" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 1.75} />
    <rect x="17" y="3" width="4" height="18" rx="1" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 1.75} />
  </svg>
)

const SettingsIcon = ({ filled }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" fill={filled ? "currentColor" : "none"} />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.18 : 0} />
  </svg>
)

const NAV_ITEMS = [
  { key: "home",     label: "Home",     Icon: HomeIcon },
  { key: "goals",    label: "Goals",    Icon: TargetIcon },
  { key: "reports",  label: "Reports",  Icon: ChartIcon },
  { key: "settings", label: "Settings", Icon: SettingsIcon },
]

const keyToViewMode = {
  home: "budgets",
  goals: "goals",
  reports: "reports",
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
      setViewMode(keyToViewMode[key] || key)
    }
  }

  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {NAV_ITEMS.map(({ key, label, Icon }) => {
        const isActive = key === activeKey
        return (
          <button
            key={key}
            type="button"
            className={`bottom-nav__item${isActive ? " is-active" : ""}`}
            onClick={() => handleSelect(key)}
            aria-pressed={isActive}
            aria-label={label}
          >
            <span className="bottom-nav__icon" aria-hidden="true">
              <Icon filled={isActive} />
            </span>
            <span className="bottom-nav__label">{label}</span>
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
