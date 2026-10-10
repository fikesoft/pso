import { describe, expect, it } from 'vitest';
import { AuthorizationService, decimalAtMost, limitsWithin } from '../src/index.js';
import {
  fixture,
  locationA,
  locationB,
  organization,
  override,
  changeUser,
  permission,
} from './fixtures/authorization.fixture';

export function registerLimitsTests() {
  describe('DENY, immutable versions and exact limits', () => {
    it('applicable DENY defeats roles and direct individual ALLOW', () => {
      const snapshot = fixture();
      const service = new AuthorizationService({
        ...snapshot,
        overrides: [override(), override({ id: 'allow', effect: 'ALLOW' })],
      });
      expect(service.canUse('worker', 'orders.read', locationA)).toBe(false);
    });
    it('organization DENY defeats local ALLOW and remains until explicitly revoked', () => {
      const snapshot = fixture();
      const deny = override({ ...organization, issuerUserId: 'peer' });
      expect(
        new AuthorizationService({
          ...changeUser(snapshot, 'peer', { status: 'DISABLED' }),
          overrides: [deny],
        }).canUse('worker', 'orders.read', locationA),
      ).toBe(false);
      expect(
        new AuthorizationService({
          ...snapshot,
          overrides: [{ ...deny, revokedAt: '2026-09-08T00:00:00Z' }],
        }).canUse('worker', 'orders.read', locationA),
      ).toBe(true);
    });
    it('issuer DENY also invalidates downstream grants', () => {
      const service = new AuthorizationService({
        ...fixture(),
        overrides: [override({ userId: 'ana' })],
      });
      expect(service.canGrant('ana', 'worker', 'orders.read', locationA)).toBe(false);
      expect(service.canUse('worker', 'orders.read', locationA)).toBe(false);
    });
    it('local DENY does not affect separate location authority', () => {
      const service = new AuthorizationService({
        ...fixture(),
        overrides: [override({ userId: 'primary' })],
      });
      expect(service.canUse('primary', 'orders.read', locationA)).toBe(false);
      expect(service.canUse('primary', 'orders.read', locationB)).toBe(true);
    });
    it('new role version never silently changes the assigned version', () => {
      const snapshot = fixture();
      const service = new AuthorizationService({
        ...snapshot,
        roleVersions: [
          ...snapshot.roleVersions,
          {
            id: 'waiter-v2',
            organizationId: 'org-a',
            permissions: [permission('payments.refund')],
          },
        ],
      });
      expect(service.canUse('worker', 'orders.read', locationA)).toBe(true);
      expect(service.canUse('worker', 'payments.refund', locationA)).toBe(false);
    });
    it('even poisoned role contents or forged ALLOW cannot bypass issuer ceiling', () => {
      const snapshot = fixture();
      const service = new AuthorizationService({
        ...snapshot,
        roleVersions: snapshot.roleVersions.map((role) =>
          role.id === 'waiter-v1'
            ? { ...role, permissions: [permission('payments.refund')] }
            : role,
        ),
        overrides: [
          override({
            effect: 'ALLOW',
            permission: 'reports.cost.read',
            issuerUserId: 'ana',
            delegationGrantId: 'ana-ceiling',
          }),
        ],
      });
      expect(service.canUse('worker', 'payments.refund', locationA)).toBe(false);
      expect(service.canUse('worker', 'reports.cost.read', locationA)).toBe(false);
    });
    it('compares numbers beyond IEEE safe integer precision exactly', () => {
      expect(decimalAtMost('9007199254740993.02', '9007199254740993.01')).toBe(false);
      expect(decimalAtMost('9007199254740993.01', '9007199254740993.02')).toBe(true);
      expect(decimalAtMost('1.1', '1.10')).toBe(true);
    });
    it('rejects NaN, exponent notation, negatives, loose numbers and invalid percentages', () => {
      for (const invalid of ['NaN', '1e2', '-1', '01', '1.001', 'Infinity'])
        expect(limitsWithin({ maxAmount: invalid }, {})).toBe(false);
      expect(limitsWithin({ maxPercent: '100.01' }, {})).toBe(false);
      expect(limitsWithin({}, { maxAmount: '100' })).toBe(false);
      expect(
        new AuthorizationService(fixture()).canUse('primary', 'orders.create', {
          ...locationA,
          amount: '-1',
        }),
      ).toBe(false);
    });
    it('intersects own amount/percent limits with ceiling without widening either', () => {
      const snapshot = fixture();
      const service = new AuthorizationService({
        ...snapshot,
        roleVersions: snapshot.roleVersions.map((role) =>
          role.id === 'admin-v1'
            ? {
                ...role,
                permissions: [
                  { permission: 'orders.create', limits: { maxAmount: '100', maxPercent: '20' } },
                ],
              }
            : role,
        ),
        delegations: snapshot.delegations.map((grant) => ({
          ...grant,
          permissions: [
            { permission: 'orders.create', limits: { maxAmount: '200', maxPercent: '10' } },
          ],
        })),
      });
      expect(
        service.canGrant('ana', 'worker', 'orders.create', locationA, {
          maxAmount: '100',
          maxPercent: '10',
        }),
      ).toBe(true);
      expect(
        service.canGrant('ana', 'worker', 'orders.create', locationA, {
          maxAmount: '150',
          maxPercent: '10',
        }),
      ).toBe(false);
      expect(
        service.canGrant('ana', 'worker', 'orders.create', locationA, {
          maxAmount: '100',
          maxPercent: '15',
        }),
      ).toBe(false);
      expect(service.canGrant('ana', 'worker', 'orders.create', locationA)).toBe(false);
      // Existing unlimited derived assignment becomes wholly ineffective after narrowing.
      expect(service.canUse('worker', 'orders.create', locationA)).toBe(false);
    });
    it('does not synthesize a broader allowance from two narrower sources', () => {
      const snapshot = fixture();
      const service = new AuthorizationService({
        ...snapshot,
        assignments: [],
        overrides: [
          override({
            id: 'one',
            userId: 'ana',
            effect: 'ALLOW',
            permission: 'orders.create',
            limits: { maxAmount: '100', maxPercent: '30' },
          }),
          override({
            id: 'two',
            userId: 'ana',
            effect: 'ALLOW',
            permission: 'orders.create',
            limits: { maxAmount: '200', maxPercent: '10' },
          }),
        ],
      });
      expect(
        service.canUse('ana', 'orders.create', { ...locationA, amount: '150', percent: '20' }),
      ).toBe(false);
      expect(
        service.canGrant('ana', 'worker', 'orders.create', locationA, {
          maxAmount: '200',
          maxPercent: '30',
        }),
      ).toBe(false);
    });
    it('requires supplied operation values to fit a single valid source', () => {
      const service = new AuthorizationService({
        ...fixture(),
        overrides: [
          override({
            userId: 'peer',
            effect: 'ALLOW',
            permission: 'payments.refund',
            limits: { maxAmount: '50.10', maxPercent: '20' },
          }),
        ],
      });
      expect(
        service.canUse('peer', 'payments.refund', { ...locationA, amount: '50.10', percent: '20' }),
      ).toBe(true);
      expect(service.canUse('peer', 'payments.refund', { ...locationA, amount: '50.11' })).toBe(
        false,
      );
      expect(service.canUse('peer', 'payments.refund', { ...locationA, percent: '20.01' })).toBe(
        false,
      );
    });
  });
}
