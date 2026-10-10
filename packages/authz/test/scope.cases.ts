import { describe, expect, it } from 'vitest';
import { AuthorizationService } from '../src/index.js';
import {
  fixture,
  locationA,
  locationB,
  organization,
  override,
  changeUser,
} from './fixtures/authorization.fixture';

export function registerScopeTests() {
  describe('scope, tenant and hierarchy', () => {
    it('grants the primary all current and future active locations of its own organization', () => {
      const snapshot = fixture();
      const service = new AuthorizationService({
        ...snapshot,
        locations: [
          ...snapshot.locations,
          { id: 'future', organizationId: 'org-a', status: 'ACTIVE' },
        ],
      });
      expect(service.canUse('primary', 'orders.read', { ...locationA, locationId: 'future' })).toBe(
        true,
      );
      expect(
        service.canUse('primary', 'orders.read', {
          ...locationA,
          organizationId: 'org-b',
          locationId: 'foreign-location',
        }),
      ).toBe(false);
    });
    it('denies absent users, unknown actions, platform actions and malformed scopes', () => {
      const service = new AuthorizationService(fixture());
      expect(service.canUse('absent', 'orders.read', locationA)).toBe(false);
      expect(service.canUse('primary', 'platform.owner', organization)).toBe(false);
      expect(service.canUse('primary', 'made.up', organization)).toBe(false);
      expect(
        service.canUse('primary', 'staff.read', { ...organization, locationId: 'location-a' }),
      ).toBe(false);
      expect(service.canUse('primary', 'orders.read', { ...locationA, locationId: null })).toBe(
        false,
      );
      expect(
        service.canUse('primary', 'orders.read', { ...locationA, locationId: 'foreign-location' }),
      ).toBe(false);
    });
    it('location A never implies B or organizational access', () => {
      const service = new AuthorizationService(fixture());
      expect(service.canUse('ana', 'staff.create', locationA)).toBe(true);
      expect(service.canUse('ana', 'staff.create', locationB)).toBe(false);
      expect(service.canUse('ana', 'staff.create', organization)).toBe(false);
      expect(service.canUse('worker', 'orders.read', locationA)).toBe(true);
      expect(service.canUse('worker', 'orders.read', locationB)).toBe(false);
    });
    it('organization allow does not silently become location allow', () => {
      const snapshot = fixture();
      const service = new AuthorizationService({
        ...snapshot,
        overrides: [
          override({ ...organization, userId: 'ana', permission: 'staff.read', effect: 'ALLOW' }),
        ],
      });
      expect(service.canUse('ana', 'staff.read', organization)).toBe(true);
      expect(service.canUse('ana', 'staff.read', locationA)).toBe(false);
    });
    it('removed membership and inactive locations revoke access immediately', () => {
      const snapshot = fixture();
      expect(
        new AuthorizationService(changeUser(snapshot, 'worker', { locationIds: [] })).canUse(
          'worker',
          'orders.read',
          locationA,
        ),
      ).toBe(false);
      expect(
        new AuthorizationService({
          ...snapshot,
          locations: snapshot.locations.map((entry) => ({ ...entry, status: 'DISABLED' })),
        }).canUse('primary', 'orders.read', locationA),
      ).toBe(false);
    });
    it('cannot manage self, primary administrator, peers or other organizations', () => {
      const service = new AuthorizationService(fixture());
      for (const operation of [
        'create',
        'update',
        'deactivate',
        'resetPassword',
        'setDelegation',
        'assignPermissions',
      ] as const) {
        expect(service.canManageUser('ana', 'ana', operation)).toBe(false);
        expect(service.canManageUser('ana', 'primary', operation)).toBe(false);
        expect(service.canManageUser('ana', 'peer', operation)).toBe(false);
        expect(service.canManageUser('primary', 'primary', operation)).toBe(false);
        expect(service.canManageUser('primary', 'other', operation)).toBe(false);
      }
    });
    it('allows Ana to create/reset her subordinate with separate operation permissions', () => {
      const service = new AuthorizationService(fixture());
      expect(service.canManageUser('ana', 'worker', 'create')).toBe(true);
      expect(service.canManageUser('ana', 'worker', 'resetPassword')).toBe(true);
      expect(service.canManageUser('ana', 'worker', 'update')).toBe(false);
      expect(service.canManageUser('ana', 'worker', 'assignPermissions')).toBe(true);
      expect(service.canManageUser('ana', 'worker', 'removeDeny')).toBe(false);
      expect(service.canManageUser('ana', 'worker', 'read')).toBe(true);
      expect(service.canManageUser('ana', 'peer', 'read')).toBe(false);
    });
    it('explicit organization management still requires actor membership in every target location', () => {
      const snapshot = fixture();
      const source = override({
        ...organization,
        userId: 'ana',
        permission: 'staff.manage',
        effect: 'ALLOW',
      });
      const scoped = new AuthorizationService({ ...snapshot, overrides: [source] });
      expect(scoped.canManageUser('ana', 'worker', 'update')).toBe(true);
      expect(
        scoped.canManageUser(
          'ana',
          { ...snapshot.users.find((user) => user.id === 'worker')!, locationIds: ['location-b'] },
          'update',
        ),
      ).toBe(false);
    });
    it('refuses credential reset when subordinate also has an unauthorized location', () => {
      const snapshot = changeUser(fixture(), 'worker', {
        locationIds: ['location-a', 'location-b'],
      });
      expect(
        new AuthorizationService(snapshot).canManageUser('ana', 'worker', 'resetPassword'),
      ).toBe(false);
    });
    it('uses explicit management relation, not createdBy or shared membership', () => {
      const snapshot = changeUser(fixture(), 'worker', { managedByUserId: 'primary' });
      const service = new AuthorizationService(snapshot);
      expect(service.canManageUser('ana', 'worker', 'resetPassword')).toBe(false);
      expect(service.canGrant('ana', 'worker', 'orders.read', locationA)).toBe(false);
      expect(service.canUse('worker', 'orders.read', locationA)).toBe(false);
    });
  });
}
