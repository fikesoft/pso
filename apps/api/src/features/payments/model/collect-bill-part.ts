import { prepareResponsibility } from '../../../entities/order-responsibility';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { TenantTransaction } from '@pos/db';
import type { BillCollectionRequest } from '@pos/contracts';
import type { AccessData } from '../../../entities/tenant-access';
import { audit } from '../../../entities/tenant-access';
import {
  checkpointCashEffects,
  preflightFinancialShift,
  requireShiftRead,
} from '../../../entities/cash-shift';
import type { TenantAuthState } from '../../../shared/lib/http';
import { assert } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { decimalUnits, decimalString } from '../../../shared/lib/money';
import { billPaymentPreview, requireBillCollectionAmount } from './bill-payment-access';
import { billCollectionResponse } from './bill-collection-response';
import { executePayment } from './execute-payment';
export async function collectBillPart(
  tx: TenantTransaction,
  access: AccessData,
  auth: TenantAuthState,
  req: Request,
  partId: string,
  body: BillCollectionRequest,
) {
  body.sources.sort((a, b) => a.orderId.localeCompare(b.orderId));
  const initial = await billPaymentPreview(tx, access, auth.user.id, body.locationId, partId);
  const hash = requestHash({ organizationId: access.org.id, actor: auth.user.id, partId, ...body });
  const previous = await tx.billCollection.findFirst({
    where: { locationId: body.locationId, requestKey: body.requestKey },
  });
  requireShiftRead(access.service, access.org.id, auth.user.id, body.locationId);
  requireBillCollectionAmount(access, auth.user.id, body.locationId, body.amount);
  if (previous) {
    assert(
      previous.partId === partId && previous.actorUserId === auth.user.id,
      409,
      'Cheia aparține altei operațiuni sau altui operator.',
    );
    assert(
      previous.status === 'SUCCEEDED',
      409,
      'Tentativa a fost retrasă. Inițiați o operațiune nouă.',
    );
    assert(previous.requestHash === hash, 409, 'Cheia cererii a fost folosită pentru alte date.');
    return billCollectionResponse(tx, previous.id);
  }
  for (const source of initial.sources)
    await tx.$executeRaw`SELECT public.prepare_bill_order(${access.org.id}::uuid,${body.locationId}::uuid,${source.orderId}::uuid)`;
  const current = await billPaymentPreview(tx, access, auth.user.id, body.locationId, partId);
  assert(
    JSON.stringify(body.sources) ===
      JSON.stringify(current.sources.map(({ orderId, version }) => ({ orderId, version }))),
    409,
    'Comenzile au fost modificate. Reîncărcați nota.',
  );
  assert(
    decimalUnits(body.amount, 2) === decimalUnits(current.outstandingAmount, 2) &&
      decimalUnits(body.amount, 2) > 0n,
    409,
    'Soldul părții a fost modificat. Reîncărcați nota.',
  );
  const received =
    body.payment.method === 'CASH'
      ? decimalUnits(body.payment.receivedAmount, 2)
      : decimalUnits(body.amount, 2);
  const change = received - decimalUnits(body.amount, 2);
  assert(change >= 0n, 400, 'Numerarul primit este mai mic decât suma încasată.');
  await preflightFinancialShift(
    tx,
    access.service,
    access.org.id,
    auth.user.id,
    body.locationId,
    body.cashShiftId,
  );
  const due = current.sources.filter((source) => decimalUnits(source.outstandingAmount, 2) > 0n);
  const responsibilities = await tx.orderResponsibility.findMany({
    where: {
      locationId: body.locationId,
      orderId: { in: current.sources.map((source) => source.orderId) },
    },
  });
  // Lock the union of registers/shifts before the first payment takes a financial lock.
  await prepareResponsibility(tx, access.org.id, body.locationId, due[0]!.orderId, [
    body.cashShiftId,
    ...responsibilities.map((row) => row.shiftId),
  ]);
  const collection = await tx.billCollection.create({
    data: {
      organizationId: access.org.id,
      locationId: body.locationId,
      partId,
      requestKey: body.requestKey,
      actorUserId: auth.user.id,
      status: 'SUCCEEDED',
      requestHash: hash,
      amount: body.amount,
      method: body.payment.method,
      receivedAmount: decimalString(received, 2),
      cashShiftId: body.cashShiftId,
      operationCount: due.length,
    },
  });
  for (const [index, source] of due.entries()) {
    const amount = source.outstandingAmount;
    const payment =
      body.payment.method === 'CARD'
        ? { method: 'CARD' as const, amount }
        : {
            method: 'CASH' as const,
            amount,
            receivedAmount: decimalString(decimalUnits(amount, 2) + (index === 0 ? change : 0n), 2),
          };
    await executePayment(tx, access, auth, req, source.orderId, {
      kind: 'COLLECT',
      billPartId: partId,
      billCollectionId: collection.id,
      body: {
        version: source.version,
        requestKey: randomUUID(),
        cashShiftId: body.cashShiftId,
        confirmed: true,
        payments: [payment],
      },
    });
    await checkpointCashEffects(tx);
  }
  await audit(
    tx,
    auth,
    req,
    'bill.part.collected',
    'BILL_COLLECTION',
    collection.id,
    body.locationId,
  );
  return billCollectionResponse(tx, collection.id);
}
