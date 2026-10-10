import type { TenantTransaction } from '@pos/db';
import type { OrderResponsibilityRowDto } from '@pos/contracts/order-responsibilities';
import type { AccessData } from '../../../entities/tenant-access';
import {
  effectiveKitchenStatus,
  effectiveOrderStatus,
  paymentSummary,
} from '../../../entities/order';
import { decimalUnits } from '../../../shared/lib/money';
import { responsibilityScope } from './responsibility-access';
import type { ResponsibilityOrder } from './responsibility.types';
export async function responsibilityRow(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  order: ResponsibilityOrder,
): Promise<OrderResponsibilityRowDto> {
  const p = await tx.orderResponsibility.findFirst({ where: { orderId: order.id } });
  const pending = p?.pendingEventId
    ? await tx.orderResponsibilityEvent.findUnique({ where: { id: p.pendingEventId } })
    : null;
  const financial = await paymentSummary(tx, order.id);
  const demo = await tx.checkout.findFirst({ where: { orderId: order.id, mode: 'DEMO' } });
  const eligible =
    order.status !== 'DRAFT' &&
    order.status !== 'CANCELLED' &&
    !demo &&
    decimalUnits(financial.outstandingAmount, 2) > 0n;
  const own = await tx.cashShift.findFirst({
    where: { locationId: order.locationId, ownerUserId: actor, status: 'OPEN' },
  });
  const incoming = p?.registerId
    ? await tx.cashShift.findFirst({
        where: {
          locationId: order.locationId,
          ownerUserId: actor,
          registerId: p.registerId,
          status: 'OPEN',
        },
      })
    : null;
  const source = p?.shiftId ? await tx.cashShift.findUnique({ where: { id: p.shiftId } }) : null;
  const scope = responsibilityScope(access, order.locationId);
  const ownRight = access.service.canUse(actor, 'orders.handoff', scope);
  const manageRight =
    access.service.canUse(actor, 'orders.handoff-others', scope) &&
    access.service.canUse(actor, 'cash.reports.read', scope);
  const actions = {
    assign: Boolean(eligible && own && ownRight && (!p || p.state === 'UNASSIGNED')),
    prepare: Boolean(
      eligible &&
        p?.state === 'ASSIGNED' &&
        source?.status === 'OPEN' &&
        (p.ownerUserId === actor ? ownRight : manageRight),
    ),
    accept: Boolean(
      eligible &&
        p?.state === 'PENDING_HANDOFF' &&
        source?.status === 'CLOSED' &&
        incoming &&
        incoming.id !== source.id &&
        ownRight,
    ),
  };
  const disabledReason =
    actions.assign || actions.prepare || actions.accept
      ? null
      : !eligible
        ? 'ORDER_NOT_ELIGIBLE'
        : p?.state === 'PENDING_HANDOFF' && source?.status !== 'CLOSED'
          ? 'SOURCE_NOT_CLOSED'
          : !own && p?.ownerUserId === actor
            ? 'SHIFT_NOT_OPEN'
            : 'PERMISSION_REQUIRED';
  return {
    order: {
      id: order.id,
      number: order.number,
      status: effectiveOrderStatus(order.status, order.kitchenStatus),
      kitchenStatus: effectiveKitchenStatus(
        order.kitchenStatus,
      ) as OrderResponsibilityRowDto['order']['kitchenStatus'],
      serviceType: order.serviceType as OrderResponsibilityRowDto['order']['serviceType'],
      total: order.total.toFixed(2),
      currency: 'MDL',
      outstandingAmount: financial.outstandingAmount,
      version: order.version,
    },
    responsibility: {
      state: (p?.state ?? 'UNASSIGNED') as OrderResponsibilityRowDto['responsibility']['state'],
      version: p?.version ?? 0,
      owner: p?.ownerUserId ? { userId: p.ownerUserId, displayName: p.ownerDisplayName! } : null,
      shift: p?.shiftId
        ? {
            id: p.shiftId,
            registerId: p.registerId!,
            registerCode: p.registerCode!,
            registerName: p.registerName!,
          }
        : null,
      pendingEventId: p?.pendingEventId ?? null,
      preparedAt: pending?.createdAt.toISOString() ?? null,
      preparedReason: pending?.reason ?? null,
    },
    provenance: {
      kind: !p
        ? 'NEVER_ASSIGNED'
        : p.state === 'UNASSIGNED'
          ? 'REFUND_REOPENED'
          : p.state === 'PENDING_HANDOFF'
            ? 'PENDING_HANDOFF'
            : 'EXPLICIT_ASSIGNMENT',
      eventId: p?.lastEventId ?? null,
    },
    actions,
    disabledReason,
  };
}
