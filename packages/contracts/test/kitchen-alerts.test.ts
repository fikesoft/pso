import { describe, expect, it } from 'vitest';
import {
  kitchenAlertIdentitySchema,
  kitchenAlertSetSchema,
  kitchenAlertThresholdsSchema,
  kitchenAlertSeverity,
  resolveKitchenAlert,
} from '../src/kitchen-alerts';
import type { KitchenAlertContext, KitchenAlertRule } from '../src/kitchen-alerts';

function fixture() {
  const locationId = '00000000-0000-4000-8000-000000000001';
  const stationId = '00000000-0000-4000-8000-000000000002';
  const productId = '00000000-0000-4000-8000-000000000003';
  const categoryId = '00000000-0000-4000-8000-000000000004';
  const context: KitchenAlertContext = { locationId, stationId, productId, categoryId };
  const organization = { scopeType: 'ORGANIZATION' } as const;
  const location = { scopeType: 'LOCATION', locationId } as const;
  const rules: KitchenAlertRule[] = [
    { scope: organization, target: { kind: 'DEFAULT' }, version: 1, thresholds: null },
    { scope: location, target: { kind: 'DEFAULT' }, version: 1, thresholds: null },
    { scope: location, target: { kind: 'STATION', stationId }, version: 1, thresholds: null },
    { scope: organization, target: { kind: 'CATEGORY', categoryId }, version: 1, thresholds: null },
    { scope: location, target: { kind: 'CATEGORY', categoryId }, version: 1, thresholds: null },
    { scope: organization, target: { kind: 'PRODUCT', productId }, version: 1, thresholds: null },
    { scope: location, target: { kind: 'PRODUCT', productId }, version: 1, thresholds: null },
  ];
  rules.forEach((rule, index) => {
    rule.thresholds = { warningSeconds: 60 + index, criticalSeconds: 120 + index };
  });
  return { context, rules };
}

describe('praguri KDS', () => {
  it('rezolvă fiecare nivel de prioritate independent de ordinea regulilor', () => {
    const { context, rules } = fixture();
    for (let count = 1; count <= rules.length; count++) {
      const selected = rules[count - 1]!;
      const expected = {
        thresholds: selected.thresholds,
        source: { scope: selected.scope, target: selected.target },
      };
      expect(resolveKitchenAlert(rules.slice(0, count), context)).toEqual(expected);
      expect(resolveKitchenAlert(rules.slice(0, count).reverse(), context)).toEqual(expected);
    }
  });

  it('revenirea la moștenire păstrează regula și versiunea, dar ignoră pragurile retrase', () => {
    const { context, rules } = fixture();
    rules.at(-1)!.thresholds = null;
    expect(resolveKitchenAlert(rules, context).thresholds).toEqual(rules.at(-2)!.thresholds);
    for (const rule of rules) rule.thresholds = null;
    expect(resolveKitchenAlert(rules, context)).toEqual({
      thresholds: { warningSeconds: 600, criticalSeconds: 900 },
      source: null,
    });
  });

  it('ignoră alte locații, stații, produse și categorii', () => {
    const { context, rules } = fixture();
    const other = '00000000-0000-4000-8000-000000000009';
    expect(
      resolveKitchenAlert(rules, {
        locationId: other,
        stationId: other,
        productId: other,
        categoryId: other,
      }).thresholds,
    ).toEqual(rules[0]!.thresholds);
    expect(
      resolveKitchenAlert(rules.slice(2, 3), { ...context, stationId: null }).source,
    ).toBeNull();
    expect(
      resolveKitchenAlert(rules.slice(3, 5), { ...context, categoryId: null }).source,
    ).toBeNull();
  });

  it('nu convertește o locație în scope organizațional și cere locația stației', () => {
    const { rules, context } = fixture();
    for (const rule of rules)
      expect(
        kitchenAlertIdentitySchema.safeParse({
          scope: rule.scope,
          target: rule.target,
        }).success,
      ).toBe(true);
    expect(
      kitchenAlertIdentitySchema.safeParse({
        scope: { scopeType: 'ORGANIZATION', locationId: context.locationId },
        target: { kind: 'DEFAULT' },
      }).success,
    ).toBe(false);
    expect(
      kitchenAlertIdentitySchema.safeParse({
        scope: { scopeType: 'ORGANIZATION' },
        target: { kind: 'STATION', stationId: context.stationId },
      }).success,
    ).toBe(false);
    expect(
      kitchenAlertIdentitySchema.safeParse({
        scope: { scopeType: 'LOCATION' },
        target: { kind: 'DEFAULT' },
      }).success,
    ).toBe(false);
  });

  it('respinge praguri egale, inversate, fracționare, negative sau nefinite', () => {
    for (const [warningSeconds, criticalSeconds] of [
      [60, 60],
      [120, 60],
      [0, 60],
      [-1, 60],
      [1.5, 60],
      [60, 90.5],
      [NaN, 90],
      [60, Infinity],
      [60, 86401],
    ]) {
      expect(
        kitchenAlertThresholdsSchema.safeParse({
          warningSeconds,
          criticalSeconds,
        }).success,
      ).toBe(false);
    }
    expect(
      kitchenAlertThresholdsSchema.parse({ warningSeconds: 1, criticalSeconds: 86400 }),
    ).toEqual({ warningSeconds: 1, criticalSeconds: 86400 });
  });

  it('validează comanda inclusiv identitatea, versiunea și revenirea la moștenire', () => {
    const { context, rules } = fixture();
    const rule = rules[0]!;
    const command = { ...rule, requestKey: context.productId, version: 0 };
    expect(kitchenAlertSetSchema.safeParse(command).success).toBe(true);
    expect(kitchenAlertSetSchema.safeParse({ ...command, thresholds: null }).success).toBe(true);
    for (const extra of [
      { version: -1 },
      { version: 2147483647 },
      { requestKey: 'bad' },
      { organizationId: context.productId },
      { target: { kind: 'STATION', stationId: context.stationId } },
    ])
      expect(kitchenAlertSetSchema.safeParse({ ...command, ...extra }).success).toBe(false);
  });

  it('schimbă severitatea exact la prag și nu ascunde un ceas invalid', () => {
    const thresholds = { warningSeconds: 600, criticalSeconds: 900 };
    expect(kitchenAlertSeverity(599.99, thresholds)).toBe('NORMAL');
    expect(kitchenAlertSeverity(600, thresholds)).toBe('WARNING');
    expect(kitchenAlertSeverity(899.99, thresholds)).toBe('WARNING');
    expect(kitchenAlertSeverity(900, thresholds)).toBe('CRITICAL');
    for (const value of [-1, NaN, Infinity]) {
      expect(() => kitchenAlertSeverity(value, thresholds)).toThrow(RangeError);
    }
  });
});
