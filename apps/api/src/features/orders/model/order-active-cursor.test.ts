import { describe, expect, it, vi } from 'vitest';
import { activeOrdersSchema } from '@pos/contracts';
import { decodeActiveOrderCursor, encodeActiveOrderCursor } from './order-active-cursor';
import { encodeOrderCursor } from './order-search-cursor';

vi.mock('../../../shared/config', () => ({ config: { MFA_ENCRYPTION_KEY: 'a'.repeat(64) } }));
const context = { organizationId: 'org', locationId: 'loc', userId: 'actor' };
describe('comenzi active: contract și cursor separat', () => {
  it('validează limitele fără a accepta filtre sau UUID ca opțiuni implicite', () => {
    const query = { locationId: '00000000-0000-4000-8000-000000000001' };
    expect(activeOrdersSchema.parse(query).limit).toBe(50);
    expect(activeOrdersSchema.parse({ ...query, limit: '1' }).limit).toBe(1);
    for (const limit of ['0', '51', '1.5', '', 'NaN'])
      expect(() => activeOrdersSchema.parse({ ...query, limit })).toThrow();
    expect(() => activeOrdersSchema.parse({ ...query, status: 'DRAFT' })).toThrow();
  });
  it('leagă ancora criptată de actor/tenant/locație și refuză alt domeniu', () => {
    const cursor = encodeActiveOrderCursor(context, 200123);
    expect(decodeActiveOrderCursor(context, cursor)).toBe(200123);
    expect(Buffer.from(cursor, 'base64url').toString()).not.toContain('200123');
    for (const key of ['organizationId', 'locationId', 'userId'])
      expect(() => decodeActiveOrderCursor({ ...context, [key]: 'other' }, cursor)).toThrow();
    const search = encodeOrderCursor({ ...context, kind: 'SEARCH', fingerprint: 'x' }, 200123);
    for (const invalid of [search, '00000000-0000-4000-8000-000000000001', `${cursor}=`, '{}'])
      expect(() => decodeActiveOrderCursor(context, invalid)).toThrow();
  });
});
