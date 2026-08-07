/** Long shifts travel more than once — every allocation belongs to one trip. */
export interface TripDef {
  number: number;
  name: string;
  short: string;
}

export const TRIPS: TripDef[] = [
  { number: 1, name: 'Подорож 1: Виїзд', short: 'Виїзд' },
  { number: 2, name: 'Подорож 2: Трансфер', short: 'Трансфер' },
  { number: 3, name: 'Подорож 3: Додому', short: 'Додому' },
];

export const tripName = (n: number): string =>
  TRIPS.find((t) => t.number === n)?.name ?? `Подорож ${n}`;

export const tripShort = (n: number): string =>
  TRIPS.find((t) => t.number === n)?.short ?? `Поїздка ${n}`;
