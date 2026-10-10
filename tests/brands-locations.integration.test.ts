import { beforeAll, expect, it } from 'vitest';
import { prepareFoundationScenario } from './api/foundation-setup';
import type { AwaitedReturn } from './api/brands-locations.types';

let fixture: AwaitedReturn<typeof prepareFoundationScenario>;
beforeAll(async () => {
  fixture = await prepareFoundationScenario();
}, 60_000);

it('brandurile și metadatele locației respectă autorizarea, tenantul și versiunea', async () => {
  const { primary, primaryB, ana, locA, companyA } = fixture;
  expect((await ana.call('/brands', 'POST', { name: 'Interzis', code: 'NO' })).status).toBe(403);
  const brand = (await primary.expect('/brands', 'POST', { name: 'Sushi', code: 'sushi' })).brand;
  expect(brand).toMatchObject({
    organizationId: companyA.organization.id,
    code: 'SUSHI',
    status: 'ACTIVE',
    version: 1,
  });
  expect((await primaryB.expect('/brands')).brands).not.toContainEqual(
    expect.objectContaining({ id: brand.id }),
  );
  expect(
    (await primaryB.call(`/brands/${brand.id}`, 'PATCH', { name: 'Fals', version: 1 })).status,
  ).toBe(404);
  expect(
    (
      await primary.call('/locations', 'POST', {
        name: 'Fals',
        code: 'FOREIGN',
        brandId: crypto.randomUUID(),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await primary.call('/locations', 'POST', {
        name: 'Coordonate incomplete',
        code: 'ONLY_LAT',
        latitude: '47.010456',
      })
    ).status,
  ).toBe(400);
  const location = (
    await primary.expect(`/locations/${locA.id}`, 'PATCH', {
      version: locA.version,
      brandId: brand.id,
      phone: '+373 22 123 456',
      latitude: '47.010456',
      longitude: '28.863811',
      businessHours: [{ day: 1, opensAt: '22:00', closesAt: '02:00' }],
    })
  ).location;
  expect(location).toMatchObject({
    brandId: brand.id,
    latitude: '47.010456',
    longitude: '28.863811',
  });
  expect(
    (
      await primary.call(`/locations/${locA.id}`, 'PATCH', {
        version: location.version,
        longitude: null,
      })
    ).status,
  ).toBe(400);
  expect(
    (await primary.expect('/context')).locations.find(
      (entry: { id: string }) => entry.id === locA.id,
    ).businessHours,
  ).toEqual([{ day: 1, opensAt: '22:00', closesAt: '02:00' }]);
  expect(
    (
      await primary.call(`/locations/${locA.id}`, 'PATCH', {
        version: locA.version,
        phone: '+373 22 000 000',
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await primary.call(`/brands/${brand.id}`, 'PATCH', {
        status: 'DISABLED',
        version: brand.version,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await primary.call(`/locations/${locA.id}`, 'PATCH', {
        version: location.version,
        businessHours: [{ day: 1, opensAt: '10:00', closesAt: '10:00' }],
      })
    ).status,
  ).toBe(400);
  expect((await primary.expect('/context')).organization.locale).toBe('ro-MD');
  expect((await primary.expect('/audit')).events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ action: 'brands.created', targetId: brand.id }),
      expect.objectContaining({ action: 'locations.updated', targetId: locA.id }),
    ]),
  );
  const unassigned = (
    await primary.expect(`/locations/${locA.id}`, 'PATCH', {
      version: location.version,
      brandId: null,
    })
  ).location;
  const disabled = (
    await primary.expect(`/brands/${brand.id}`, 'PATCH', {
      version: brand.version,
      status: 'DISABLED',
    })
  ).brand;
  expect(disabled.version).toBe(2);
  expect(
    (
      await primary.call(`/locations/${locA.id}`, 'PATCH', {
        version: unassigned.version,
        brandId: brand.id,
      })
    ).status,
  ).toBe(400);
});
