import type { ProductScheduleAvailability } from '@pos/contracts';
import {
  MAX_LOCATION_MENU_SCHEDULES,
  MENU_SCHEDULE_UNAVAILABLE,
} from '@pos/contracts/menu-schedules';
import type { TenantTransaction } from '@pos/db';
import { assert, HttpError } from '../../../shared/lib/http';
import { localScheduleTime, scheduleMatches } from './schedule-window';
import { scheduleWindow } from './schedule-response';

export async function loadScheduleAvailability(
  tx: TenantTransaction,
  locationId: string,
  productIds: readonly string[],
  capturedInstant?: Date,
): Promise<Map<string, ProductScheduleAvailability>> {
  const result = new Map<string, ProductScheduleAvailability>();
  const ids = [...new Set(productIds)];
  if (!ids.length) return result;
  const [location, schedules, timestamps] = await Promise.all([
    tx.location.findUnique({ where: { id: locationId } }),
    tx.menuSchedule.findMany({
      where: { locationId, status: 'ACTIVE' },
      take: MAX_LOCATION_MENU_SCHEDULES + 1,
    }),
    capturedInstant
      ? Promise.resolve([{ instant: capturedInstant }])
      : tx.$queryRaw<{ instant: Date }[]>`SELECT statement_timestamp() AS instant`,
  ]);
  assert(location, 404, 'Locația nu există');
  assert(
    schedules.length <= MAX_LOCATION_MENU_SCHEDULES,
    413,
    'Locația are prea multe programe de meniu active.',
  );
  const instant = timestamps[0]!.instant;
  const checkedAt = instant.toISOString();
  const local = localScheduleTime(instant, location.timezone);
  const matching = new Set(
    schedules
      .filter((schedule) => scheduleMatches(scheduleWindow(schedule), local))
      .map((schedule) => schedule.id),
  );
  const bindings = schedules.length
    ? await tx.menuScheduleProduct.findMany({
        where: {
          menuScheduleId: { in: schedules.map((schedule) => schedule.id) },
          productId: { in: ids },
        },
      })
    : [];
  for (const id of ids) {
    const rules = bindings.filter((binding) => binding.productId === id);
    result.set(id, {
      available: !rules.length || rules.some((rule) => matching.has(rule.menuScheduleId)),
      scheduled: !!rules.length,
      checkedAt,
    });
  }
  return result;
}

export async function requireScheduleAvailability(
  tx: TenantTransaction,
  locationId: string,
  productIds: readonly string[],
) {
  const availability = await loadScheduleAvailability(tx, locationId, productIds);
  if ([...availability.values()].some((value) => !value.available))
    throw new HttpError(
      409,
      'Un produs nu este disponibil în programul curent al locației. Reîncărcați meniul.',
      MENU_SCHEDULE_UNAVAILABLE,
    );
}
