import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSecurityFixture } from './fixtures/security.fixture';

test('Branduri și metadate locație: RLS, FK compus și reguli de stare', async () => {
  const state = await createSecurityFixture();
  try {
    const brand = await state.txA((tx) =>
      tx.brand.create({
        data: { organizationId: state.a.organization.id, name: 'Sushi test', code: 'SUSHI' },
      }),
    );
    assert.equal(brand.status, 'ACTIVE');
    assert.deepEqual(await state.runtime.brand.findMany(), []);
    assert.deepEqual(await state.txB((tx) => tx.brand.findMany({ where: { id: brand.id } })), []);
    await assert.rejects(
      state.txB((tx) =>
        tx.brand.create({
          data: { organizationId: state.a.organization.id, name: 'Foreign', code: 'FOREIGN' },
        }),
      ),
    );
    await assert.rejects(
      state.txB((tx) =>
        tx.location.update({
          where: { id: state.locationB.id },
          data: { brandId: brand.id },
        }),
      ),
    );
    const otherBrand = await state.txB((tx) =>
      tx.brand.create({
        data: { organizationId: state.b.organization.id, name: 'Other brand', code: 'OTHER' },
      }),
    );
    await assert.rejects(
      state.txA(
        (tx) => tx.$executeRaw`
      UPDATE "Location" SET "brandId"=${otherBrand.id}::uuid WHERE id=${state.locationA.id}::uuid
    `,
      ),
    );
    const assigned = await state.txA((tx) =>
      tx.location.update({
        where: { id: state.locationA.id },
        data: {
          brandId: brand.id,
          phone: '+373 22 123 456',
          latitude: '47.010456',
          longitude: '28.863811',
          businessHours: [{ day: 1, opensAt: '22:00', closesAt: '02:00' }],
        },
      }),
    );
    assert.equal(assigned.latitude?.toString(), '47.010456');
    assert.equal(assigned.longitude?.toString(), '28.863811');
    assert.deepEqual(assigned.businessHours, [{ day: 1, opensAt: '22:00', closesAt: '02:00' }]);
    await assert.rejects(
      state.txA((tx) =>
        tx.brand.update({
          where: { id: brand.id },
          data: { status: 'DISABLED' },
        }),
      ),
    );
    await assert.rejects(
      state.txA((tx) =>
        tx.location.update({
          where: { id: state.locationA.id },
          data: { businessHours: [{ day: 8, opensAt: '09:00', closesAt: '18:00' }] },
        }),
      ),
    );
    for (const invalid of [
      [{ day: 1, opensAt: null, closesAt: null }],
      [{ day: 1, opensAt: '09:00' }],
      [{ day: 1, opensAt: '09:00', closesAt: '18:00', extra: true }],
    ]) {
      await assert.rejects(
        state.txA((tx) =>
          tx.location.update({
            where: { id: state.locationA.id },
            data: { businessHours: invalid },
          }),
        ),
      );
    }
    await assert.rejects(
      state.txA((tx) =>
        tx.location.update({
          where: { id: state.locationA.id },
          data: { latitude: null },
        }),
      ),
    );
    await state.txA((tx) =>
      tx.location.update({ where: { id: state.locationA.id }, data: { status: 'DISABLED' } }),
    );
    await state.txA((tx) =>
      tx.brand.update({ where: { id: brand.id }, data: { status: 'DISABLED' } }),
    );
    await assert.rejects(
      state.txA((tx) =>
        tx.location.update({
          where: { id: state.locationA.id },
          data: { status: 'ACTIVE' },
        }),
      ),
    );
    const org = await state.txA((tx) =>
      tx.organization.findUniqueOrThrow({ where: { id: state.a.organization.id } }),
    );
    assert.equal(org.locale, 'ro-MD');
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
    ]);
  }
});
