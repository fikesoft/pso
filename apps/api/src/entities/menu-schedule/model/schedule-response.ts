import type { MenuSchedule, MenuScheduleWindow } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import type { StoredMenuSchedule } from './menu-schedule.types';

export function scheduleWindow(schedule: StoredMenuSchedule): MenuScheduleWindow {
  return {
    weekdays: schedule.weekdays,
    startMinute: schedule.startMinute,
    endMinute: schedule.endMinute,
    startsOn: schedule.startsOn?.toISOString().slice(0, 10) ?? null,
    endsOn: schedule.endsOn?.toISOString().slice(0, 10) ?? null,
  };
}

export async function menuScheduleResponses(
  tx: TenantTransaction,
  schedules: readonly StoredMenuSchedule[],
): Promise<MenuSchedule[]> {
  const bindings = schedules.length
    ? await tx.menuScheduleProduct.findMany({
        where: { menuScheduleId: { in: schedules.map((schedule) => schedule.id) } },
        orderBy: { productId: 'asc' },
      })
    : [];
  const products = bindings.length
    ? await tx.product.findMany({
        where: { id: { in: [...new Set(bindings.map((binding) => binding.productId))] } },
        select: { id: true, name: true },
      })
    : [];
  const productById = new Map(products.map((product) => [product.id, product]));
  const idsBySchedule = new Map<string, string[]>();
  for (const binding of bindings) {
    const ids = idsBySchedule.get(binding.menuScheduleId) ?? [];
    ids.push(binding.productId);
    idsBySchedule.set(binding.menuScheduleId, ids);
  }
  return schedules.map((schedule) => ({
    ...scheduleWindow(schedule),
    id: schedule.id,
    locationId: schedule.locationId,
    name: schedule.name,
    eventName: schedule.eventName,
    status: schedule.status as MenuSchedule['status'],
    version: schedule.version,
    productIds: idsBySchedule.get(schedule.id) ?? [],
    products: (idsBySchedule.get(schedule.id) ?? []).flatMap((id) => {
      const product = productById.get(id);
      return product ? [product] : [];
    }),
  }));
}
