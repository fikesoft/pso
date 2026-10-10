import { describe, expect, it } from 'vitest';
import {
  createDelegationSchema,
  createOverrideSchema,
  createStaffSchema,
  limitsSchema,
  loginRequestSchema,
  publicUserSchema,
  scopeSchema,
} from '../src/index.js';
const id = '11111111-1111-4111-8111-111111111111';
describe('public contracts', () => {
  it('normalizes the tenant namespace and ASCII login without modifying passwords', () => {
    const result = loginRequestSchema.parse({
      companySlug: ' FIRMA-A ',
      login: ' ANA.S ',
      password: ' NotNormalized ',
    });
    expect(result).toEqual({ companySlug: 'firma-a', login: 'ana.s', password: ' NotNormalized ' });
  });
  it('rejects privilege and provenance fields in a staff creation payload', () => {
    const base = { login: 'worker', displayName: 'Lucrător demo', locationIds: [id] };
    expect(createStaffSchema.safeParse(base).success).toBe(true);
    for (const change of [
      { isPrimaryAdmin: true },
      { authVersion: 0 },
      { delegationGrantId: id },
      { passwordHash: 'hash' },
    ]) {
      expect(createStaffSchema.safeParse({ ...base, ...change }).success).toBe(false);
    }
  });
  it('enforces scope shape and forbids redelegation/platform keys', () => {
    expect(scopeSchema.safeParse({ scopeType: 'LOCATION' }).success).toBe(false);
    expect(scopeSchema.safeParse({ scopeType: 'ORGANIZATION', locationId: id }).success).toBe(
      false,
    );
    const base = {
      userId: id,
      scopeType: 'LOCATION',
      locationId: id,
      permissions: [{ permission: 'orders.read' }],
    };
    expect(createDelegationSchema.safeParse(base).success).toBe(true);
    expect(createDelegationSchema.safeParse({ ...base, canRedelegate: true }).success).toBe(false);
    expect(
      createDelegationSchema.safeParse({ ...base, permissions: [{ permission: 'staff.delegate' }] })
        .success,
    ).toBe(false);
    expect(
      createDelegationSchema.safeParse({ ...base, permissions: [{ permission: 'platform.owner' }] })
        .success,
    ).toBe(false);
  });
  it('permits company-wide DENY of local actions but no company-wide local ALLOW', () => {
    const base = { permission: 'orders.read', scopeType: 'ORGANIZATION' };
    expect(createOverrideSchema.safeParse({ ...base, effect: 'DENY' }).success).toBe(true);
    expect(createOverrideSchema.safeParse({ ...base, effect: 'ALLOW' }).success).toBe(false);
    expect(
      createOverrideSchema.safeParse({ ...base, effect: 'DENY', limits: { maxAmount: '10' } })
        .success,
    ).toBe(false);
  });
  it('uses exact strings for bounds and rejects malformed/invented limits', () => {
    expect(
      limitsSchema.safeParse({ maxAmount: '9007199254740993.01', maxPercent: '100' }).success,
    ).toBe(true);
    expect(limitsSchema.safeParse({ maxAmount: 10 }).success).toBe(false);
    expect(limitsSchema.safeParse({ maxPercent: '100.01' }).success).toBe(false);
    expect(limitsSchema.safeParse({ maxDiscount: '90' }).success).toBe(false);
  });
  it('rejects secret-bearing identity models as public user DTOs', () => {
    const user = {
      id,
      organizationId: id,
      login: 'ana',
      displayName: 'Ana',
      isPrimaryAdmin: false,
      mustChangePassword: false,
      mfaRequired: true,
      mfaEnrolled: true,
    };
    expect(publicUserSchema.safeParse(user).success).toBe(true);
    for (const field of [
      'passwordHash',
      'tokenHash',
      'totpSecret',
      'encryptedSecret',
      'recoveryCodes',
    ]) {
      expect(publicUserSchema.safeParse({ ...user, [field]: 'private' }).success).toBe(false);
    }
  });
});
