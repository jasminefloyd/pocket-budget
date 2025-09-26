import { useEffect, useMemo, useRef, useState } from "react"
import {
  fetchSponsoredCreative,
  recordAdClick,
  recordAdImpression,
} from "../lib/supabase"

const MOCK_CREATIVES = [
  {
    id: "mock-cashback",
    title: "Earn 3% Cashback",
    description: "Open a NovaCard account and get 3% back on groceries this month.",
    cta: "Learn more",
    url: "https://example.com/novacard",
    advertiser: "NovaCard",
    image: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "mock-savings",
    title: "Boost Your Savings",
    description: "Move spare change into a 4.5% APY vault automatically with Sprout.",
    cta: "Start saving",
    url: "https://example.com/sprout",
    advertiser: "Sprout Savings",
    image: "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "mock-budget",
    title: "Tackle Debt Faster",
    description: "Consolidate balances into one low-interest payment with Clarity.",
    cta: "Check your rate",
    url: "https://example.com/clarity",
    advertiser: "Clarity Finance",
    image: "https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=900&q=80",
  },
]

const getFallbackCreative = () => {
  const index = Math.floor(Math.random() * MOCK_CREATIVES.length)
  return MOCK_CREATIVES[index]
}

export default function SponsoredCard({
  placement = "global",
  userId,
  adsEnabled = true,
  isPaid = false,
  className = "",
}) {
  const [creative, setCreative] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasRecordedImpression, setHasRecordedImpression] = useState(false)
  const cardRef = useRef(null)

  const fallbackCreative = useMemo(() => getFallbackCreative(), [])

  useEffect(() => {
    setHasRecordedImpression(false)
  }, [creative?.id])

  useEffect(() => {
    let isMounted = true

    if (!adsEnabled || isPaid) {
      setCreative(null)
      setLoading(false)
      setError(null)
      return () => {
        isMounted = false
      }
    }

    const loadCreative = async () => {
      setLoading(true)
      setError(null)

      try {
        const { data } = await fetchSponsoredCreative(placement)
        if (!isMounted) return
        setCreative(data ?? fallbackCreative)
      } catch (err) {
        if (!isMounted) return
        console.error(err)
        setCreative(fallbackCreative)
        setError(err)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadCreative()

    return () => {
      isMounted = false
    }
  }, [adsEnabled, fallbackCreative, isPaid, placement])

  useEffect(() => {
    if (!creative || !adsEnabled || isPaid || hasRecordedImpression) return

    const element = cardRef.current
    if (!element) return

    if (typeof IntersectionObserver === "undefined") {
      recordAdImpression({
        creativeId: creative.id,
        placement,
        userId,
      })
        .catch((err) => console.error("Error recording ad impression:", err))
        .finally(() => setHasRecordedImpression(true))
      return
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach(async (entry) => {
          if (entry.isIntersecting) {
            await recordAdImpression({
              creativeId: creative.id,
              placement,
              userId,
            })
            setHasRecordedImpression(true)
            obs.disconnect()
          }
        })
      },
      { threshold: 0.5 },
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [adsEnabled, creative, hasRecordedImpression, isPaid, placement, userId])

  const handleClick = async () => {
    if (!creative || !creative.url) return
    await recordAdClick({
      creativeId: creative.id,
      placement,
      userId,
    })
    window.open(creative.url, "_blank", "noopener,noreferrer")
  }

  if (isPaid) {
    return (
      <div ref={cardRef} className={`sponsored-card ad-free ${className}`}>
        <div className="sponsored-card__content">
          <span className="sponsored-card__badge">Ad-free</span>
          <h3 className="sponsored-card__title">Thanks for supporting Pocket Budget Pro!</h3>
          <p className="sponsored-card__description">
            Enjoy an uninterrupted experience and exclusive insights as a paid subscriber.
          </p>
        </div>
      </div>
    )
  }

  if (!adsEnabled) {
    return null
  }

  return (
    <div ref={cardRef} className={`sponsored-card ${className}`}>
      {loading && (
        <div className="sponsored-card__skeleton" aria-hidden="true">
          <div className="sponsored-card__image" />
          <div className="sponsored-card__text" />
        </div>
      )}

      {!loading && creative && (
        <button type="button" className="sponsored-card__content" onClick={handleClick}>
          {creative.image && (
            <div className="sponsored-card__image" style={{ backgroundImage: `url(${creative.image})` }} />
          )}
          <div className="sponsored-card__body">
            <span className="sponsored-card__badge">Sponsored</span>
            <h3 className="sponsored-card__title">{creative.title}</h3>
            <p className="sponsored-card__description">{creative.description}</p>
            <span className="sponsored-card__cta">{creative.cta}</span>
          </div>
        </button>
      )}

      {!loading && !creative && !error && (
        <div className="sponsored-card__fallback">
          <span className="sponsored-card__badge">Sponsored</span>
          <p className="sponsored-card__description">New offers are on their way. Check back soon!</p>
        </div>
      )}

      {error && !creative && (
        <div className="sponsored-card__fallback" role="status">
          <span className="sponsored-card__badge">Sponsored</span>
          <p className="sponsored-card__description">We had trouble loading this ad. Please try again later.</p>
        </div>
      )}
    </div>
  )
}
