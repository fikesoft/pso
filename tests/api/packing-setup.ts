import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { KitchenTicket, Order, PackingSessionDto } from '../../packages/contracts/src';
import { prepareOperations } from './operations-setup';
import { activate, BrowserSession } from './support/harness';

export async function preparePacking() {
  const f = await prepareOperations();
  const accounts = [];
  for (const [login, permission] of [
    ['packing-reader', 'packing.read'],
    ['packing-operator', 'packing.update'],
    ['packing-finisher', 'packing.complete'],
  ] as const) {
    const { role } = await f.a.primary.expect('/roles', 'POST', {
      name: login,
      permissions: [{ permission }],
    });
    const created = await f.a.primary.expect('/staff', 'POST', {
      login,
      displayName: login,
      locationIds: [f.a.location.id],
      assignments: [
        { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.a.location.id },
      ],
    });
    accounts.push({ login, created });
  }
  const actors = await Promise.all(
    accounts.map(async ({ login, created }) => {
      const session = new BrowserSession('TENANT');
      const { permanent } = await activate(
        session,
        login,
        created.temporaryPassword,
        f.a.company.organization.slug,
      );
      return { session, login, password: permanent, id: created.user.id as string };
    }),
  );
  const { modifierGroup } = await f.a.primary.expect('/catalog/modifier-groups', 'POST', {
    name: 'Adaos istoric',
    minSelections: 0,
    maxSelections: 1,
    sortOrder: 0,
  });
  const { modifierOption } = await f.a.primary.expect(
    `/catalog/modifier-groups/${modifierGroup.id}/options`,
    'POST',
    {
      name: 'Sos sintetic',
      extraPrice: '1.2345',
      sortOrder: 0,
    },
  );
  const binding = (
    await f.a.primary.expect(`/catalog/products/${f.product.id}/modifier-groups`, 'POST', {
      modifierGroupId: modifierGroup.id,
    })
  ).modifierGroup;
  await f.a.primary.expect(
    `/inventory/modifier-recipes/${f.product.id}/${modifierOption.id}`,
    'POST',
    {
      expectedVersion: 0,
      requestKey: randomUUID(),
      reason: 'Adaos fără consum în testul de ambalare',
      components: [],
    },
  );
  async function create(overrides: Record<string, unknown> = {}, ready = true) {
    const { order }: { order: Order } = await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({
        serviceType: 'PICKUP',
        tableLabel: undefined,
        items: [
          {
            productId: f.product.id,
            quantity: '1.250',
            note: 'Notă preparare',
            modifiers: [
              {
                bindingId: binding.id,
                bindingVersion: binding.version,
                groupVersion: binding.group.version,
                optionIds: [modifierOption.id],
              },
            ],
          },
          { productId: f.secondProduct.id, quantity: '2.500' },
        ],
        ...overrides,
      }),
    );
    const { ticket }: { ticket: KitchenTicket } = await f.a.primary.expect(
      `/orders/${order.id}/send`,
      'POST',
      {
        version: order.version,
        requestKey: randomUUID(),
      },
    );
    if (ready)
      for (const [index, status] of ['PREPARING', 'READY'].entries())
        await f.a.primary.expect(`/kitchen/tickets/${ticket.id}`, 'PATCH', {
          version: index + 1,
          status,
        });
    const { sessions }: { sessions: PackingSessionDto[] } = await f.a.primary.expect(
      `/packing/sessions?locationId=${order.locationId}`,
    );
    const session = sessions.find((entry) => entry.orderId === order.id);
    expect(session).toBeDefined();
    return { order, ticket, session: session!, path: `/packing/sessions/${session!.id}/commands` };
  }
  return { ...f, reader: actors[0]!, operator: actors[1]!, finisher: actors[2]!, create };
}
