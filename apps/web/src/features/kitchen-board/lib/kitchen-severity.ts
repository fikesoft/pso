import { kitchenAlertSeverity } from '@pos/contracts/kitchen-alerts';
import type { KitchenAlertSeverity, KitchenTicket } from '@pos/contracts';
import { kitchenElapsed } from './kitchen-time';

export function kitchenItemsSeverity(
  items: KitchenTicket['items'],
  elapsedSeconds?: number,
): KitchenAlertSeverity | undefined {
  if (elapsedSeconds === undefined || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0)
    return undefined;
  let severity: KitchenAlertSeverity = 'NORMAL';
  for (const item of items) {
    const candidate = kitchenAlertSeverity(elapsedSeconds, item.alertThresholds);
    if (candidate === 'CRITICAL') return candidate;
    if (candidate === 'WARNING') severity = candidate;
  }
  return severity;
}

export function kitchenBatchElapsed(batch: KitchenTicket['batches'][number], now?: number) {
  return batch.firedAt === null || batch.status === 'READY' || batch.status === 'CANCELLED'
    ? undefined
    : kitchenElapsed(batch.firedAt, undefined, now);
}

export function kitchenTicketSeverity(
  ticket: KitchenTicket,
  batches: KitchenTicket['batches'],
  now?: number,
): KitchenAlertSeverity | undefined {
  if (ticket.status === 'READY' || ticket.status === 'CANCELLED') return undefined;
  let severity: KitchenAlertSeverity | undefined;
  for (const batch of batches) {
    const candidate = kitchenItemsSeverity(
      ticket.items.filter((item) => batch.ticketItemIds.includes(item.id)),
      kitchenBatchElapsed(batch, now),
    );
    if (candidate === 'CRITICAL') return candidate;
    if (candidate === 'WARNING' || !severity) severity = candidate;
  }
  return severity;
}
