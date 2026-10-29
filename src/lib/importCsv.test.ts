import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { matrixFromCsv, matrixFromRawText } from '@/lib/importer';

describe('CSV / сирий текст', () => {
  it('лапки, коми та переноси всередині клітинки', () => {
    const m = matrixFromCsv('ПІБ,Примітка\n"Іваненко Олексій","алергія, горіхи\nне давати"\nКоваль Марія,ок\n');
    expect(m[1]).toEqual(['Іваненко Олексій', 'алергія, горіхи\nне давати']);
    expect(m[2]).toEqual(['Коваль Марія', 'ок']);
  });
  it('роздільник «;» (український Excel)', () => {
    const m = matrixFromCsv('ПІБ;Команда;Телефон\nІваненко Олексій;3;0671234567\n');
    expect(m[1]).toEqual(['Іваненко Олексій', '3', '0671234567']);
  });
  it('BOM на початку не ламає перший заголовок', () => {
    const m = matrixFromCsv('﻿ПІБ,Команда\nІваненко Олексій,1\n');
    expect(m[0][0]).toBe('ПІБ');
  });
  it('Windows-переноси рядків', () => {
    expect(matrixFromCsv('ПІБ,Команда\r\nІваненко Олексій,1\r\nКоваль Марія,2\r\n')).toHaveLength(3);
  });
  it('сирий текст із табуляціями', () => {
    const m = matrixFromRawText('ПІБ\tКоманда\nІваненко Олексій\t1');
    expect(m[1]).toEqual(['Іваненко Олексій', '1']);
  });
});
