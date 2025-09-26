export const PLAN_IDS = {
  FREE: "free",
  PLUS: "plus",
}

export const TRIAL_PERIOD_DAYS = 7

export const PLANS = {
  [PLAN_IDS.FREE]: {
    id: PLAN_IDS.FREE,
    name: "Pocket Free",
    price: 0,
    priceLabel: "Free",
    description: "Great for getting started with budgeting basics.",
    features: [
      "Unlimited budgets",
      "Manual transaction tracking",
      "Custom categories",
    ],
  },
  [PLAN_IDS.PLUS]: {
    id: PLAN_IDS.PLUS,
    name: "Pocket Plus",
    price: 9,
    priceLabel: "$9/mo",
    description: "Unlock AI-powered insights and an ad-free experience.",
    features: [
      "AI Finance Reports",
      "Ad-free experience",
      "Priority email support",
    ],
  },
}

export const FEATURE_ACCESS = {
  aiInsights: PLAN_IDS.PLUS,
}

export const PRIMARY_PAID_PLAN_ID = PLAN_IDS.PLUS

export const getPlanById = (planId) => PLANS[planId] ?? PLANS[PLAN_IDS.FREE]

export const getPrimaryPaidPlan = () => PLANS[PRIMARY_PAID_PLAN_ID]

export const isPaidPlan = (planId) => planId && planId !== PLAN_IDS.FREE

export const formatPlanPrice = (plan) => {
  if (!plan) return ""
  if (!plan.price || plan.price === 0) {
    return "Free"
  }
  return plan.priceLabel ?? `$${plan.price}/mo`
}

export const calculateTrialEndDate = (start = new Date()) => {
  const end = new Date(start)
  end.setDate(end.getDate() + TRIAL_PERIOD_DAYS)
  return end
}
