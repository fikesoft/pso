import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { prepareOperations, closeOperations } from './api/operations-setup';
import { deliveryZoneProfile } from '../packages/db/test/fixtures/delivery-zone.fixture';
import { noSecrets } from './api/support/harness';
let f: Awaited<ReturnType<typeof prepareOperations>>;
beforeAll(async () => {
  f = await prepareOperations();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
const body = () => ({
  locationId: f.a.location.id,
  destination: { latitude: 47.02, longitude: 28.83 },
  subtotal: '100.00',
});
it('previzualizarea locală distinge configurația absentă, tariful, minimul și gratuitatea', async () => {
  const endpoint = '/delivery-zones/fee-preview';
  expect((await f.a.primary.expect(endpoint, 'POST', body())).result).toEqual({
    status: 'NOT_CONFIGURED',
  });
  const zoneId = randomUUID();
  await f.a.primary.expect(`/delivery-zones/${zoneId}/commands`, 'POST', {
    action: 'CREATE',
    locationId: f.a.location.id,
    requestKey: randomUUID(),
    profile: deliveryZoneProfile(),
  });
  const response = await f.a.primary.call(endpoint, 'POST', body());
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.data.result).toMatchObject({
    status: 'AVAILABLE',
    zoneId,
    zoneVersion: 1,
    fee: '25.00',
    total: '125.00',
  });
  expect(response.data.timezone).toBe('Europe/Chisinau');
  expect(Number.isFinite(Date.parse(response.data.asOf))).toBe(true);
  expect(
    (await f.a.primary.expect(endpoint, 'POST', { ...body(), subtotal: '99.99' })).result.status,
  ).toBe('MINIMUM_NOT_MET');
  expect(
    (await f.a.primary.expect(endpoint, 'POST', { ...body(), subtotal: '300.00' })).result,
  ).toMatchObject({ fee: '0.00', total: '300.00' });
  expect(
    (
      await f.a.primary.expect(endpoint, 'POST', {
        ...body(),
        destination: { latitude: 48, longitude: 28 },
      })
    ).result.status,
  ).toBe('OUTSIDE_ZONE');
  await f.a.primary.expect(`/delivery-zones/${zoneId}/commands`, 'POST', {
    action: 'ARCHIVE',
    locationId: f.a.location.id,
    requestKey: randomUUID(),
    version: 1,
  });
  expect((await f.a.primary.expect(endpoint, 'POST', body())).result.status).toBe('OUTSIDE_ZONE');
  noSecrets(response.data);
});
it('operatorul poate previzualiza fără administrarea zonelor, numai în locația autorizată', async () => {
  const endpoint = '/delivery-zones/fee-preview';
  expect((await f.worker.call(`/delivery-zones?locationId=${f.a.location.id}`)).status).toBe(403);
  expect((await f.worker.expect(endpoint, 'POST', body())).locationId).toBe(f.a.location.id);
  for (const locationId of [f.otherLocation.id, f.b.location.id])
    expect((await f.worker.call(endpoint, 'POST', { ...body(), locationId })).status).toBe(403);
  expect(
    (
      await f.worker.call(endpoint, 'POST', {
        ...body(),
        organizationId: f.b.company.organization.id,
      })
    ).status,
  ).toBe(400);
  expect((await f.worker.call(endpoint, 'POST', { ...body(), subtotal: '-1.00' })).status).toBe(
    400,
  );
});
