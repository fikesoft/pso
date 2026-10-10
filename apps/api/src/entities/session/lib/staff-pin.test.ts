import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { safeUser } from '../model/public-identity';
import { generateStaffPin, normalizeStaffPin, staffPinLookup } from './staff-pin';

vi.mock('../../../shared/config', () => ({
  config: { CSRF_SECRET: 'synthetic-unit-test-key'.repeat(3) },
}));

describe('staff PIN credentials', () => {
  it('generates independent 12-character uppercase hexadecimal codes', () => {
    const pins = Array.from({ length: 20 }, () => generateStaffPin());
    expect(new Set(pins).size).toBe(pins.length);
    for (const pin of pins) expect(pin).toMatch(/^[A-F0-9]{12}$/);
  });

  it('normalizes input and binds its lookup to the company and PIN domain', () => {
    const pin = 'ABC123XYZ';
    const lookup = staffPinLookup('companie-a', pin);
    expect(normalizeStaffPin(' abc123xyz ')).toBe(pin);
    expect(staffPinLookup(' COMPANIE-A ', ' abc123xyz ')).toBe(lookup);
    expect(staffPinLookup('companie-b', pin)).not.toBe(lookup);
    expect(lookup).toMatch(/^[a-f0-9]{64}$/);
    expect(lookup).not.toContain(pin);
    const csrfDigest = createHmac('sha256', 'synthetic-unit-test-key'.repeat(3))
      .update(pin)
      .digest('hex');
    expect(lookup).not.toBe(csrfDigest);
  });

  it('exposes the authentication method without credential material in user DTOs', () => {
    const user = safeUser({
      id: 'synthetic-user',
      loginNormalized: 'worker',
      displayName: 'Lucrător',
      status: 'ACTIVE',
      authenticationMethod: 'PIN',
      authVersion: 1,
      passwordHash: 'synthetic-password-hash',
      pinHash: 'synthetic-pin-hash',
      pinLookup: 'synthetic-pin-lookup',
      mustChangePassword: false,
      mfaRequired: false,
    });
    expect(user.authenticationMethod).toBe('PIN');
    expect(JSON.stringify(user)).not.toMatch(/Hash|Lookup|synthetic-password|synthetic-pin/);
  });
});
