import { describe, expect, it } from 'vitest';
import {
  clearCreationPointer,
  creationStorageKey,
  readCreationPointer,
  storeCreationPointer,
} from './creation-pointer';
import type { CreationPointerStorage, OrderCreationPointer } from '../model/order-creation.types';
function fixture() {
  const values = new Map<string, string>();
  const storage: CreationPointerStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
  const pointer: OrderCreationPointer = {
    organizationId: 'org-a',
    actorUserId: 'user-a',
    locationId: 'location-a',
    requestKey: '00000000-0000-4000-8000-000000000001',
  };
  return { storage, pointer, values };
}
describe('opaque order creation recovery pointer', () => {
  it('persists only opaque scope and key, never extra draft fields', () => {
    const { storage, pointer, values } = fixture();
    storeCreationPointer(storage, {
      ...pointer,
      notes: 'private',
      items: ['sensitive'],
    } as OrderCreationPointer);
    expect(JSON.parse(values.get(creationStorageKey(pointer))!)).toEqual(pointer);
    expect(readCreationPointer(storage, pointer)).toEqual(pointer);
  });
  it('isolates actor, organization and location and does not remove a replacement key', () => {
    const { storage, pointer } = fixture();
    storeCreationPointer(storage, pointer);
    for (const other of [
      { ...pointer, actorUserId: 'other' },
      { ...pointer, locationId: 'other' },
      { ...pointer, organizationId: 'other' },
    ])
      expect(readCreationPointer(storage, other)).toBeNull();
    const replacement = { ...pointer, requestKey: '00000000-0000-4000-8000-000000000002' };
    expect(() => storeCreationPointer(storage, replacement)).toThrow();
    expect(() => clearCreationPointer(storage, replacement)).toThrow();
    expect(readCreationPointer(storage, pointer)).toEqual(pointer);
    clearCreationPointer(storage, pointer);
    expect(readCreationPointer(storage, pointer)).toBeNull();
  });
  it('detects a storage implementation that silently drops writes or removals', () => {
    const { storage, pointer } = fixture();
    expect(() => storeCreationPointer({ ...storage, setItem: () => {} }, pointer)).toThrow();
    storeCreationPointer(storage, pointer);
    expect(() => clearCreationPointer({ ...storage, removeItem: () => {} }, pointer)).toThrow();
  });
  it('fails closed on malformed or cross-scope contents', () => {
    const { storage, pointer, values } = fixture();
    for (const value of [
      '{',
      'null',
      JSON.stringify({ ...pointer, actorUserId: 'other' }),
      JSON.stringify({ ...pointer, requestKey: 'bad-key' }),
    ]) {
      values.set(creationStorageKey(pointer), value);
      expect(() => readCreationPointer(storage, pointer)).toThrow();
    }
  });
});
