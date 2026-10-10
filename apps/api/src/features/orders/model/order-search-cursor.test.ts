import { describe, expect, it, vi } from 'vitest';
import {
  decodeOrderCursor,
  encodeOrderCursor,
  orderFilterFingerprint,
} from './order-search-cursor';
import type { OrderCursorContext } from './order-search.types';

vi.mock('../../../shared/config', () => ({ config: { MFA_ENCRYPTION_KEY: 'a'.repeat(64) } }));
const context: OrderCursorContext = {
  organizationId: 'org',
  locationId: 'loc',
  userId: 'actor',
  kind: 'SEARCH',
  fingerprint: orderFilterFingerprint({ customerNameLookupHash: 'blind-index' }),
};
describe('continuarea criptată a căutării', () => {
  it('ascunde ancora inclusiv când candidatul este refuzat de drepturile curente', () => {
    const cursor = encodeOrderCursor(context, 197531);
    expect(decodeOrderCursor(context, cursor)).toBe(197531);
    expect(Buffer.from(cursor, 'base64url').toString()).not.toContain('197531');
    expect(cursor).not.toBe(encodeOrderCursor(context, 197531));
  });
  it('respinge modificarea, transferul și reutilizarea pentru alte filtre', () => {
    const cursor = encodeOrderCursor(context, 20);
    for (const key of ['organizationId', 'locationId', 'userId', 'fingerprint'])
      expect(() => decodeOrderCursor({ ...context, [key]: 'different' }, cursor)).toThrow();
    expect(() => decodeOrderCursor({ ...context, kind: 'CREATORS' }, cursor)).toThrow();
    for (const invalid of ['', '{}', `${cursor}=`, `${cursor.slice(0, -2)}AA`])
      expect(() => decodeOrderCursor(context, invalid)).toThrow();
  });
});
