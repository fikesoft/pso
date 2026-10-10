import { describe, expect, it } from 'vitest';
import { AuthorizationService } from '../src/index.js';
import {
  fixture,
  locationA,
  locationB,
  organization,
  changeUser,
  changeDelegation,
  permission,
} from './fixtures/authorization.fixture';

export function registerDelegationTests() {
  describe('separate grant authority and live provenance', () => {
    it('satisfies the complete Ana scenario and returns server-selected provenance', () => {
      const service = new AuthorizationService(fixture());
      for (const action of ['orders.read', 'orders.create', 'kitchen.read'])
        expect(service.canGrant('ana', 'worker', action, locationA)).toBe(true);
      for (const action of [
        'payments.refund',
        'reports.cost.read',
        'staff.delegate',
        'platform.owner',
      ])
        expect(service.canGrant('ana', 'worker', action, locationA)).toBe(false);
      expect(service.canGrant('ana', 'worker', 'orders.read', locationB)).toBe(false);
      expect(service.grantSource('ana', 'worker', 'orders.read', locationA)).toEqual({
        allowed: true,
        delegationGrantId: 'ana-ceiling',
      });
      expect(service.grantSource('primary', 'worker', 'orders.read', locationA)).toEqual({
        allowed: true,
        delegationGrantId: null,
      });
    });
    it('staff.create and effective use alone do not confer grant power', () => {
      const snapshot = { ...fixture(), delegations: [] };
      const service = new AuthorizationService(snapshot);
      expect(service.canUse('ana', 'staff.create', locationA)).toBe(true);
      expect(service.canUse('ana', 'orders.read', locationA)).toBe(true);
      expect(service.canGrant('ana', 'worker', 'orders.read', locationA)).toBe(false);
    });
    it('a ceiling without effective use cannot be exercised', () => {
      const snapshot = fixture();
      const service = new AuthorizationService({
        ...snapshot,
        roleVersions: snapshot.roleVersions.map((role) =>
          role.id === 'admin-v1' ? { ...role, permissions: [permission('staff.create')] } : role,
        ),
      });
      expect(service.canGrant('ana', 'worker', 'orders.read', locationA)).toBe(false);
      expect(service.canUse('worker', 'orders.read', locationA)).toBe(false);
    });
    it('revocation, disabled issuer and disabled root issuer invalidate derived access', () => {
      const snapshot = fixture();
      for (const revoked of [
        changeDelegation(snapshot, { status: 'REVOKED' }),
        changeUser(snapshot, 'ana', { status: 'DISABLED' }),
        changeUser(snapshot, 'primary', { status: 'DISABLED' }),
      ]) {
        expect(new AuthorizationService(revoked).canUse('worker', 'orders.read', locationA)).toBe(
          false,
        );
      }
    });
    it('narrowed ceiling and removed issuer location invalidate old assignments', () => {
      const snapshot = fixture();
      expect(
        new AuthorizationService(
          changeDelegation(snapshot, { permissions: [permission('kitchen.read')] }),
        ).canUse('worker', 'orders.read', locationA),
      ).toBe(false);
      expect(
        new AuthorizationService(changeUser(snapshot, 'ana', { locationIds: [] })).canUse(
          'worker',
          'orders.read',
          locationA,
        ),
      ).toBe(false);
    });
    it('rejects derived assignment with absent, wrong or foreign provenance', () => {
      const snapshot = fixture();
      for (const changes of [
        { delegationGrantId: null },
        { delegationGrantId: 'fake' },
        { issuerUserId: 'peer' },
        { organizationId: 'org-b' },
      ]) {
        const service = new AuthorizationService({
          ...snapshot,
          assignments: snapshot.assignments.map((entry) =>
            entry.userId === 'worker' ? { ...entry, ...changes } : entry,
          ),
        });
        expect(service.canUse('worker', 'orders.read', locationA)).toBe(false);
      }
    });
    it('keeps redelegation closed even when stored flags or chain are tampered', () => {
      for (const changes of [
        { canRedelegate: true },
        { parentGrantId: 'parent' },
        { issuerUserId: 'ana' },
      ]) {
        expect(
          new AuthorizationService(changeDelegation(fixture(), changes)).canUse(
            'worker',
            'orders.read',
            locationA,
          ),
        ).toBe(false);
      }
      const service = new AuthorizationService(fixture());
      expect(
        service.canSetDelegation('ana', 'worker', locationA, [permission('orders.read')]),
      ).toBe(false);
      expect(
        service.canSetDelegation('primary', 'ana', locationA, [permission('orders.read')]),
      ).toBe(true);
      expect(
        service.canSetDelegation('primary', 'ana', locationA, [permission('staff.delegate')]),
      ).toBe(false);
    });
    it('requires MFA for primary and access administrators, not ordinary workers', () => {
      const service = new AuthorizationService(fixture());
      expect(service.requiresMfa('primary')).toBe(true);
      expect(service.requiresMfa('ana')).toBe(true);
      expect(service.requiresMfa('worker')).toBe(false);
    });
    it('does not grant the primary role or platform power through tenant permissions', () => {
      const service = new AuthorizationService(fixture());
      expect(service.canGrant('primary', 'ana', 'staff.delegate', organization)).toBe(false);
      expect(service.canGrant('primary', 'ana', 'PrimaryAdmin', organization)).toBe(false);
      expect(service.canGrant('primary', 'ana', 'PlatformOwner', organization)).toBe(false);
    });
  });
}
