import { completePackingFixture } from './packing-complete.fixture';
import { randomUUID } from 'node:crypto';
import type { OperationsFixture } from './operations.types';
import type { ModifierDraftOptions, ModifierFixture } from './modifier.types';
import { decimalString, decimalUnits, lineAmount } from '../../../../apps/api/src/shared/lib/money';

export async function createModifierDraft(
  state: OperationsFixture,
  modifier: ModifierFixture,
  options: ModifierDraftOptions = {},
) {
  return state.txA(async (tx) => {
    const organizationId = state.a.organization.id;
    const locationId = state.locationA.id;
    const latest = await tx.order.aggregate({ where: { locationId }, _max: { number: true } });
    const quantity = options.quantity ?? '1.234';
    const selectedOption = await tx.modifierOption.findUniqueOrThrow({
      where: { id: modifier.options[0]!.id },
    });
    const unitPrice = decimalString(
      decimalUnits('10.005', 4) + decimalUnits(selectedOption.extraPrice.toFixed(4), 4),
      4,
    );
    const total = lineAmount(unitPrice, quantity);
    const order = await tx.order.create({
      data: {
        organizationId,
        locationId,
        number: (latest._max.number ?? 0) + 1,
        serviceType: 'DINE_IN',
        tableLabel: 'Test',
        total,
        clientRequestId: randomUUID(),
        creationRequestHash: 'a'.repeat(64),
        createdByUserId: state.a.user.id,
        updatedByUserId: state.a.user.id,
      },
    });
    const item = await tx.orderItem.create({
      data: {
        organizationId,
        locationId,
        orderId: order.id,
        productId: state.catalogA.product.id,
        position: 0,
        productName: state.catalogA.product.name,
        productSku: state.catalogA.product.sku,
        baseUnitPrice: '10.005',
        unitPrice,
        quantity,
        lineTotal: total,
      },
    });
    if (!options.omitGroups) {
      const bindings = await tx.productModifierGroup.findMany({
        where: { productId: item.productId, status: 'ACTIVE' },
        orderBy: { id: 'asc' },
      });
      for (const [position, binding] of bindings.entries()) {
        const current = await tx.modifierGroup.findUniqueOrThrow({
          where: { id: binding.modifierGroupId },
        });
        const group = await tx.orderItemModifierGroup.create({
          data: {
            organizationId,
            locationId,
            orderItemId: item.id,
            productModifierGroupId: binding.id,
            modifierGroupId: current.id,
            groupName: options.groupName ?? current.name,
            minSelections: current.minSelections,
            maxSelections: current.maxSelections,
            groupVersion: current.version,
            bindingVersion: binding.version,
            position,
          },
        });
        if (current.id === modifier.group.id && !options.omitSelection) {
          const option = await tx.modifierOption.findUniqueOrThrow({
            where: { id: modifier.options[0]!.id },
          });
          await tx.orderItemModifier.create({
            data: {
              organizationId,
              locationId,
              orderItemId: item.id,
              modifierGroupSnapshotId: group.id,
              modifierGroupId: current.id,
              modifierOptionId: option.id,
              optionName: option.name,
              extraPrice: options.extraPrice ?? option.extraPrice,
              optionVersion: option.version,
              position: 0,
            },
          });
        }
      }
    }
    return { order, item };
  });
}

export async function markModifierKitchenReady(
  state: OperationsFixture,
  ticketId: string,
  orderId: string,
) {
  for (const status of ['PREPARING', 'READY'])
    await state.txA(async (tx) => {
      await tx.kitchenTicket.update({
        where: { id: ticketId },
        data: { status, version: { increment: 1 }, updatedByUserId: state.a.user.id },
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'IN_PROGRESS',
          kitchenStatus: status,
          version: { increment: 1 },
          updatedByUserId: state.a.user.id,
        },
      });
    });
  return state.txA((tx) => completePackingFixture(tx, orderId, state.a.user.id));
}
