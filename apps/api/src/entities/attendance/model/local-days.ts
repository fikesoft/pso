import { Prisma } from '@pos/db';
import type { TenantTransaction } from '@pos/db';
import { businessDateSchema } from '@pos/contracts';
import { HttpError } from '../../../shared/lib/http';

/** PostgreSQL resolves each local midnight with the configured IANA timezone, including DST days. */
export async function localDayBoundaries(
  tx: TenantTransaction,
  from: string,
  to: string,
  timezone: string,
): Promise<Date[]> {
  if (!businessDateSchema.safeParse(from).success || !businessDateSchema.safeParse(to).success)
    throw new HttpError(400, 'Data este în afara intervalului acceptat.');
  const first = Date.parse(`${from}T00:00:00Z`);
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - first) / 86_400_000);
  if (days < 0 || days > 365)
    throw new HttpError(400, 'Intervalul de zile este invalid sau prea lung.');
  const count = days + 2;
  const dates = Array.from({ length: count }, (_, index) =>
    new Date(first + index * 86_400_000).toISOString().slice(0, 10),
  );
  const rows = await tx.$queryRaw<Array<{ day: string; boundary: Date }>>`
    SELECT day::text AS day, (day::timestamp AT TIME ZONE ${timezone}) AS boundary
    FROM unnest(ARRAY[${Prisma.join(dates)}]::date[]) AS dates(day)
    ORDER BY day`;
  return rows.map((row) => row.boundary);
}
