import type { TenantTransaction } from '@pos/db';
import type { OrderResponsibilityCommandRequest } from '@pos/contracts/order-responsibilities';
import { paymentSummary } from '../../../entities/order';
import { decimalUnits } from '../../../shared/lib/money';
import { HttpError } from '../../../shared/lib/http';
import type { ResponsibilityOrder, ResponsibilityShift } from './responsibility.types';
export async function validateResponsibilityTransition(
  tx: TenantTransaction,
  actor: string,
  order: ResponsibilityOrder,
  shift: ResponsibilityShift,
  body: OrderResponsibilityCommandRequest,
) {
  const projection = await tx.orderResponsibility.findFirst({ where: { orderId: order.id } });
  if (
    order.version !== body.orderVersion ||
    (projection?.version ?? 0) !== body.responsibilityVersion
  )
    throw new HttpError(
      409,
      'Responsabilitatea sau comanda a fost modificată.',
      'ORDER_RESPONSIBILITY_VERSION_CONFLICT',
    );
  const summary = await paymentSummary(tx, order.id);
  const demo = await tx.checkout.findFirst({ where: { orderId: order.id, mode: 'DEMO' } });
  if (
    order.status === 'DRAFT' ||
    order.status === 'CANCELLED' ||
    demo ||
    decimalUnits(summary.outstandingAmount, 2) <= 0n
  )
    throw new HttpError(
      409,
      'Comanda nu are o datorie eligibilă.',
      'ORDER_RESPONSIBILITY_NOT_ELIGIBLE',
    );
  if (shift.status !== 'OPEN')
    throw new HttpError(409, 'Tura nu mai este deschisă.', 'CASH_SHIFT_NOT_OPEN');
  let valid = false;
  if (body.kind === 'ASSIGN') valid = !projection || projection.state === 'UNASSIGNED';
  if (body.kind === 'PREPARE_HANDOFF') {
    valid = projection?.state === 'ASSIGNED' && projection.shiftId === body.sourceShiftId;
    if ((shift.ownerUserId !== actor) !== Boolean(body.managerReason))
      throw new HttpError(
        400,
        'Motivul managerial este obligatoriu exclusiv pentru tura altui casier.',
        'ORDER_RESPONSIBILITY_MANAGER_REASON_REQUIRED',
      );
  }
  if (body.kind === 'ACCEPT_HANDOFF' && projection?.state === 'PENDING_HANDOFF') {
    const source = await tx.cashShift.findFirst({ where: { id: projection.shiftId! } });
    valid =
      projection.pendingEventId === body.handoffEventId &&
      projection.registerId === shift.registerId &&
      source?.status === 'CLOSED' &&
      source.id !== shift.id;
  }
  if (!valid)
    throw new HttpError(
      409,
      'Starea responsabilității nu permite acțiunea.',
      'ORDER_RESPONSIBILITY_STATE_CONFLICT',
    );
}
