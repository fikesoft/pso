import type { EmployeeProfileQuery } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { localDayBoundaries } from '../../../entities/attendance';
import type { AccessData } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { PROFILE_DAY_MS } from '../config/profile.constants';

export async function profileScope(
  tx: TenantTransaction,
  access: AccessData,
  userId: string,
  query: EmployeeProfileQuery,
) {
  const assigned =
    userId === access.org.primaryAdminUserId
      ? access.locations.filter((entry) => entry.status === 'ACTIVE').map((entry) => entry.id)
      : access.access.filter((entry) => entry.userId === userId).map((entry) => entry.locationId);
  assert(!query.locationId || assigned.includes(query.locationId), 403);
  const locationIds = query.locationId ? [query.locationId] : assigned;
  const timezone = query.locationId
    ? access.locations.find((item) => item.id === query.locationId)?.timezone
    : access.org.timezone;
  assert(timezone, 400, 'Fusul orar nu este configurat.');
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const to = query.to ?? today;
  const from =
    query.from ??
    new Date(Date.parse(`${to}T00:00:00Z`) - 29 * PROFILE_DAY_MS).toISOString().slice(0, 10);
  const span = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  assert(
    span >= 0 && span <= 92 * PROFILE_DAY_MS,
    400,
    'Intervalul trebuie să fie de maximum 93 de zile.',
  );
  const dayBoundaries = await localDayBoundaries(tx, from, to, timezone);
  assert(dayBoundaries.length >= 2, 400);
  return {
    assignedLocationIds: assigned,
    locationIds,
    from,
    to,
    timezone,
    dayBoundaries,
    start: dayBoundaries[0]!,
    end: dayBoundaries.at(-1)!,
  };
}
