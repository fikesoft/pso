import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeOperations } from './api/operations-setup';
import { prepareWebsite } from './api/website-setup';
import { bases, db } from './api/support/harness';
import { catalogStream } from './api/support/catalog-stream';
import type { WebsiteFixture } from './api/website.types';

let f: WebsiteFixture;
beforeAll(async () => {
  f = await prepareWebsite();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('catalog streams require a backend key and refuse browser credentials and private entrypoints', async () => {
  for (const [headers, status] of [
    [{}, 401],
    [{ authorization: `Bearer ${f.credentials.apiKey}`, origin: 'http://localhost:3002' }, 403],
    [{ authorization: `Bearer ${f.credentials.apiKey}`, cookie: 'session=anything' }, 403],
  ] as const) {
    const response = await fetch(`${bases.TENANT}/api/integrations/catalog/events`, { headers });
    expect(response.status).toBe(status);
    await response.body?.cancel();
  }
  expect((await fetch(`${bases.PLATFORM}/api/integrations/catalog/events`)).status).toBe(404);
});

it('only committed changes for the authorized location cross the stream without identifiers or secrets', async () => {
  const connection = (
    await f.b.primary.expect('/website/connections', 'POST', {
      locationId: f.b.location.id,
      name: 'Website izolat live',
    })
  ).connection;
  const foreignKey = await f.b.primary.expect(
    `/website/connections/${connection.id}/keys`,
    'POST',
    {
      name: 'Cheie live',
    },
  );
  const own = await catalogStream(f.credentials.apiKey);
  const otherLocation = await catalogStream(f.secondCredentials.apiKey);
  const foreign = await catalogStream(foreignKey.apiKey);
  try {
    for (const stream of [own, otherLocation, foreign])
      expect(await stream.next()).toBe('event: changed\ndata: {}');
    await f.a.primary.expect(
      `/catalog/products/${f.product.id}/locations/${f.a.location.id}`,
      'PUT',
      {
        version: f.product.locationVersion,
        price: f.product.price,
        enabled: false,
      },
    );
    expect(await own.next()).toBe('event: changed\ndata: {}');
    await expect(
      db.withTenantTransaction(
        db.runtime,
        {
          organizationId: f.a.company.organization.id,
          userId: f.a.company.organization.primaryAdminUserId,
        },
        async (tx) => {
          await tx.product.update({
            where: { id: f.product.id },
            data: { name: 'Rollback live', version: { increment: 1 } },
          });
          throw new Error('Synthetic rollback');
        },
      ),
    ).rejects.toThrow('Synthetic rollback');
    await new Promise((resolve) => setTimeout(resolve, 150));
    for (const stream of [own, otherLocation, foreign]) expect(stream.messages).toEqual([]);
  } finally {
    await Promise.all([own.close(), otherLocation.close(), foreign.close()]);
  }
});

it('revoked website credentials close before another catalog event is emitted', async () => {
  const issued = await f.issue();
  const stream = await catalogStream(issued.apiKey);
  try {
    await stream.next();
    await f.a.primary.expect(`/website/keys/${issued.key.id}`, 'DELETE');
    await f.a.primary.expect(`/catalog/products/${f.product.id}`, 'PATCH', {
      version: f.product.version,
      name: 'Produs după revocare live',
    });
    expect(await stream.closed()).toBe(true);
    expect(stream.messages).toEqual([]);
  } finally {
    await stream.close();
  }
});
