import { prepareResponsibility } from '../../../entities/order-responsibility';
import {
  readCashClaim,
  rejectRetiredCashClaim,
  requireShiftRead,
  lockFinancialOrder,
  requireFinancialShift,
  preflightFinancialShift,
  requireCashAvailable,
} from '../../../entities/cash-shift';
import { refundCashAmount } from './refund-cash';
import type { TenantTransaction } from '@pos/db';
import type { Request } from 'express';
import {
  effectiveKitchenStatus,
  effectiveOrderStatus,
  orderResponse,
  paymentSummary,
} from '../../../entities/order';
import { audit } from '../../../entities/tenant-access';
import type { AccessData } from '../../../entities/tenant-access';
import type { TenantAuthState } from '../../../shared/lib/http';
import { assert } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { decimalUnits, totalAmount } from '../../../shared/lib/money';
import { requirePaymentAccess } from './payment-access';
import { operationResponse } from './operation-response';
import { writeAllocations } from './write-allocations';
import type { PaymentCommand } from './payments.types';

export async function executePayment(
  tx: TenantTransaction,
  access: AccessData,
  auth: TenantAuthState,
  req: Request,
  orderId: string,
  command: PaymentCommand,
) {
  let current = await tx.order.findUnique({ where: { id: orderId } });
  assert(current, 404, 'Comanda nu există');
  const lines = command.kind === 'COLLECT' ? command.body.payments : command.body.refunds;
  const amount = totalAmount(lines.map((line) => line.amount));
  requirePaymentAccess(
    access,
    auth.user.id,
    current.locationId,
    current.total.toFixed(2),
    command.kind === 'COLLECT' ? 'payments.collect' : 'payments.refund',
    amount,
  );
  const hash = requestHash({ orderId, ...command });
  const previous = await tx.paymentOperation.findFirst({
    where: { locationId: current.locationId, requestKey: command.body.requestKey },
  });
  if (previous) {
    assert(
      previous.orderId === orderId && previous.requestHash === hash,
      409,
      'Cheia cererii a fost folosită pentru alte date',
    );
    if (previous.cashShiftId) {
      const claim = await readCashClaim(
        tx,
        {
          locationId: current.locationId,
          orderId,
          requestKey: command.body.requestKey,
          kind: command.kind,
        },
        auth.user.id,
      );
      assert(
        claim?.status === 'SUCCEEDED' && claim.paymentOperationId === previous.id,
        409,
        'Operațiunea nu aparține tentativei curente.',
      );
      requireShiftRead(access.service, access.org.id, auth.user.id, current.locationId);
    }
    return { order: await orderResponse(tx, current), operation: operationResponse(previous) };
  }
  const claim = await readCashClaim(
    tx,
    {
      locationId: current.locationId,
      orderId,
      requestKey: command.body.requestKey,
      kind: command.kind,
    },
    auth.user.id,
  );
  rejectRetiredCashClaim(claim?.status);
  await lockFinancialOrder(tx, current.locationId, orderId);
  current = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  await preflightFinancialShift(
    tx,
    access.service,
    access.org.id,
    auth.user.id,
    current.locationId,
    command.body.cashShiftId,
  );
  await prepareResponsibility(tx, access.org.id, current.locationId, orderId, [
    command.body.cashShiftId,
  ]);
  const shift = await requireFinancialShift(
    tx,
    access.service,
    access.org.id,
    auth.user.id,
    current.locationId,
    command.body.cashShiftId,
  );
  if (command.kind === 'REFUND')
    await requireCashAvailable(
      tx,
      access.org.id,
      shift.id,
      await refundCashAmount(tx, orderId, command.body.refunds),
    );
  assert(current.version === command.body.version, 409, 'Comanda a fost modificată. Reîncărcați.');
  const state = effectiveOrderStatus(current.status, current.kitchenStatus);
  assert(
    state !== 'DRAFT' && state !== 'CANCELLED',
    409,
    'Operațiunile financiare cer o comandă confirmată și neanulată',
  );
  const checkout = await tx.checkout.findFirst({ where: { orderId } });
  assert(checkout?.mode !== 'DEMO', 409, 'Comenzile DEMO nu pot primi încasări sau rambursări');
  const financial = await paymentSummary(tx, orderId);
  const available =
    command.kind === 'COLLECT' ? financial.outstandingAmount : financial.netPaidAmount;
  assert(
    decimalUnits(amount, 2) <= decimalUnits(available, 2),
    409,
    command.kind === 'COLLECT'
      ? 'Suma depășește restul de încasat'
      : 'Suma depășește soldul încasat',
  );
  const operation = await tx.paymentOperation.create({
    data: {
      organizationId: access.org.id,
      cashShiftId: shift.id,
      billPartId: command.kind === 'COLLECT' ? command.billPartId : undefined,
      billCollectionId: command.kind === 'COLLECT' ? command.billCollectionId : undefined,
      locationId: current.locationId,
      orderId,
      requestKey: command.body.requestKey,
      requestHash: hash,
      kind: command.kind,
      orderVersion: current.version + 1,
      amount,
      currency: current.currency,
      actorUserId: auth.user.id,
      reason: command.kind === 'REFUND' ? command.body.reason : null,
    },
  });
  await writeAllocations(tx, operation, command);
  const order = await tx.order.update({
    where: { id: orderId, version: current.version },
    data: {
      version: { increment: 1 },
      updatedByUserId: auth.user.id,
      status: state,
      kitchenStatus: effectiveKitchenStatus(current.kitchenStatus),
    },
  });
  await tx.orderStatusEvent.create({
    data: {
      organizationId: access.org.id,
      locationId: order.locationId,
      orderId,
      kind: 'PAYMENT',
      fromStatus: operation.fromStatus,
      toStatus: operation.toStatus,
      actorUserId: auth.user.id,
      reason: operation.reason,
      orderVersion: operation.orderVersion,
      requestKey: operation.requestKey,
      requestHash: operation.requestHash,
    },
  });
  await audit(
    tx,
    auth,
    req,
    command.kind === 'COLLECT' ? 'payments.collected' : 'payments.refunded',
    'PAYMENT_OPERATION',
    operation.id,
    order.locationId,
  );
  return { order: await orderResponse(tx, order), operation: operationResponse(operation) };
}
