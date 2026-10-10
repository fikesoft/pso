import { expect, it } from 'vitest';
import { decimalString, decimalUnits } from '../../../shared/lib/money';
import { distributeBillItems } from './distribute-bill-items';
import type { BillItemSource } from './bill-items.types';

it('alocă articolele originale din mai multe comenzi, inclusiv articole gratuite', () => {
  const sources: BillItemSource[] = [
    { orderId: 'b', orderItemId: 'meal', quantity: '2.000', amount: '30.01' },
    { orderId: 'a', orderItemId: 'drink', quantity: '1.000', amount: '5.00' },
    { orderId: 'b', orderItemId: 'gift', quantity: '1.000', amount: '0.00' },
  ];
  const result = distributeBillItems(sources, {
    mode: 'ITEMS',
    parts: [
      { items: [{ orderItemId: 'meal', quantity: '1' }] },
      {
        items: [
          { orderItemId: 'meal', quantity: '1' },
          { orderItemId: 'drink', quantity: '1' },
          { orderItemId: 'gift', quantity: '1' },
        ],
      },
    ],
  });
  expect(result.total).toBe('35.01');
  expect(result.parts.map((part) => part.amount)).toEqual(['15.01', '20.00']);
  expect(result.parts[1]!.allocations).toEqual([
    { orderId: 'a', amount: '5.00' },
    { orderId: 'b', amount: '15.00' },
  ]);
  expect(result.parts[1]!.items.find((item) => item.orderItemId === 'gift')).toEqual(sources[2]);
});

it('distribuie centul către restul cel mai mare, nu automat către prima parte', () => {
  const result = distributeBillItems(
    [{ orderId: 'o', orderItemId: 'i', quantity: '1', amount: '0.05' }],
    {
      mode: 'ITEMS',
      parts: [
        { items: [{ orderItemId: 'i', quantity: '0.300' }] },
        { items: [{ orderItemId: 'i', quantity: '0.350' }] },
        { items: [{ orderItemId: 'i', quantity: '0.350' }] },
      ],
    },
  );
  expect(result.parts.map((part) => part.amount)).toEqual(['0.01', '0.02', '0.02']);
});

it('păstrează precizia pentru valori peste limita sigură Number', () => {
  const result = distributeBillItems(
    [
      {
        orderId: 'o',
        orderItemId: 'i',
        quantity: '999999999999999.999',
        amount: '9999999999999999.99',
      },
    ],
    {
      mode: 'ITEMS',
      parts: [
        { items: [{ orderItemId: 'i', quantity: '999999999999999.998' }] },
        { items: [{ orderItemId: 'i', quantity: '0.001' }] },
      ],
    },
  );
  expect(result.parts.map((part) => part.amount)).toEqual(['9999999999999999.98', '0.01']);
});

it('refuză pierderea cantităților, supra-alocarea, sursele străine și duplicatele', () => {
  const sources = [{ orderId: 'o', orderItemId: 'i', quantity: '1', amount: '1.00' }];
  for (const quantity of ['0.4', '0.6', '0', '-1', '0.5001', '1000000000000000'])
    expect(() =>
      distributeBillItems(sources, {
        mode: 'ITEMS',
        parts: [
          { items: [{ orderItemId: 'i', quantity }] },
          { items: [{ orderItemId: 'i', quantity: '0.5' }] },
        ],
      }),
    ).toThrow();
  for (const items of [
    [{ orderItemId: 'foreign', quantity: '0.5' }],
    [
      { orderItemId: 'i', quantity: '0.25' },
      { orderItemId: 'i', quantity: '0.25' },
    ],
  ])
    expect(() =>
      distributeBillItems(sources, {
        mode: 'ITEMS',
        parts: [{ items }, { items: [{ orderItemId: 'i', quantity: '0.5' }] }],
      }),
    ).toThrow();
  expect(() =>
    distributeBillItems([...sources, ...sources], { mode: 'ITEMS', parts: [] }),
  ).toThrow();
});

it('refuză părțile fără bani și valorile în afara preciziei bazei de date', () => {
  for (const amount of ['0', '0.01', '1.001', '10000000000000000'])
    expect(() =>
      distributeBillItems([{ orderId: 'o', orderItemId: 'i', quantity: '1', amount }], {
        mode: 'ITEMS',
        parts: [
          { items: [{ orderItemId: 'i', quantity: '0.5' }] },
          { items: [{ orderItemId: 'i', quantity: '0.5' }] },
        ],
      }),
    ).toThrow();
});

it('conservă fiecare cantitate și fiecare cent, independent de ordinea surselor', () => {
  for (let count = 2; count <= 50; count++) {
    const sources = Array.from({ length: 3 }, (_, index) => ({
      orderId: `o${index % 2}`,
      orderItemId: `i${index}`,
      quantity: decimalString(BigInt(count * (count + 1)) / 2n, 3),
      amount: `${count * 100 + index}.01`,
    }));
    const division = {
      mode: 'ITEMS' as const,
      parts: Array.from({ length: count }, (_, index) => ({
        items: sources.map((source) => ({
          orderItemId: source.orderItemId,
          quantity: decimalString(BigInt(index + 1), 3),
        })),
      })),
    };
    const original = structuredClone({ sources, division });
    const result = distributeBillItems(sources, division);
    expect(distributeBillItems([...sources].reverse(), division)).toEqual(result);
    expect({ sources, division }).toEqual(original);
    for (const source of sources) {
      const allocations = result.parts.flatMap((part) =>
        part.items.filter((item) => item.orderItemId === source.orderItemId),
      );
      expect(allocations.reduce((sum, item) => sum + decimalUnits(item.quantity, 3), 0n)).toBe(
        decimalUnits(source.quantity, 3),
      );
      expect(allocations.reduce((sum, item) => sum + decimalUnits(item.amount, 2), 0n)).toBe(
        decimalUnits(source.amount, 2),
      );
    }
    for (const part of result.parts)
      expect(
        part.allocations.reduce((sum, allocation) => sum + decimalUnits(allocation.amount, 2), 0n),
      ).toBe(decimalUnits(part.amount, 2));
  }
});
