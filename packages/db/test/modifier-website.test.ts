import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createWebsiteFixture } from './fixtures/website.fixture';
import { createModifierFixture } from './fixtures/modifier.fixture';

test('PostgreSQL real: website sigilează și copiază exact modificatorii istorici', async (t) => {
  const state = await createWebsiteFixture();
  try {
    const modifier = await createModifierFixture(state);
    const create = (baseUnitPrice = '10.005', groupLocation = state.locationA.id) =>
      state.txA(async (tx) => {
        const inbox = await state.writeInbound(tx, {
          header: { total: '10.34' },
          item: { baseUnitPrice, unitPrice: '10.3383', lineTotal: '10.34' },
        });
        const item = await tx.websiteOrderItem.findFirstOrThrow({
          where: { websiteOrderId: inbox.id },
        });
        const group = await tx.websiteOrderItemModifierGroup.create({
          data: {
            organizationId: state.a.organization.id,
            locationId: groupLocation,
            websiteOrderItemId: item.id,
            productModifierGroupId: modifier.binding.id,
            modifierGroupId: modifier.group.id,
            groupName: modifier.group.name,
            minSelections: 1,
            maxSelections: 1,
            groupVersion: modifier.group.version,
            bindingVersion: modifier.binding.version,
            position: 0,
          },
        });
        const option = await tx.websiteOrderItemModifier.create({
          data: {
            organizationId: state.a.organization.id,
            locationId: state.locationA.id,
            websiteOrderItemId: item.id,
            modifierGroupSnapshotId: group.id,
            modifierGroupId: modifier.group.id,
            modifierOptionId: modifier.options[0]!.id,
            optionName: modifier.options[0]!.name,
            extraPrice: '0.3333',
            optionVersion: 1,
            position: 0,
          },
        });
        return { inbox, item, group, option };
      });
    await t.test('prețul de bază și locația grupului nu pot fi falsificate', async () => {
      await assert.rejects(create('0'), /active location catalog/);
      await assert.rejects(create('10.005', state.locationB.id));
    });
    const inbound = await create();
    await t.test('snapshoturile sunt private, imuabile și obligatorii la acceptare', async () => {
      assert.equal(await state.txB((tx) => tx.websiteOrderItemModifier.count()), 0);
      await assert.rejects(
        state.txA((tx) => tx.websiteOrderItemModifier.delete({ where: { id: inbound.option.id } })),
      );
      await assert.rejects(
        state.txA((tx) =>
          tx.websiteOrderItemModifier.create({
            data: { ...inbound.option, id: randomUUID(), position: 1 },
          }),
        ),
        /creation transaction/,
      );
      await assert.rejects(state.acceptInbound(inbound.inbox.id));
      assert.equal(
        (
          await state.txA((tx) =>
            tx.websiteOrder.findUniqueOrThrow({ where: { id: inbound.inbox.id } }),
          )
        ).status,
        'PENDING',
      );
    });
    await t.test('schimbarea catalogului nu rescrie prețul sau alegerile acceptate', async () => {
      await state.txA((tx) =>
        tx.modifierOption.update({
          where: { id: modifier.options[0]!.id },
          data: { name: 'Nume ulterior', extraPrice: '9.9999', version: { increment: 1 } },
        }),
      );
      const accepted = await state.txA(async (tx) => {
        const order = await tx.order.create({
          data: {
            organizationId: state.a.organization.id,
            locationId: state.locationA.id,
            number: 20000,
            serviceType: 'DELIVERY',
            source: 'WEB',
            total: inbound.inbox.total,
            clientRequestId: randomUUID(),
            creationRequestHash: 'a'.repeat(64),
            createdByUserId: state.a.user.id,
            updatedByUserId: state.a.user.id,
          },
        });
        const { id: sourceId, websiteOrderId: _websiteOrderId, ...line } = inbound.item;
        const item = await tx.orderItem.create({
          data: { ...line, orderId: order.id, sourceWebsiteOrderItemId: sourceId },
        });
        const { id: _groupId, websiteOrderItemId: _groupItemId, ...groupData } = inbound.group;
        const group = await tx.orderItemModifierGroup.create({
          data: { ...groupData, orderItemId: item.id },
        });
        const { id: _optionId, websiteOrderItemId: _optionItemId, ...optionData } = inbound.option;
        await tx.orderItemModifier.create({
          data: { ...optionData, orderItemId: item.id, modifierGroupSnapshotId: group.id },
        });
        await tx.websiteOrder.update({
          where: { id: inbound.inbox.id },
          data: {
            status: 'ACCEPTED',
            version: { increment: 1 },
            orderId: order.id,
            decisionByUserId: state.a.user.id,
            decidedAt: new Date(),
          },
        });
        return { order, item };
      });
      assert.equal(accepted.item.unitPrice.toFixed(4), '10.3383');
      const choice = await state.txA((tx) =>
        tx.orderItemModifier.findFirstOrThrow({ where: { orderItemId: accepted.item.id } }),
      );
      assert.equal(choice.optionName, inbound.option.optionName);
      assert.equal(choice.extraPrice.toFixed(4), '0.3333');
    });
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
    ]);
  }
});
