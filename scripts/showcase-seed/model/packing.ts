import type { PackingResult, SeedLocationContext } from './seed.types';
import { seedKey } from './record';

export async function seedPacking(
  context: SeedLocationContext,
  orderId: string,
  sessionId: string,
  partial: boolean,
) {
  const { operator, record } = context;
  let { session } = await operator.call<PackingResult>(`/packing/sessions/${sessionId}`);
  if (session.status === 'READY') return;
  const path = `/packing/sessions/${session.id}/commands`;
  if (session.status === 'WAITING') {
    await operator.call(path, 'POST', {
      action: 'START',
      version: session.version,
      requestKey: seedKey(record, `packing-start:${orderId}`),
    });
    ({ session } = await operator.call<PackingResult>(`/packing/sessions/${sessionId}`));
  }
  for (const item of partial ? session.items.slice(0, 1) : session.items) {
    if (item.checked) continue;
    await operator.call(path, 'POST', {
      action: 'CHECK_ITEM',
      version: session.version,
      itemId: item.id,
      checked: true,
      requestKey: seedKey(record, `packing-item:${item.id}`),
    });
    ({ session } = await operator.call<PackingResult>(`/packing/sessions/${sessionId}`));
  }
  if (!partial)
    await operator.call(path, 'POST', {
      action: 'COMPLETE',
      version: session.version,
      requestKey: seedKey(record, `packing-complete:${orderId}`),
    });
}
