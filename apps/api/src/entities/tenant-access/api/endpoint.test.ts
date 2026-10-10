import { expect, it, vi } from 'vitest';
vi.mock('../../../shared/db', () => ({ runtime: {}, withTenantTransaction: vi.fn() }));
vi.mock('../model/load-access', () => ({ loadAccess: vi.fn() }));
import { endpoint } from './endpoint';
it('snapshotul read-only este o alegere internă explicită, nu o opțiune de mutație', () => {
  const handler = vi.fn(async () => ({}));
  expect(() => endpoint(handler, { readOnlySnapshot: true })).toThrow(
    'readOnlySnapshot requires readOnly',
  );
  expect(() => endpoint(handler, { readOnly: true, readOnlySnapshot: true })).not.toThrow();
  expect(() => endpoint(handler)).not.toThrow();
});
