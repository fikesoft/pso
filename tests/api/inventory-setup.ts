import { completePacking } from './complete-packing';
import { randomUUID } from 'node:crypto';
import type { InventoryItem } from '../../packages/contracts/src';
import { prepareOperations } from './operations-setup';
import { BrowserSession, db, fixturePasswords } from './support/harness';
import type { InventoryActor } from './inventory.types';

export async function prepareInventory() {
  const base = await prepareOperations();
  const createItem = async (name: string, kind = 'INGREDIENT', unit = 'G') =>
    (
      await base.a.primary.expect('/inventory/items', 'POST', {
        name,
        sku: randomUUID(),
        kind,
        unit,
      })
    ).item as InventoryItem;
  const main = await createItem('Ingredient principal');
  const auxiliary = await createItem('Ingredient auxiliar');
  const packaging = await createItem('Pahar', 'PACKAGING', 'PCS');
  const consumable = await createItem('Șervețel', 'CONSUMABLE', 'PCS');
  const createActor = async (name: InventoryActor, permission: string, scopeType = 'LOCATION') => {
    const role = (
      await base.a.primary.expect('/roles', 'POST', {
        name: `Inventar ${name}`,
        permissions: [{ permission }],
      })
    ).role;
    const actor = await base.a.primary.expect('/staff', 'POST', {
      login: `inventar-${name}`,
      displayName: `Responsabil ${name}`,
      authenticationMethod: 'PIN',
      locationIds: [base.a.location.id],
      assignments: [
        {
          roleVersionId: role.versions[0].id,
          scopeType,
          ...(scopeType === 'LOCATION' ? { locationId: base.a.location.id } : {}),
        },
      ],
    });
    fixturePasswords.add(actor.pin);
    return actor as { pin: string; user: { id: string } };
  };
  const actors = {
    manager: await createActor('manager', 'inventory.manage'),
    reader: await createActor('reader', 'inventory.read'),
    recipes: await createActor('recipes', 'inventory.recipes.manage', 'ORGANIZATION'),
    denied: await createActor('denied', 'inventory.manage'),
  };
  await base.a.primary.expect(`/staff/${actors.denied.user.id}/overrides`, 'POST', {
    permission: 'inventory.manage',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const login = async (name: InventoryActor) => {
    const session = new BrowserSession('TENANT');
    await session.expect('/auth/session');
    await session.expect('/auth/pin', 'POST', {
      companySlug: base.a.company.organization.slug,
      pin: actors[name].pin,
    });
    return session;
  };
  const document = (inventoryItemId: string, overrides: Record<string, unknown> = {}) => ({
    locationId: base.a.location.id,
    inventoryItemId,
    kind: 'RECEIPT',
    quantity: '100',
    reason: 'Document sintetic pentru verificare',
    requestKey: randomUUID(),
    ...overrides,
  });
  const recipe = (overrides: Record<string, unknown> = {}) => ({
    expectedVersion: 0,
    requestKey: randomUUID(),
    reason: 'Rețetă sintetică inițială',
    components: [
      {
        inventoryItemId: main.id,
        purpose: 'MAIN',
        quantityPerUnit: '2.5',
        serviceTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
      },
      {
        inventoryItemId: auxiliary.id,
        purpose: 'AUXILIARY',
        quantityPerUnit: '0.333',
        serviceTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
      },
      {
        inventoryItemId: packaging.id,
        purpose: 'PACKAGING',
        quantityPerUnit: '1',
        serviceTypes: ['TAKEAWAY', 'DELIVERY'],
      },
      {
        inventoryItemId: consumable.id,
        purpose: 'CONSUMABLE',
        quantityPerUnit: '0.5',
        serviceTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
      },
    ],
    ...overrides,
  });
  const send = async (overrides: Record<string, unknown> = {}) => {
    const order = (
      await base.a.primary.expect(
        '/orders',
        'POST',
        base.draft({ items: [{ productId: base.product.id, quantity: '1.234' }], ...overrides }),
      )
    ).order;
    const body = { version: order.version, requestKey: randomUUID() };
    const result = await base.a.primary.expect(`/orders/${order.id}/send`, 'POST', body);
    return { ...result, body };
  };
  const stored = (orderId: string) =>
    db.withTenantTransaction(
      db.runtime,
      { organizationId: base.a.company.organization.id },
      async (tx) => {
        const documents = await tx.inventoryDocument.findMany({ where: { orderId } });
        const reservation = await tx.inventoryReservation.findFirst({ where: { orderId } });
        return {
          reservation,
          lines: reservation
            ? await tx.inventoryReservationLine.findMany({
                where: { reservationId: reservation.id },
              })
            : [],
          documents,
          movements: await tx.inventoryMovement.findMany({
            where: { documentId: { in: documents.map((entry) => entry.id) } },
          }),
        };
      },
    );
  const ready = async (orderId: string, ticketId: string) => {
    await base.a.primary.expect(`/kitchen/tickets/${ticketId}`, 'PATCH', {
      version: 1,
      status: 'PREPARING',
    });
    await base.a.primary.expect(`/kitchen/tickets/${ticketId}`, 'PATCH', {
      version: 2,
      status: 'READY',
    });
    return completePacking(base.a.primary, orderId);
  };
  const finish = async (orderId: string, ticketId: string) => {
    const order = await ready(orderId, ticketId);
    return base.a.primary.expect(`/orders/${orderId}/checkout/demo`, 'POST', {
      version: order.version,
      requestKey: randomUUID(),
    });
  };
  return {
    ...base,
    main,
    auxiliary,
    packaging,
    consumable,
    actors,
    createItem,
    login,
    document,
    recipe,
    send,
    stored,
    ready,
    finish,
  };
}
