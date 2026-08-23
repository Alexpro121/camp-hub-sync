/**
 * Train allocation is a single static assignment per shift — a child keeps the
 * same coupe/seat on the way to camp and back. `SINGLE_TRIP` is the only trip
 * number ever written to `train_coupes` / `coupe_swap_requests`.
 */
export const SINGLE_TRIP = 1;

export const TRAIN_TITLE = 'Потяг (Розселення по купе)';

export const tripName = (_n: number = SINGLE_TRIP): string => TRAIN_TITLE;

/**
 * Тимчасовий вимикач усього функціоналу «Потяг / Розселення по купе».
 * false — розділи, вкладки, картки й тур-крок приховані (код збережено).
 */
export const TRAIN_FEATURE_ENABLED = false;
