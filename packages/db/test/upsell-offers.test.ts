import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withTenantTransaction } from '../src';
import { createOperationsFixture } from './fixtures/operations.fixture';

test('PostgreSQL real: proveniența și atribuirea recomandărilor sunt protejate', async (t) => {
  const state = await createOperationsFixture();
  try {
    const { rule, otherUser } = await state.txA(async (tx) => {
      const source = await tx.product.create({
        data: {
          organizationId: state.a.organization.id,
          name: 'Declanșator',
          sku: 'UPSELL-SOURCE',
          createdByUserId: state.a.user.id,
        },
      });
      await tx.locationProduct.create({
        data: {
          organizationId: state.a.organization.id,
          locationId: state.locationA.id,
          productId: source.id,
          price: '5',
        },
      });
      const rule = await tx.upsellRule.create({
        data: {
          organizationId: state.a.organization.id,
          locationId: state.locationA.id,
          sourceProductId: source.id,
          targetProductId: state.catalogA.product.id,
          name: 'Regulă sintetică',
          createdByUserId: state.a.user.id,
          requestKey: randomUUID(),
          requestHash: 'a'.repeat(64),
        },
      });
      const otherUser = await tx.companyUser.create({
        data: {
          organizationId: state.a.organization.id,
          loginNormalized: 'other-upsell',
          displayName: 'Alt operator sintetic',
          passwordHash: 'not-a-login-hash',
          createdByUserId: state.a.user.id,
        },
      });
      return { rule, otherUser };
    });
    const input = () => ({
      organizationId: state.a.organization.id,
      locationId: state.locationA.id,
      ruleId: rule.id,
      ruleVersion: rule.version,
      ruleName: rule.name,
      sourceProductId: rule.sourceProductId,
      targetProductId: rule.targetProductId,
      createdByUserId: state.a.user.id,
      requestKey: randomUUID(),
      requestHash: 'b'.repeat(64),
    });
    const offer = await state.txA((tx) =>
      tx.upsellOffer.create({ data: { ...input(), shownAt: new Date('2000-01-01') } }),
    );
    const otherActor = <T>(fn: Parameters<typeof withTenantTransaction<T>>[2]) =>
      withTenantTransaction(
        state.runtime,
        { organizationId: state.a.organization.id, userId: otherUser.id },
        fn,
      );
    await t.test('RLS, chei compuse, proveniență și snapshotul regulii', async () => {
      assert.equal(
        await state.txB((tx) => tx.upsellOffer.findUnique({ where: { id: offer.id } })),
        null,
      );
      assert.ok(offer.shownAt.getTime() > Date.now() - 60_000);
      for (const changes of [
        { locationId: state.locationA2.id },
        { ruleVersion: 99 },
        { sourceProductId: state.catalogB.product.id },
        { createdByUserId: otherUser.id },
        { acceptedAt: new Date() },
      ]) {
        await assert.rejects(
          state.txA((tx) => tx.upsellOffer.create({ data: { ...input(), ...changes } })),
          /snapshot|current actor|constraint/,
        );
      }
      await assert.rejects(
        state.txA((tx) =>
          tx.upsellOffer.update({ where: { id: offer.id }, data: { ruleName: 'Istoric fals' } }),
        ),
        /snapshot is immutable/,
      );
      await assert.rejects(
        state.txA((tx) => tx.upsellOffer.delete({ where: { id: offer.id } })),
        /permission denied|immutable/,
      );
    });
    await t.test(
      'acceptarea aparține operatorului original și nu poate fi antedatată ori retrasă',
      async () => {
        await assert.rejects(
          otherActor((tx) =>
            tx.upsellOffer.update({ where: { id: offer.id }, data: { acceptedAt: new Date() } }),
          ),
          /original actor/,
        );
        const accepted = await state.txA((tx) =>
          tx.upsellOffer.update({
            where: { id: offer.id },
            data: { acceptedAt: new Date('2000-01-01') },
          }),
        );
        assert.ok(accepted.acceptedAt!.getTime() >= offer.shownAt.getTime());
        await assert.rejects(
          state.txA((tx) =>
            tx.upsellOffer.update({ where: { id: offer.id }, data: { acceptedAt: null } }),
          ),
          /one-way/,
        );
      },
    );
    const first = await state.createDraft();
    const second = await state.createDraft();
    const line = (orderId = first.order.id, locationId = state.locationA.id) => ({
      organizationId: state.a.organization.id,
      locationId,
      orderId,
      productId: state.catalogA.product.id,
      productName: state.catalogA.product.name,
      productSku: state.catalogA.product.sku,
      unitPrice: '10.0050',
      quantity: '1',
      lineTotal: '10.01',
      position: 1,
      sourceUpsellOfferId: offer.id,
    });
    await t.test('numai inserarea unei linii corespunzătoare poate revendica oferta', async () => {
      await assert.rejects(
        state.txA((tx) =>
          tx.upsellOffer.update({
            where: { id: offer.id },
            data: { claimedOrderId: first.order.id, claimedItemId: randomUUID() },
          }),
        ),
        /originates from an order line/,
      );
      await assert.rejects(
        otherActor((tx) => tx.orderItem.create({ data: line() })),
        /cannot be claimed/,
      );
      await assert.rejects(
        state.txA((tx) => tx.orderItem.create({ data: line(first.order.id, state.locationA2.id) })),
        /cannot be claimed|constraint/,
      );
      const unaccepted = await state.txA((tx) => tx.upsellOffer.create({ data: input() }));
      await assert.rejects(
        state.txA((tx) =>
          tx.orderItem.create({ data: { ...line(), sourceUpsellOfferId: unaccepted.id } }),
        ),
        /cannot be claimed/,
      );
      const created = await state.txA(async (tx) => {
        const item = await tx.orderItem.create({ data: line() });
        await tx.order.update({
          where: { id: first.order.id },
          data: { total: '20.02', version: { increment: 1 } },
        });
        return item;
      });
      const stored = await state.txA((tx) =>
        tx.upsellOffer.findUniqueOrThrow({ where: { id: offer.id } }),
      );
      assert.equal(stored.claimedItemId, created.id);
      assert.equal(stored.claimedOrderId, first.order.id);
      await assert.rejects(
        state.txA((tx) =>
          tx.orderItem.update({ where: { id: created.id }, data: { sourceUpsellOfferId: null } }),
        ),
        /attribution is immutable/,
      );
      await assert.rejects(
        state.txA((tx) => tx.orderItem.create({ data: line(second.order.id) })),
        /cannot be claimed/,
      );
      await state.txA(async (tx) => {
        await tx.orderItem.delete({ where: { id: created.id } });
        await tx.order.update({
          where: { id: first.order.id },
          data: { total: '10.01', version: { increment: 1 } },
        });
      });
      await assert.rejects(
        state.txA((tx) => tx.orderItem.create({ data: line(second.order.id) })),
        /cannot be claimed/,
      );
    });
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
    ]);
  }
});
