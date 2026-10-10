import { describe, expect, it } from 'vitest';
import {
  packingCommandSchema,
  packingCommandResultSchema,
  packingListQuerySchema,
  resolvePackingCommandSchema,
} from './packing.schema';

describe('contractele ambalării', () => {
  const sessionId = '00000000-0000-4000-8000-000000000001';
  const requestKey = '00000000-0000-4000-8000-000000000002';
  const itemId = '00000000-0000-4000-8000-000000000003';

  it('separă acțiunile și refuză controlul scope-ului, actorului sau rezultatului', () => {
    const base = { version: 1, requestKey };
    for (const input of [
      { ...base, action: 'START' },
      { ...base, action: 'CHECK_ITEM', itemId, checked: true },
      { ...base, action: 'CHECK_ITEM', itemId, checked: false },
      { ...base, action: 'COMPLETE' },
    ])
      expect(packingCommandSchema.parse(input)).toEqual(input);
    for (const patch of [
      { version: 0 },
      { version: '1' },
      { version: 2147483647 },
      { version: 1.5 },
      { requestKey: undefined },
      { organizationId: sessionId },
      { locationId: sessionId },
      { actorUserId: sessionId },
      { status: 'READY' },
      { completedAt: '2026-10-04T12:00:00Z' },
      { itemId },
    ])
      expect(
        packingCommandSchema.safeParse({ ...base, action: 'COMPLETE', ...patch }).success,
      ).toBe(false);
  });

  it('bifarea cere un articol identificat și un boolean explicit', () => {
    const input = { version: 2, requestKey, action: 'CHECK_ITEM', itemId, checked: false };
    for (const patch of [
      { itemId: undefined },
      { itemId: 'alt-articol' },
      { checked: undefined },
      { checked: 'false' },
      { checked: 1 },
      { quantity: '1.000' },
      { productName: 'Nume nou' },
    ])
      expect(packingCommandSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });

  it('recuperarea păstrează acțiunea pentru autorizare și nu primește un corp nou', () => {
    const input = { sessionId, requestKey, action: 'COMPLETE' };
    expect(resolvePackingCommandSchema.parse(input)).toEqual(input);
    for (const patch of [{ action: undefined }, { version: 1 }, { checked: true }, { itemId }])
      expect(resolvePackingCommandSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    expect(packingListQuerySchema.parse({ locationId: sessionId })).toEqual({
      locationId: sessionId,
      status: 'ACTIVE',
      limit: 50,
    });
    for (const patch of [{ limit: 101 }, { status: 'NOT_REQUIRED' }, { organizationId: itemId }])
      expect(packingListQuerySchema.safeParse({ locationId: sessionId, ...patch }).success).toBe(
        false,
      );
  });

  it('rezultatul trebuie să corespundă acțiunii și avansării unei singure versiuni', () => {
    const result = {
      sessionId,
      requestKey,
      expectedVersion: 2,
      version: 3,
      occurredAt: '2026-10-04T12:00:00.000Z',
      action: 'CHECK_ITEM',
      status: 'PACKING',
      itemId,
      checked: true,
    };
    expect(packingCommandResultSchema.parse(result)).toEqual(result);
    for (const patch of [
      { version: 4 },
      { version: 2 },
      { occurredAt: 'ieri' },
      { status: 'READY' },
      { action: 'START' },
      { itemId: undefined },
      { checked: 'true' },
    ])
      expect(packingCommandResultSchema.safeParse({ ...result, ...patch }).success).toBe(false);
  });
});
