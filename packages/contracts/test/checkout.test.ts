import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkoutMoneySchema, demoCheckoutSchema, manualCheckoutSchema } from '../src';

describe('finalizarea strictă a comenzii', () => {
  const identity = { version: 4, requestKey: randomUUID() };
  it('normalizează numerarul exact, inclusiv sume peste precizia Number', () => {
    expect(checkoutMoneySchema.parse('10')).toBe('10.00');
    expect(checkoutMoneySchema.parse('10.5')).toBe('10.50');
    expect(checkoutMoneySchema.parse('9007199254740993.01')).toBe('9007199254740993.01');
    expect(checkoutMoneySchema.parse('0')).toBe('0.00');
  });
  it('respinge numerar invalid, fracții de ban și numere JSON', () => {
    for (const amount of [
      10,
      '-1',
      'NaN',
      'Infinity',
      '1e2',
      '1.001',
      '01.00',
      '10000000000000000',
      ' 10',
    ])
      expect(checkoutMoneySchema.safeParse(amount).success).toBe(false);
  });
  it('cere confirmarea încasării și separă numerarul de terminalul card', () => {
    expect(
      manualCheckoutSchema.parse({
        ...identity,
        method: 'CASH',
        receivedAmount: '20',
        confirmed: true,
      }),
    ).toMatchObject({ receivedAmount: '20.00' });
    expect(
      manualCheckoutSchema.safeParse({ ...identity, method: 'CARD', confirmed: true }).success,
    ).toBe(true);
    for (const payload of [
      { method: 'CASH', confirmed: true },
      { method: 'CASH', receivedAmount: '20', confirmed: false },
      { method: 'CARD', receivedAmount: '20', confirmed: true },
      { method: 'CARD' },
      { method: 'DEMO', confirmed: true },
    ])
      expect(manualCheckoutSchema.safeParse({ ...identity, ...payload }).success).toBe(false);
  });
  it('nu acceptă totaluri, identități sau stări calculate de client', () => {
    expect(demoCheckoutSchema.parse(identity)).toEqual(identity);
    for (const injected of [
      { total: '0.01' },
      { organizationId: randomUUID() },
      { actorUserId: randomUUID() },
      { status: 'COMPLETED' },
      { mode: 'MANUAL' },
    ]) {
      expect(demoCheckoutSchema.safeParse({ ...identity, ...injected }).success).toBe(false);
      expect(
        manualCheckoutSchema.safeParse({
          ...identity,
          method: 'CARD',
          confirmed: true,
          ...injected,
        }).success,
      ).toBe(false);
    }
  });
});
