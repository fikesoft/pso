import { randomUUID } from 'node:crypto';
import { idSchema, websiteIntegrationOrderSchema } from '@pos/contracts';
import {
  canonicalizeModifierSelections,
  loadProductModifierConfigs,
  resolveProductModifiers,
} from '../../../entities/catalog-modifiers';
import { prepareOrderItems } from '../../../entities/order';
import { requireScheduleAvailability } from '../../../entities/menu-schedule';
import {
  createWebsiteOrderItemModifierSnapshots,
  encryptWebsiteData,
  websiteReceipt,
} from '../../../entities/website-order';
import { assert, HttpError } from '../../../shared/lib/http';
import type { AuthRequest } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { decimalString, decimalUnits } from '../../../shared/lib/money';
import type { IntegrationHandler } from './integration.types';

export const receiveWebsiteOrder: IntegrationHandler = async (tx, context, req) => {
  const requestKey = idSchema.parse(req.get('idempotency-key'));
  const input = websiteIntegrationOrderSchema.parse(req.body);
  const body = {
    ...input,
    items: input.items.map((item) => {
      const { modifiers: _modifiers, ...metadata } = item;
      const modifiers = canonicalizeModifierSelections(item.modifiers);
      return {
        ...metadata,
        quantity: decimalString(decimalUnits(item.quantity, 3), 3),
        ...(modifiers.length ? { modifiers } : {}),
      };
    }),
  };
  assert(
    body.externalLocationCode === context.location.code,
    404,
    'Locația nu este disponibilă pentru această conexiune',
  );
  const hash = requestHash(body);
  const previous = await tx.websiteOrder.findFirst({
    where: { connectionId: context.connection.id, requestKey },
  });
  if (previous) {
    assert(previous.requestHash === hash, 409, 'Cheia cererii a fost folosită pentru alte date');
    return { receipt: websiteReceipt(previous) };
  }
  const existing = await tx.websiteOrder.findFirst({
    where: { connectionId: context.connection.id, externalOrderId: body.externalOrderId },
  });
  assert(!existing, 409, 'Comanda externă există deja. Verificați confirmarea existentă.');
  const products = await tx.product.findMany({
    where: { sku: { in: body.items.map((item) => item.externalProductId) } },
  });
  const inputs = body.items.map((item) => {
    const product = products.find((entry) => entry.sku === item.externalProductId);
    assert(product, 404, 'Un produs nu există în catalogul conexiunii');
    return {
      productId: product.id,
      quantity: item.quantity,
      note: item.note,
      modifiers: item.modifiers,
    };
  });
  const configurations = await loadProductModifierConfigs(
    tx,
    inputs.map((item) => item.productId),
  );
  await requireScheduleAvailability(
    tx,
    context.location.id,
    inputs.map((item) => item.productId),
  );
  const modifierQuotes = new Map(
    inputs.map((item, index) => [
      index,
      resolveProductModifiers(
        configurations.get(item.productId) ?? [],
        body.items[index]!.modifiers,
      ),
    ]),
  );
  const prepared = await prepareOrderItems(tx, context.location.id, inputs, modifierQuotes);
  if (prepared.total !== body.expectedTotal)
    throw new HttpError(
      409,
      'Prețurile s-au schimbat. Reîncărcați catalogul și reconfirmați totalul.',
      'WEBSITE_PRICE_CHANGED',
      { currentTotal: prepared.total, currency: 'MDL' },
    );
  const identity = {
    id: randomUUID(),
    organizationId: context.organizationId,
    locationId: context.location.id,
    connectionId: context.connection.id,
  };
  const order = await tx.websiteOrder.create({
    data: {
      ...identity,
      createdWithKeyId: context.key.id,
      externalOrderId: body.externalOrderId,
      requestKey,
      requestHash: hash,
      total: prepared.total,
      customerDataEncrypted: encryptWebsiteData(identity, {
        customer: body.customer,
        delivery: body.delivery,
        paymentMethod: body.paymentMethod,
      }),
    },
  });
  for (const item of prepared.items) {
    const { modifierGroups, courseNumber: _courseNumber, ...metadata } = item;
    const created = await tx.websiteOrderItem.create({
      data: {
        ...metadata,
        organizationId: context.organizationId,
        locationId: context.location.id,
        websiteOrderId: order.id,
      },
    });
    await createWebsiteOrderItemModifierSnapshots(
      tx,
      context.organizationId,
      context.location.id,
      created.id,
      modifierGroups,
    );
  }
  await tx.auditEvent.create({
    data: {
      organizationId: context.organizationId,
      locationId: context.location.id,
      action: 'website.order.received',
      targetType: 'WEBSITE_ORDER',
      targetId: order.id,
      outcome: 'SUCCESS',
      requestId: (req as AuthRequest).requestId,
      metadata: { connectionId: context.connection.id, keyId: context.key.id },
    },
  });
  return { receipt: websiteReceipt(order) };
};
