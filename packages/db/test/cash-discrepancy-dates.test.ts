import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, withTenantTransaction } from '../src';
import { createCashRegisterFixture } from './fixtures/cash-register.fixture';
import { discrepancyFilter } from '../../../apps/api/src/features/cash-discrepancies/model/discrepancy-query';

test('PostgreSQL readonly: filtrul real al raportului la margini DST23/25h', async () => {
  const f = await createCashRegisterFixture();
  try {
    for (const [day, hours] of [
      ['2026-03-29', 23],
      ['2026-10-25', 25],
    ] as const) {
      const context = {
        organizationId: f.a.organization.id,
        actor: f.a.user.id,
        locationId: f.locationA.id,
        closedFrom: day,
        closedTo: day,
        timezone: 'Europe/Chisinau',
        discrepancy: 'ALL' as const,
        limit: 50,
      };
      const rows = await withTenantTransaction(
        f.runtime,
        { organizationId: f.a.organization.id, userId: f.a.user.id },
        (tx) =>
          tx.$queryRaw<Array<{ label: string; hours: string }>>(Prisma.sql`
          WITH bounds AS (SELECT (${day}::date::timestamp AT TIME ZONE 'Europe/Chisinau') AS lo,
            ((${day}::date+1)::timestamp AT TIME ZONE 'Europe/Chisinau') AS hi),
          c AS (SELECT ${f.a.organization.id}::uuid AS "organizationId",${f.locationA.id}::uuid AS "locationId",
            v.label,v.instant AS "closedAt",0::numeric AS difference,(extract(epoch FROM hi-lo)/3600)::text AS hours
            FROM bounds CROSS JOIN LATERAL (VALUES
              ('before',lo-interval '1 millisecond'),('lower',lo),('last',hi-interval '1 millisecond'),('upper',hi)
            ) AS v(label,instant))
          SELECT label,hours FROM c WHERE ${discrepancyFilter(context)} ORDER BY label`),
        { readOnlySnapshot: true },
      );
      assert.deepEqual(
        rows.map((row) => row.label),
        ['last', 'lower'],
      );
      assert.ok(rows.every((row) => Number(row.hours) === hours));
    }
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
