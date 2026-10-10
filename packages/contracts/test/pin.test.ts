import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createStaffSchema, pinLoginSchema, setStaffPinSchema, staffPinSchema } from '../src';

describe('cod PIN individual', () => {
  it('acceptă exemplul alfanumeric și normalizează literele fără a pierde zerourile', () => {
    expect(staffPinSchema.parse(' 6a77ffa33 ')).toBe('6A77FFA33');
    expect(staffPinSchema.parse('000000001')).toBe('000000001');
  });
  it('respinge coduri scurte, caractere ambigue Unicode și câmpuri de identitate injectate', () => {
    for (const pin of ['1234', 'A'.repeat(33), '6A77 FF33', '6Α77FFA33', 'ß777FFA33', 677773333])
      expect(staffPinSchema.safeParse(pin).success).toBe(false);
    expect(
      pinLoginSchema.safeParse({
        companySlug: 'sakura-demo',
        pin: '6A77FFA33',
        userId: randomUUID(),
      }).success,
    ).toBe(false);
    expect(
      setStaffPinSchema.safeParse({ pin: '6A77FFA33', authenticationMethod: 'PIN' }).success,
    ).toBe(false);
  });
  it('separă credentialele PIN și parolă la crearea personalului', () => {
    const worker = { login: 'worker', displayName: 'Lucrător', locationIds: [randomUUID()] };
    expect(createStaffSchema.parse(worker).authenticationMethod).toBe('PASSWORD');
    expect(
      createStaffSchema.safeParse({ ...worker, authenticationMethod: 'PIN', pin: '6A77FFA33' })
        .success,
    ).toBe(true);
    expect(createStaffSchema.safeParse({ ...worker, pin: '6A77FFA33' }).success).toBe(false);
    expect(
      createStaffSchema.safeParse({
        ...worker,
        authenticationMethod: 'PIN',
        password: 'A-password-12345',
      }).success,
    ).toBe(false);
  });
});
