import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, TenantTransaction } from '../../src/index';
import { createOperationsFixture } from './operations.fixture';
import type { WebsiteInboundOptions, WebsiteLookupRow } from './website.types';

export async function createWebsiteFixture() {
  const state = await createOperationsFixture();
  const createConnection = (tenant: 'a' | 'b') => {
    const identity = state[tenant];
    const location = tenant === 'a' ? state.locationA : state.locationB;
    const transact = tenant === 'a' ? state.txA : state.txB;
    return transact((tx) =>
      tx.websiteConnection.create({
        data: {
          organizationId: identity.organization.id,
          locationId: location.id,
          name: 'Website sintetic',
          createdByUserId: identity.user.id,
        },
      }),
    );
  };
  const connectionA = await createConnection('a');
  const connectionB = await createConnection('b');
  const createKey = (
    tenant: 'a' | 'b' = 'a',
    changes: Partial<Prisma.WebsiteApiKeyCreateInput> = {},
  ) => {
    const identity = state[tenant];
    const connection = tenant === 'a' ? connectionA : connectionB;
    const transact = tenant === 'a' ? state.txA : state.txB;
    return transact((tx) =>
      tx.websiteApiKey.create({
        data: {
          organizationId: identity.organization.id,
          locationId: connection.locationId,
          connectionId: connection.id,
          name: 'Cheie sintetică',
          secretHash: createHash('sha256').update(randomUUID()).digest('hex'),
          expiresAt: new Date(Date.now() + 86_400_000),
          createdByUserId: identity.user.id,
          ...changes,
        },
      }),
    );
  };
  const keyA = await createKey();
  const keyB = await createKey('b');
  const lookup = (id = keyA.id, hash = keyA.secretHash) =>
    state.auth.$queryRaw<WebsiteLookupRow[]>`
      SELECT pos_auth.lookup_website_key(${id}::uuid,${hash}) AS result`;
  const writeInbound = async (tx: TenantTransaction, options: WebsiteInboundOptions = {}) => {
    const inbox = await tx.websiteOrder.create({
      data: {
        organizationId: state.a.organization.id,
        locationId: state.locationA.id,
        connectionId: connectionA.id,
        createdWithKeyId: keyA.id,
        externalOrderId: randomUUID(),
        requestKey: randomUUID(),
        requestHash: createHash('sha256').update(randomUUID()).digest('hex'),
        total: '10.01',
        customerDataEncrypted: 'opaque-encrypted-synthetic-fixture',
        ...options.header,
      },
    });
    if (!options.omitItems) {
      await tx.websiteOrderItem.create({
        data: {
          organizationId: state.a.organization.id,
          locationId: state.locationA.id,
          websiteOrderId: inbox.id,
          productId: state.catalogA.product.id,
          position: 0,
          productName: state.catalogA.product.name,
          productSku: state.catalogA.product.sku,
          unitPrice: state.price.price,
          quantity: '1.000',
          lineTotal: '10.01',
          ...options.item,
        },
      });
    }
    return inbox;
  };
  const createInbound = (options: WebsiteInboundOptions = {}) =>
    state.txA((tx) => writeInbound(tx, options));
  let orderNumber = 1000;
  const acceptInbound = (
    id: string,
    changes: Partial<Prisma.OrderCreateInput> = {},
    lineChanges: Partial<Prisma.OrderItemCreateManyInput> = {},
  ) =>
    state.txA(async (tx) => {
      const inbox = await tx.websiteOrder.findUniqueOrThrow({ where: { id } });
      const lines = await tx.websiteOrderItem.findMany({ where: { websiteOrderId: id } });
      const order = await tx.order.create({
        data: {
          organizationId: inbox.organizationId,
          locationId: inbox.locationId,
          number: ++orderNumber,
          serviceType: inbox.serviceType,
          source: 'WEB',
          total: inbox.total,
          clientRequestId: randomUUID(),
          creationRequestHash: inbox.requestHash,
          createdByUserId: state.a.user.id,
          updatedByUserId: state.a.user.id,
          ...changes,
        },
      });
      await tx.orderItem.createMany({
        data: lines.map(({ id: _id, websiteOrderId: _websiteOrderId, ...line }) => ({
          ...line,
          sourceWebsiteOrderItemId: _id,
          ...lineChanges,
          orderId: order.id,
        })),
      });
      await tx.websiteOrder.update({
        where: { id },
        data: {
          status: 'ACCEPTED',
          version: { increment: 1 },
          orderId: order.id,
          decisionByUserId: state.a.user.id,
          decidedAt: new Date(),
        },
      });
      return order;
    });
  return {
    ...state,
    connectionA,
    connectionB,
    keyA,
    keyB,
    createKey,
    lookup,
    writeInbound,
    createInbound,
    acceptInbound,
  };
}
