import type { ShiftType } from '@/types/app';

export const SHIFT_LABELS: Record<ShiftType, string> = {
  long: 'Довга (12 днів)',
  short: 'Коротка (5 днів)',
  international: 'Міжнародна',
  sports: 'Спортивна зміна',
};

// Словник коротких, позитивних українських слів
const MEMORABLE_UKR_WORDS = [
  'потяг', 'рейка', 'вагон', 'шлях', 'колія', 'ранок', 'вечір',
  'сокіл', 'гори', 'ліс', 'плай', 'рута', 'зірка', 'озеро',
  'стежка', 'сонце', 'бук', 'вогонь', 'вітер', 'небо', 'карпати',
  'залізниця', 'клуб', 'хвиля', 'квітка', 'явір', 'ялина', 'стріла',
  'буковель', 'локомотив', 'пісня', 'друзі', 'сила', 'мрія',
  'світло', 'крила', 'крок', 'драйв', 'іскра', 'сміливість', 'світан'
];

/** Генерація пароля з 2 коротких українських слів у нижньому регістрі через крапку */
export const generateMemorablePassword = (): string => {
  const w1 = MEMORABLE_UKR_WORDS[Math.floor(Math.random() * MEMORABLE_UKR_WORDS.length)];
  let w2 = MEMORABLE_UKR_WORDS[Math.floor(Math.random() * MEMORABLE_UKR_WORDS.length)];
  while (w2 === w1) {
    w2 = MEMORABLE_UKR_WORDS[Math.floor(Math.random() * MEMORABLE_UKR_WORDS.length)];
  }
  return `${w1}.${w2}`;
};
