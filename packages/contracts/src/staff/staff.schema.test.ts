import { describe, expect, it } from 'vitest';
import { createStaffSchema, updateStaffSchema } from './staff.schema';

describe('employee HR input', () => {
  it('validates actual calendar dates and normalizes email without changing employee codes', () => {
    const base = {
      login: 'worker',
      displayName: 'Lucrător',
      locationIds: ['00000000-0000-4000-8000-000000000001'],
    };
    expect(createStaffSchema.safeParse({ ...base, hireDate: '2026-02-30' }).success).toBe(false);
    expect(createStaffSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false);
    expect(
      createStaffSchema.parse({
        ...base,
        email: ' Employee@Example.Test ',
        employeeCode: ' Ab-12 ',
        hireDate: '2024-02-29',
      }),
    ).toMatchObject({
      email: 'employee@example.test',
      employeeCode: 'Ab-12',
      hireDate: '2024-02-29',
    });
    expect(updateStaffSchema.parse({ version: 1, phone: null, hireDate: null })).toMatchObject({
      phone: null,
      hireDate: null,
    });
  });
});
