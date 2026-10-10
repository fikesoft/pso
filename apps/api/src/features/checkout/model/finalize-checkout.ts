import { prepareResponsibility } from '../../../entities/order-responsibility';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import {
  readCashClaim,
  rejectRetiredCashClaim,
  requireShiftRead,
  lockFinancialOrder,
  requireFinancialShift,
  preflightFinancialShift,
} from '../../../entities/cash-shift';
import { consumeOrder } from '../../../entities/inventory';
import type { TenantTransaction } from '@pos/db';
import type { Request } from 'express';
import { effectiveOrderStatus, orderResponse, receiptResponse } from '../../../entities/order';
import type { AccessData } from '../../../entities/tenant-access';
import { audit } from '../../../entities/tenant-access';
import type { TenantAuthState } from '../../../shared/lib/http';
import { assert } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { checkoutAmounts } from './checkout-amounts';
import { requireCheckoutAccess } from './checkout-authorization';
import type { CheckoutCommand } from './checkout.types';

export async function finalizeCheckout(
  tx: TenantTransaction,
  access: AccessData,
  auth: TenantAuthState,
  req: Request,
  orderId: string,
  command: CheckoutCommand,
) {
  validateIdempotencyHeader(req.headers['idempotency-key'], command.body.requestKey);
  let current = await tx.order.findUnique({ where: { id: orderId } });
  assert(current, 404, 'Comanda nu există');
  requireCheckoutAccess(access, auth.user.id, current, command.mode);
  const hash = requestHash({ orderId, mode: command.mode, ...command.body });
  const previous = await tx.checkout.findFirst({
    where: {
      locationId: current.locationId,
      requestKey: command.body.requestKey,
    },
  });
  if (previous) {
    assert(
      previous.orderId === orderId && previous.requestHash === hash,
      409,
      'Cheia cererii a fost folosită pentru alte date',
    );
    const replayClaim = await tx.cashCommandClaim.findFirst({
      where: {
        locationId: current.locationId,
        family: 'CHECKOUT',
        requestKey: command.body.requestKey,
      },
    });
    if (previous.mode === 'DEMO' && replayClaim) {
      assert(
        replayClaim.status === 'SUCCEEDED' &&
          replayClaim.kind === 'CHECKOUT_DEMO' &&
          replayClaim.actorUserId === auth.user.id &&
          replayClaim.orderId === orderId &&
          replayClaim.checkoutId === previous.id,
        409,
        'Operațiunea nu aparține tentativei curente.',
      );
    }
    if (previous.cashShiftId) {
      const claim = await readCashClaim(
        tx,
        {
          locationId: current.locationId,
          orderId,
          requestKey: command.body.requestKey,
          kind: 'CHECKOUT_MANUAL',
        },
        auth.user.id,
      );
      assert(
        claim?.status === 'SUCCEEDED' && claim.checkoutId === previous.id,
        409,
        'Operațiunea nu aparține tentativei curente.',
      );
      if (previous.cashShiftId)
        requireShiftRead(access.service, access.org.id, auth.user.id, current.locationId);
    }
    return {
      order: await orderResponse(tx, current),
      receipt: await receiptResponse(tx, previous),
    };
  }
  const pendingClaim = await tx.cashCommandClaim.findFirst({
    where: {
      locationId: current.locationId,
      family: 'CHECKOUT',
      requestKey: command.body.requestKey,
    },
  });
  rejectRetiredCashClaim(pendingClaim?.status);
  assert(!pendingClaim, 409, 'Cheia cererii aparține altei operațiuni.');
  await lockFinancialOrder(tx, current.locationId, orderId);
  current = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  if (command.mode === 'MANUAL')
    await preflightFinancialShift(
      tx,
      access.service,
      access.org.id,
      auth.user.id,
      current.locationId,
      command.body.cashShiftId,
    );
  await prepareResponsibility(tx, access.org.id, current.locationId, orderId, [
    command.mode === 'MANUAL' ? command.body.cashShiftId : null,
  ]);
  const shift =
    command.mode === 'MANUAL'
      ? await requireFinancialShift(
          tx,
          access.service,
          access.org.id,
          auth.user.id,
          current.locationId,
          command.body.cashShiftId,
        )
      : null;
  const finalized = await tx.checkout.findFirst({ where: { orderId } });
  assert(!finalized, 409, 'Comanda este deja finalizată. Deschideți bonul existent.');
  assert(
    !(await tx.paymentOperation.findFirst({ where: { orderId } })),
    409,
    'Comanda are operațiuni financiare. Folosiți încasările și finalizarea independente.',
  );
  assert(
    effectiveOrderStatus(current.status, current.kitchenStatus) === 'READY',
    409,
    'Comanda trebuie trimisă, preparată și verificată înainte de finalizare',
  );
  assert(current.version === command.body.version, 409, 'Comanda a fost modificată. Reîncărcați.');
  const location = access.locations.find((entry) => entry.id === current.locationId);
  assert(location, 404, 'Locația nu există');
  const amounts = checkoutAmounts(command, current.total.toFixed(2));
  const checkout = await tx.checkout.create({
    data: {
      organizationId: access.org.id,
      cashShiftId: shift?.id ?? null,
      locationId: current.locationId,
      orderId,
      requestKey: command.body.requestKey,
      requestHash: hash,
      mode: command.mode,
      ...amounts,
      currency: current.currency,
      total: current.total,
      companyName: access.org.name,
      locationName: location.name,
      locationCode: location.code,
      cashierName: access.currentUser.displayName,
      createdByUserId: auth.user.id,
    },
  });
  if (command.mode === 'MANUAL') {
    await tx.payment.create({
      data: {
        organizationId: access.org.id,
        locationId: current.locationId,
        orderId,
        checkoutId: checkout.id,
        cashShiftId: checkout.cashShiftId,
        amount: current.total,
        currency: current.currency,
        method: command.body.method,
        origin: 'MANUAL',
        confirmedByUserId: auth.user.id,
      },
    });
  }
  const order = await tx.order.update({
    where: { id: orderId },
    data: {
      status: 'COMPLETED',
      version: { increment: 1 },
      updatedByUserId: auth.user.id,
    },
  });
  const consumption = await consumeOrder(tx, {
    organizationId: access.org.id,
    locationId: current.locationId,
    orderId,
    requestKey: command.body.requestKey,
    requestHash: hash,
    actorUserId: auth.user.id,
    actorName: access.currentUser.displayName,
  });
  if (consumption) {
    await audit(
      tx,
      auth,
      req,
      'inventory.consumption',
      'INVENTORY_DOCUMENT',
      consumption.id,
      current.locationId,
    );
  }
  await tx.orderStatusEvent.create({
    data: {
      organizationId: access.org.id,
      locationId: current.locationId,
      orderId,
      kind: 'ORDER',
      fromStatus: 'READY',
      toStatus: 'COMPLETED',
      actorUserId: auth.user.id,
    },
  });
  await audit(
    tx,
    auth,
    req,
    command.mode === 'DEMO' ? 'checkout.demo' : 'checkout.manual',
    'CHECKOUT',
    checkout.id,
    current.locationId,
  );
  return { order: await orderResponse(tx, order), receipt: await receiptResponse(tx, checkout) };
}
