import { useEffect, useState } from "react"
import PropTypes from "prop-types"

const DEFAULT_HEIGHT = 140

export default function AdSlot({ placement, minHeight = DEFAULT_HEIGHT, headline, body }) {
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 160)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      className="ad-slot"
      style={{ minHeight }}
      data-ad-placement={placement}
      data-ad-loaded={isLoaded}
      role="complementary"
      aria-label="Sponsored message"
    >
      <div className={`ad-slot-inner${isLoaded ? " is-loaded" : ""}`}>
        <span className="ad-slot-label">Sponsored</span>
        <div className="ad-slot-copy">
          <strong>{headline}</strong>
          <p>{body}</p>
        </div>
      </div>
    </div>
  )
}

AdSlot.propTypes = {
  placement: PropTypes.string.isRequired,
  minHeight: PropTypes.number,
  headline: PropTypes.string,
  body: PropTypes.string,
}

AdSlot.defaultProps = {
  minHeight: DEFAULT_HEIGHT,
  headline: "Boost your savings with Rate Rocket",
  body: "Earn 4.1% APY on balances over $500 and automate weekly transfers in seconds.",
}
