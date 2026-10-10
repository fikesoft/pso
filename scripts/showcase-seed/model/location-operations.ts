import { seedKey } from './record';
import type { SeedLocationContext } from './seed.types';

export async function seedLocationOperations(context: SeedLocationContext) {
  const { record, references, locationIndex, cook, courier } = context;
  const locationId = references.locationIds[locationIndex]!;
  await courier.call(`/couriers/${seedKey(record, `courier:${locationIndex}`)}/commands`, 'POST', {
    action: 'SET_AVAILABILITY',
    locationId,
    version: 1,
    availability: 'AVAILABLE',
    requestKey: seedKey(record, `courier-available:${locationIndex}`),
  });
  for (const [index, code] of ['SUSHI', 'DESERT'].entries())
    await cook.call('/kitchen-stations', 'POST', {
      locationId,
      code,
      name: `${code === 'SUSHI' ? 'Sushi' : 'Deserturi'} · DEMO`,
      sortOrder: index,
      requestKey: seedKey(record, `station:${locationIndex}:${code}`),
    });
  for (const [index, actor] of [
    context.operator,
    context.cashier,
    cook,
    context.stock,
    courier,
  ].entries()) {
    const { shift } = await actor.call<{ shift: { id: string } }>('/attendance/start', 'POST', {
      locationId,
      requestKey: seedKey(record, `attendance:${locationIndex}:${index}`),
    });
    if (index === 1 || index === 4) continue;
    await actor.call(`/attendance/shifts/${shift.id}/action`, 'POST', {
      action: 'START_BREAK',
      version: 1,
      requestKey: seedKey(record, `break:${shift.id}`),
    });
    if (index === 2) continue;
    await actor.call(`/attendance/shifts/${shift.id}/action`, 'POST', {
      action: 'END_BREAK',
      version: 2,
      requestKey: seedKey(record, `break-end:${shift.id}`),
    });
    await actor.call(`/attendance/shifts/${shift.id}/action`, 'POST', {
      action: 'END_SHIFT',
      version: 3,
      requestKey: seedKey(record, `shift-end:${shift.id}`),
    });
  }
}
