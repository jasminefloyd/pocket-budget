import { useEffect, useMemo, useState } from "react"
import { formatPlanPrice, getPrimaryPaidPlan } from "../lib/plans"

const formatCountdown = (targetDate) => {
  if (!targetDate) return ""
  const diff = targetDate.getTime() - Date.now()
  if (diff <= 0) {
    return "Ending soon"
  }

  const totalSeconds = Math.floor(diff / 1000)
  const days = Math.floor(totalSeconds / (60 * 60 * 24))
  const hours = Math.floor((totalSeconds % (60 * 60 * 24)) / (60 * 60))
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

export default function UpgradeBanner({
  variant = "trial",
  plan: planProp,
  trialEndsAt,
  isTrialActive = false,
  onUpgrade,
  onDismiss,
  secondaryAction,
  headline,
  message,
  className = "",
}) {
  const plan = useMemo(() => planProp ?? getPrimaryPaidPlan(), [planProp])
  const trialEndDate = trialEndsAt ? new Date(trialEndsAt) : null
  const [countdown, setCountdown] = useState(() => (trialEndDate ? formatCountdown(trialEndDate) : ""))

  useEffect(() => {
    if (variant !== "trial" || !trialEndDate) {
      return
    }

    setCountdown(formatCountdown(trialEndDate))
    const timer = setInterval(() => {
      setCountdown(formatCountdown(trialEndDate))
    }, 1000)

    return () => clearInterval(timer)
  }, [variant, trialEndDate])

  const eyebrowText = variant === "trial" ? "Pocket Plus trial" : plan?.name
  const defaultHeadline =
    headline ||
    (variant === "trial" ? "Enjoying Pocket Plus?" : `Unlock ${plan?.name ?? "premium"} features`)
  const defaultMessage =
    message ||
    (variant === "trial"
      ? "Upgrade before your trial ends to keep your AI insights and ad-free experience."
      : "Pocket Plus includes AI Finance Reports, ad-free budgeting, and more power features for serious planners.")
  const ctaLabel = variant === "trial" ? "Upgrade now" : `Upgrade to ${plan?.name ?? "Pocket Plus"}`
  const priceLabel = formatPlanPrice(plan)

  return (
    <div className={`upgrade-banner upgrade-banner--${variant} ${className}`.trim()}>
      <div className="upgrade-banner__content">
        <div className="upgrade-banner__header">
          <div className="upgrade-banner__eyebrow">{eyebrowText}</div>
          <h3 className="upgrade-banner__headline">{defaultHeadline}</h3>
          <p className="upgrade-banner__message">{defaultMessage}</p>
          <div className="upgrade-banner__price">{priceLabel}</div>
          {variant === "trial" && isTrialActive && countdown && (
            <div className="upgrade-countdown">
              Trial ends in <strong>{countdown}</strong>
            </div>
          )}
        </div>

        {plan?.features?.length ? (
          <ul className="upgrade-feature-list">
            {plan.features.map((feature) => (
              <li key={feature} className="upgrade-feature-item">
                <span className="upgrade-feature-icon">✨</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="upgrade-banner__actions">
          <button
            className="primary-button upgrade-banner__cta"
            onClick={onUpgrade}
            disabled={!onUpgrade}
            type="button"
          >
            {ctaLabel}
          </button>
          {secondaryAction ? (
            <button
              className="secondary-button upgrade-banner__secondary"
              onClick={secondaryAction.onClick}
              type="button"
            >
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      </div>

      {onDismiss ? (
        <button className="upgrade-banner__dismiss" onClick={onDismiss} aria-label="Dismiss upgrade notice" type="button">
          ✕
        </button>
      ) : null}
    </div>
  )
}
