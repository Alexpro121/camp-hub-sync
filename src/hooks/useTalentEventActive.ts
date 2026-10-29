/** Talent evening is disabled for every role; no queries or subscriptions. */
export const useTalentEventActive = () => ({
  active: false, isNew: false, markSeen: async () => {}, loading: false,
  error: null, data: false,
});