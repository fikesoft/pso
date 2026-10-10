import { randomUUID } from 'node:crypto';
import { prepareOperations } from './operations-setup';
import { bases, BrowserSession, db, fixturePasswords } from './support/harness';
import type { WebsiteActor } from './website.types';

export async function prepareWebsite() {
  const base = await prepareOperations();
  const connection = (
    await base.a.primary.expect('/website/connections', 'POST', {
      locationId: base.a.location.id,
      name: 'Website sintetic',
    })
  ).connection;
  const secondConnection = (
    await base.a.primary.expect('/website/connections', 'POST', {
      locationId: base.otherLocation.id,
      name: 'Website nord',
    })
  ).connection;
  const issue = async (connectionId = connection.id) => {
    const created = await base.a.primary.expect(
      `/website/connections/${connectionId}/keys`,
      'POST',
      { name: 'Cheie backend local' },
    );
    fixturePasswords.add(created.apiKey);
    return created as { apiKey: string; key: { id: string } };
  };
  const credentials = await issue();
  const secondCredentials = await issue(secondConnection.id);
  const createActor = async (name: WebsiteActor, writable: boolean, maxAmount?: string) => {
    const permissions = [
      { permission: 'orders.read' },
      ...(writable
        ? [{ permission: 'orders.create', ...(maxAmount ? { limits: { maxAmount } } : {}) }]
        : []),
    ];
    const role = (
      await base.a.primary.expect('/roles', 'POST', { name: `Website ${name}`, permissions })
    ).role;
    const actor = await base.a.primary.expect('/staff', 'POST', {
      login: `website-${name}`,
      displayName: `Operator ${name}`,
      authenticationMethod: 'PIN',
      locationIds: [base.a.location.id],
      assignments: [
        {
          roleVersionId: role.versions[0].id,
          scopeType: 'LOCATION',
          locationId: base.a.location.id,
        },
      ],
    });
    fixturePasswords.add(actor.pin);
    return actor as { pin: string; user: { id: string } };
  };
  const actors = {
    operator: await createActor('operator', true),
    reader: await createActor('reader', false),
    limited: await createActor('limited', true, '5.00'),
  };
  const login = async (name: WebsiteActor) => {
    const session = new BrowserSession('TENANT');
    await session.expect('/auth/session');
    await session.expect('/auth/pin', 'POST', {
      companySlug: base.a.company.organization.slug,
      pin: actors[name].pin,
    });
    return session;
  };
  const inbound = async (
    path: string,
    method = 'GET',
    body?: unknown,
    requestKey: string = randomUUID(),
    apiKey = credentials.apiKey,
    headers: Record<string, string> = {},
  ) => {
    const response = await fetch(`${bases.TENANT}/api/integrations${path}`, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': requestKey,
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  const order = (overrides: Record<string, unknown> = {}) => ({
    schemaVersion: 1,
    externalOrderId: randomUUID(),
    externalLocationCode: base.a.location.code,
    customer: { name: 'Client sintetic privat', phone: '+37300000123' },
    delivery: { address: 'Adresă privată sintetică 123', instructions: 'Indicație privată' },
    paymentMethod: 'CASH_ON_DELIVERY',
    expectedTotal: '10.01',
    items: [{ externalProductId: base.product.sku, quantity: '1' }],
    ...overrides,
  });
  const stored = (id: string) =>
    db.withTenantTransaction(
      db.runtime,
      { organizationId: base.a.company.organization.id },
      async (tx) => ({
        order: await tx.websiteOrder.findUniqueOrThrow({ where: { id } }),
        items: await tx.websiteOrderItem.findMany({ where: { websiteOrderId: id } }),
        audits: await tx.auditEvent.findMany({ where: { targetId: id } }),
      }),
    );
  return {
    ...base,
    connection,
    secondConnection,
    credentials,
    secondCredentials,
    actors,
    issue,
    login,
    inbound,
    order,
    stored,
  };
}
