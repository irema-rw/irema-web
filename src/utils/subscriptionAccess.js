const PLAN_RANK = { starter: 0, professional: 1, enterprise: 2 };

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return new Date(value);
}

function isPast(value, now) {
  const date = toDate(value);
  return date ? date < now : false;
}

export function canStartProfessionalTrial(subscription) {
  if (!subscription) return true;
  if (subscription.trialEndsAt || subscription.trialStarted || subscription.trialStartedAt) return false;
  if (subscription.status === 'active' && ['professional', 'enterprise'].includes(subscription.plan)) return false;
  if (subscription.status === 'pending' && ['professional', 'enterprise'].includes(subscription.plan)) return false;
  if (subscription.status === 'trial' && subscription.plan === 'professional') return false;
  return true;
}

export function selectBestSubscription(subscriptions = [], now = new Date(), company = {}) {
  if (!subscriptions.length) return null;

  if (company?.subscriptionId) {
    const linked = subscriptions.find(sub => sub.id === company.subscriptionId);
    if (linked) return linked;
  }

  const score = (subscription) => {
    const access = getSubscriptionAccess(subscription, now, company);
    const planScore = access.effectivePlan === 'enterprise' ? 300 : access.effectivePlan === 'professional' ? 200 : 100;
    const statusScore = subscription.status === 'active' ? 30 : subscription.status === 'trial' ? 20 : subscription.status === 'pending' ? 5 : 0;
    const lockPenalty = subscription.locked ? -500 : 0;
    const createdAt = subscription.createdAt?.toDate
      ? subscription.createdAt.toDate().getTime()
      : subscription.createdAt?.seconds
      ? subscription.createdAt.seconds * 1000
      : 0;
    return planScore + statusScore + lockPenalty + createdAt / 10000000000000;
  };

  return [...subscriptions].sort((a, b) => score(b) - score(a))[0];
}

export function getSubscriptionAccess(subscription, now = new Date(), company = {}) {
  const status = subscription?.status;
  const plan = subscription?.plan || 'starter';
  const isTrialExpired = status === 'trial' && isPast(subscription?.trialEndsAt, now);
  const isPaidExpired = status === 'active' && isPast(subscription?.nextBillingDate, now);
  const isExpired = status === 'expired' || isTrialExpired || isPaidExpired;
  const isCancelled = status === 'cancelled';
  const isLocked = subscription?.locked === true;
  const isAccessStatus = status === 'active' || status === 'trial';
  const isTrial = status === 'trial' && !isExpired;
  const isBlocked = isExpired || isCancelled || isLocked || !subscription || !isAccessStatus;

  const effectivePlan = isBlocked ? 'starter' : plan;
  const rank = PLAN_RANK[effectivePlan] || 0;

  let trialDaysLeft = null;
  if (status === 'trial' && subscription?.trialEndsAt) {
    const endDate = toDate(subscription.trialEndsAt);
    trialDaysLeft = endDate
      ? Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)))
      : null;
  }

  // Analytics level is now derived purely from the subscription plan.
  // No separate analyticsAccessLevel field needed on the subscription doc.
  // starter → free, professional → middle, enterprise → premium
  const analyticsAccessLevel =
    effectivePlan === 'enterprise' ? 'premium' :
    effectivePlan === 'professional' ? 'middle' : 'free';

  // Legacy fields — kept as constants so old call-sites don't break,
  // but trial is now just the standard plan trial (isTrial / trialDaysLeft).
  const isOnAnalyticsTrial = false;
  const analyticsTrialDaysLeft = 0;

  const planFeatureMap = {
    reply_reviews: rank >= 1,
    unlimited_replies: rank >= 1,
    analytics_advanced: rank >= 1,
    analytics_premium: rank >= 2,
    qr_code: rank >= 1,
    competitor_insights: rank >= 1,
    verified_badge: rank >= 1,
    multi_listing: rank >= 2,
    ai_sentiment: rank >= 2,
    api_access: rank >= 2,
    white_label: rank >= 2,
    priority_support: rank >= 1,
    company_stories: rank >= 1,
    product_listings: rank >= 2,
  };

  function hasAccess(feature) {
    if (isBlocked) return false;
    return Boolean(planFeatureMap[feature] || company?.enabledFeatures?.[feature]);
  }

  return {
    effectivePlan,
    isExpired,
    isCancelled,
    isLocked,
    isTrial,
    trialDaysLeft,
    analyticsAccessLevel,
    isOnAnalyticsTrial,
    analyticsTrialDaysLeft,
    hasAccess,
  };
}
