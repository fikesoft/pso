import { withTenantTransaction } from '../../../packages/db/src/index';
import { SHOWCASE, ORDER_SCENARIOS } from '../config/seed.constants';
import { SHOWCASE_MENU } from '../config/menu.constants';
import { seedKey } from './record';
import { assertIdentity, readIdentity } from './provision';
import type { SeedClients, SeedRecord } from './seed.types';

export async function verifyShowcaseSeed(clients: SeedClients, record: SeedRecord) {
  const owner = await clients.platform.platformAdmin.findUnique({
    where: { id: record.platform.id },
  });
  if (owner?.loginNormalized !== record.platform.login)
    throw new Error('Contul platformei din seed lipsește.');
  for (const [index] of record.companies.entries()) {
    const identity = await readIdentity(clients, record, index);
    if (!identity) throw new Error('O companie din manifest lipsește. Nu o recreez.');
    assertIdentity(identity, record, index);
    await withTenantTransaction(
      clients.runtime,
      { organizationId: identity.organization.id },
      async (tx) => {
        const marker = await tx.auditEvent.findFirst({
          where: {
            action: index === 0 ? 'showcase.base.complete' : 'showcase.empty.complete',
            requestId: record.id,
          },
        });
        if (!marker) throw new Error('Configurarea seedului este incompletă.');
        if (index !== 0) return;
        const users = await tx.companyUser.findMany({
          where: { id: { in: record.users.map((u) => u.id) } },
        });
        if (
          users.length !== record.users.length ||
          record.users.some(
            (u) =>
              !users.some((current) => current.id === u.id && current.loginNormalized === u.login),
          )
        )
          throw new Error('Un lucrător din seed lipsește. Nu îi refac accesul.');
        if (
          (await tx.product.count({ where: { sku: { in: SHOWCASE_MENU.map((p) => p.sku) } } })) !==
          SHOWCASE_MENU.length
        )
          throw new Error('Un produs din seed lipsește. Nu îl recreez.');
        const keys = SHOWCASE.locations.flatMap((_, location) =>
          Array.from({ length: SHOWCASE.cycles * ORDER_SCENARIOS.length }, (_, order) =>
            seedKey(record, `order:${location}:${order}`),
          ),
        );
        if (
          (await tx.order.count({ where: { clientRequestId: { in: keys } } })) !== keys.length ||
          (await tx.auditEvent.count({
            where: { action: 'showcase.order.complete', requestId: { in: keys } },
          })) !== keys.length
        )
          throw new Error('Comenzile de exercițiu nu sunt toate confirmate.');
      },
      { readOnlySnapshot: true },
    );
  }
}
