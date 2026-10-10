import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createInventoryDocumentSchema,
  createInventoryItemSchema,
  createModifierRecipeSchema,
  createRecipeSchema,
  inventorySignedQuantitySchema,
} from './inventory.schema';

describe('contracte inventar', () => {
  const document = {
    locationId: randomUUID(),
    inventoryItemId: randomUUID(),
    kind: 'COUNT',
    quantity: '0',
    expectedQuantity: '-2.25',
    reason: 'Inventariere fizică',
    requestKey: randomUUID(),
  };
  it('normalizează exact cantități, zero și solduri negative', () => {
    expect(createInventoryDocumentSchema.parse(document)).toMatchObject({
      quantity: '0.000000',
      expectedQuantity: '-2.250000',
    });
    expect(inventorySignedQuantitySchema.parse('-0')).toBe('0.000000');
    expect(inventorySignedQuantitySchema.parse('999999999999.999999')).toBe('999999999999.999999');
  });
  it('respinge float, exponenți, depășiri, chei suplimentare și COUNT fără stoc observat', () => {
    for (const quantity of [0.1, '1e3', '-1', '1000000000000', '0.0000001', 'NaN'])
      expect(createInventoryDocumentSchema.safeParse({ ...document, quantity }).success).toBe(
        false,
      );
    expect(
      createInventoryDocumentSchema.safeParse({ ...document, expectedQuantity: undefined }).success,
    ).toBe(false);
    expect(createInventoryDocumentSchema.safeParse({ ...document, kind: 'RECEIPT' }).success).toBe(
      false,
    );
    expect(
      createInventoryDocumentSchema.safeParse({
        ...document,
        kind: 'WASTE',
        expectedQuantity: undefined,
      }).success,
    ).toBe(false);
    expect(
      createInventoryDocumentSchema.safeParse({ ...document, actorName: 'Alt actor' }).success,
    ).toBe(false);
  });
  it('rețetele normalizează cantitatea și filtrele, refuză duplicate și depășiri', () => {
    const component = {
      inventoryItemId: randomUUID(),
      purpose: 'MAIN',
      quantityPerUnit: '0.001',
      serviceTypes: ['TAKEAWAY', 'DINE_IN'],
    };
    const recipe = {
      expectedVersion: 0,
      requestKey: randomUUID(),
      reason: 'Rețeta inițială',
      components: [component],
    };
    expect(createRecipeSchema.parse(recipe).components[0]).toMatchObject({
      quantityPerUnit: '0.001',
      serviceTypes: ['DINE_IN', 'TAKEAWAY'],
    });
    expect(
      createRecipeSchema.safeParse({ ...recipe, components: [component, component] }).success,
    ).toBe(false);
    expect(
      createRecipeSchema.safeParse({
        ...recipe,
        components: [{ ...component, serviceTypes: ['DINE_IN', 'DINE_IN'] }],
      }).success,
    ).toBe(false);
    expect(
      createRecipeSchema.safeParse({
        ...recipe,
        components: [{ ...component, quantityPerUnit: '1000000' }],
      }).success,
    ).toBe(false);
    expect(createRecipeSchema.parse({ ...recipe, components: [] }).components).toEqual([]);
  });
  it('nu acceptă soldul inițial furnizat în metadatele articolului', () => {
    expect(
      createInventoryItemSchema.safeParse({
        sku: 'OREZ',
        name: 'Orez',
        kind: 'INGREDIENT',
        unit: 'G',
        balance: '500',
      }).success,
    ).toBe(false);
  });
  it('rețeta modificatorului distinge publicarea goală și limitează componentele', () => {
    const component = {
      inventoryItemId: randomUUID(),
      purpose: 'AUXILIARY',
      quantityPerUnit: '0.125',
      serviceTypes: ['DELIVERY'],
    };
    const recipe = {
      expectedVersion: 0,
      requestKey: randomUUID(),
      reason: 'Modificator configurat explicit',
      components: [component],
    };
    expect(createModifierRecipeSchema.parse({ ...recipe, components: [] }).components).toEqual([]);
    expect(createModifierRecipeSchema.parse(recipe).components[0]?.quantityPerUnit).toBe('0.125');
    expect(
      createModifierRecipeSchema.safeParse({ ...recipe, components: [component, component] })
        .success,
    ).toBe(false);
    expect(
      createModifierRecipeSchema.safeParse({
        ...recipe,
        components: Array.from({ length: 21 }, () => ({
          ...component,
          inventoryItemId: randomUUID(),
        })),
      }).success,
    ).toBe(false);
  });
});
