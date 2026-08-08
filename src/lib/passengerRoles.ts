/** Passenger roles inside a train coupe. */
export type PassengerRole = 'participant' | 'supervisor' | 'speaker' | 'admin';

export const PASSENGER_ROLES: { value: PassengerRole; label: string; dot: string; badge: string }[] = [
  { value: 'participant', label: 'Учасник', dot: '🔵', badge: 'bg-slate-800 text-slate-300 border-slate-700' },
  { value: 'supervisor', label: 'Супровід', dot: '🟠', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { value: 'speaker', label: 'Спікер', dot: '🟣', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  { value: 'admin', label: 'Адміністрація', dot: '🔴', badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
];

export function roleMeta(role?: string | null) {
  return PASSENGER_ROLES.find((r) => r.value === role) ?? PASSENGER_ROLES[0];
}

/** Guess the role from keywords inside the passenger name / source line. */
export function detectPassengerRole(rawName: string): PassengerRole {
  const s = String(rawName || '').toLowerCase();
  if (/(спікер|спикер|гість|гости|гост)/.test(s)) return 'speaker';
  if (/(адмін|админ|док\b|док |керівник|директор)/.test(s)) return 'admin';
  if (/(супровід|супровод|вожат|каченя|педагог|лідер)/.test(s)) return 'supervisor';
  return 'participant';
}

/** Realtime channel used to sync role badges across open devices. */
export const PASSENGER_ROLE_CHANNEL = 'train-passenger-roles';
