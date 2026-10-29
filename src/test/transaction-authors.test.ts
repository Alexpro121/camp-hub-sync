import { describe, expect, it } from 'vitest';
import { txActor, txMerchant, type IronTx } from '@/components/fair/TransactionDetailsDialog';

const transaction: IronTx = {
  id: '11111111-1111-4111-8111-111111111111',
  amount_change: 15,
  balance_after: 35,
  reason: 'Допомога команді',
  performed_by: 'Коваль Олена Іванівна (супровід)',
  created_at: '2026-10-29T14:10:00Z',
};

describe('transaction attribution', () => {
  it('retains the supervisor full name on credits independently of the reason', () => {
    expect(txActor(transaction)).toBe('Коваль Олена Іванівна (супровід)');
    expect(txMerchant(transaction)).toBe('Допомога команді');
  });
  it('retains the supervisor full name on debits too', () => {
    expect(txActor({ ...transaction, amount_change: -5 })).toBe('Коваль Олена Іванівна (супровід)');
  });
  it('does not invent a supervisor for historical entries without attribution', () => {
    expect(txActor({ ...transaction, performed_by: null })).toBe('Автор не збережений');
    expect(txActor({ ...transaction, performed_by: '  ' })).toBe('Автор не збережений');
  });
});