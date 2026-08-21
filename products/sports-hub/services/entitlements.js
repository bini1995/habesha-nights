const TIERS = Object.freeze({ FREE: "FREE", PREMIUM: "PREMIUM" });

function createEntitlementService({ resolveTier = async () => TIERS.FREE } = {}) {
  async function getEntitlement(profileId = "default") {
    const tier = String(await resolveTier(profileId)).toUpperCase();
    if (!Object.values(TIERS).includes(tier)) throw new Error("Entitlement provider returned an unsupported tier.");
    return Object.freeze({ profileId, tier, recommendationLimit: tier === TIERS.FREE ? 2 : null });
  }
  function applyRecommendationEntitlement(recommendations, entitlement) {
    const visible = entitlement.recommendationLimit === null ? recommendations : recommendations.slice(0, entitlement.recommendationLimit);
    return Object.freeze({
      tier: entitlement.tier,
      recommendations: visible,
      lockedRecommendationCount: Math.max(0, recommendations.length - visible.length)
    });
  }
  return { applyRecommendationEntitlement, getEntitlement };
}

module.exports = { TIERS, createEntitlementService };
