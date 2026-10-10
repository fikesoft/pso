import { expect, it } from 'vitest';
import { distributeBill } from './distribute-bill';
import { decimalUnits } from '../../../shared/lib/money';
it('împarte egal cu rest determinist și conservă fiecare comandă a notei', () => {
  const result = distributeBill(
    [
      { orderId: 'b', amount: '10.01' },
      { orderId: 'a', amount: '10.01' },
    ],
    { mode: 'EQUAL', count: 3 },
  );
  expect(result).toEqual({
    total: '20.02',
    parts: [
      { position: 1, amount: '6.68', allocations: [{ orderId: 'a', amount: '6.68' }] },
      {
        position: 2,
        amount: '6.67',
        allocations: [
          { orderId: 'a', amount: '3.33' },
          { orderId: 'b', amount: '3.34' },
        ],
      },
      { position: 3, amount: '6.67', allocations: [{ orderId: 'b', amount: '6.67' }] },
    ],
  });
});
it('părțile personalizate păstrează ordinea și nu folosesc aritmetică float', () => {
  const result = distributeBill([{ orderId: 'a', amount: '90071992547409.93' }], {
    mode: 'CUSTOM',
    amounts: ['90071992547409.92', '0.01'],
  });
  expect(result.total).toBe('90071992547409.93');
  expect(result.parts.map((part) => part.amount)).toEqual(['90071992547409.92', '0.01']);
});
it('refuză părți zero, sume divergente, surse duplicate și precizie pierdută', () => {
  const source = [{ orderId: 'a', amount: '0.02' }];
  expect(() => distributeBill(source, { mode: 'EQUAL', count: 3 })).toThrow();
  expect(() => distributeBill(source, { mode: 'CUSTOM', amounts: ['0.01', '0.02'] })).toThrow();
  expect(() => distributeBill([...source, ...source], { mode: 'EQUAL', count: 2 })).toThrow();
  expect(() =>
    distributeBill([{ orderId: 'a', amount: '1.001' }], { mode: 'EQUAL', count: 2 }),
  ).toThrow();
  expect(() => distributeBill(source, { mode: 'EQUAL', count: 2.5 })).toThrow();
});
it('conservă totalul fiecărei surse și părți pentru valori și dimensiuni variate', () => {
  for (let count = 2; count <= 50; count++) {
    const sources = Array.from({ length: count + 1 }, (_, index) => ({
      orderId: String(index).padStart(3, '0'),
      amount: `${index + 1}.01`,
    }));
    const input = structuredClone(sources);
    const result = distributeBill(sources, { mode: 'EQUAL', count });
    const byOrder = new Map<string, bigint>();
    for (const part of result.parts) {
      let sum = 0n;
      for (const allocation of part.allocations) {
        const cents = decimalUnits(allocation.amount, 2);
        expect(cents > 0n).toBe(true);
        byOrder.set(allocation.orderId, (byOrder.get(allocation.orderId) ?? 0n) + cents);
        sum += cents;
      }
      expect(sum).toBe(decimalUnits(part.amount, 2));
    }
    for (const source of sources)
      expect(byOrder.get(source.orderId)).toBe(decimalUnits(source.amount, 2));
    expect(sources).toEqual(input);
    expect(distributeBill([...sources].reverse(), { mode: 'EQUAL', count })).toEqual(result);
  }
});

it('păstrează sursele gratuite fără a genera alocări financiare de valoare zero', () => {
  for (const orderId of ['a', 'c', 'e']) {
    const result = distributeBill(
      [
        { orderId: 'b', amount: '10.01' },
        { orderId, amount: '0.00' },
        { orderId: 'd', amount: '10.01' },
      ],
      { mode: 'EQUAL', count: 3 },
    );
    expect(result.total).toBe('20.02');
    expect(result.parts.map((part) => part.amount)).toEqual(['6.68', '6.67', '6.67']);
    expect(
      result.parts.flatMap((part) => part.allocations).some((row) => row.orderId === orderId),
    ).toBe(false);
  }
  expect(() =>
    distributeBill([{ orderId: 'free', amount: '0' }], { mode: 'EQUAL', count: 2 }),
  ).toThrow();
});
