import type { Prisma, TenantTransaction } from '@pos/db';
import { assert } from '../../../shared/lib/http';
import {
  MAX_RESERVATION_COMPONENTS,
  MAX_SELECTED_MODIFIERS_PER_ORDER,
} from '../config/inventory.constants';
import type { ConsumptionInput, LatestModifierRecipe, LatestRecipe } from './inventory.types';
import { consumedQuantity } from './quantities';

export async function reserveOrder(tx: TenantTransaction, input: ConsumptionInput) {
  const reservation = await tx.inventoryReservation.create({
    data: {
      organizationId: input.organizationId,
      locationId: input.locationId,
      orderId: input.orderId,
      createdByUserId: input.actorUserId,
    },
  });
  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const recipes = await tx.$queryRaw<LatestRecipe[]>`
    SELECT DISTINCT ON ("productId") id,"productId" FROM "RecipeVersion"
    WHERE "productId"=ANY(${productIds}::uuid[]) ORDER BY "productId",version DESC`;
  const baseComponents = await tx.recipeComponent.findMany({
    where: {
      recipeVersionId: { in: recipes.map((recipe) => recipe.id) },
      serviceTypes: { has: input.serviceType },
    },
  });
  const selected = await tx.orderItemModifier.findMany({
    where: { orderItemId: { in: input.items.map((item) => item.id) } },
    take: MAX_SELECTED_MODIFIERS_PER_ORDER + 1,
  });
  assert(
    selected.length <= MAX_SELECTED_MODIFIERS_PER_ORDER,
    413,
    'Comanda conține prea mulți modificatori selectați.',
  );
  const modifierRecipes = selected.length
    ? await tx.$queryRaw<LatestModifierRecipe[]>`
        SELECT DISTINCT ON (v."productId",v."modifierOptionId")
          v.id,v."productId",v."modifierOptionId"
        FROM "ModifierRecipeVersion" v
        JOIN "OrderItemModifier" m
          ON m."organizationId"=v."organizationId"
          AND m."modifierOptionId"=v."modifierOptionId"
        JOIN "OrderItem" oi
          ON oi."organizationId"=m."organizationId" AND oi.id=m."orderItemId"
          AND oi."productId"=v."productId"
        WHERE oi."orderId"=${input.orderId}::uuid
        ORDER BY v."productId",v."modifierOptionId",v.version DESC`
    : [];
  const modifierComponents = await tx.modifierRecipeComponent.findMany({
    where: {
      modifierRecipeVersionId: { in: modifierRecipes.map((recipe) => recipe.id) },
      serviceTypes: { has: input.serviceType },
    },
    take: MAX_RESERVATION_COMPONENTS + 1,
  });
  assert(
    modifierComponents.length <= MAX_RESERVATION_COMPONENTS,
    413,
    'Comanda produce prea multe componente de inventar (maximum 2500).',
  );
  const baseByVersion = new Map<string, typeof baseComponents>();
  for (const component of baseComponents) {
    if (!baseByVersion.has(component.recipeVersionId))
      baseByVersion.set(component.recipeVersionId, []);
    baseByVersion.get(component.recipeVersionId)!.push(component);
  }
  const modifierByVersion = new Map<string, typeof modifierComponents>();
  for (const component of modifierComponents) {
    if (!modifierByVersion.has(component.modifierRecipeVersionId))
      modifierByVersion.set(component.modifierRecipeVersionId, []);
    modifierByVersion.get(component.modifierRecipeVersionId)!.push(component);
  }
  const recipeByProduct = new Map(recipes.map((recipe) => [recipe.productId, recipe.id]));
  const modifierByPair = new Map(
    modifierRecipes.map((recipe) => [`${recipe.productId}:${recipe.modifierOptionId}`, recipe.id]),
  );
  const orderItemById = new Map(input.items.map((item) => [item.id, item]));
  for (const choice of selected) {
    const item = orderItemById.get(choice.orderItemId)!;
    assert(
      modifierByPair.has(`${item.productId}:${choice.modifierOptionId}`),
      409,
      'Un modificator selectat nu are rețetă publicată. Publicați o rețetă sau o versiune goală explicită.',
    );
  }
  const componentCount =
    input.items.reduce(
      (total, item) =>
        total + (baseByVersion.get(recipeByProduct.get(item.productId) ?? '')?.length ?? 0),
      0,
    ) +
    selected.reduce((total, choice) => {
      const item = orderItemById.get(choice.orderItemId)!;
      const recipeId = modifierByPair.get(`${item.productId}:${choice.modifierOptionId}`);
      return total + (modifierByVersion.get(recipeId ?? '')?.length ?? 0);
    }, 0);
  assert(
    componentCount <= MAX_RESERVATION_COMPONENTS,
    413,
    'Comanda produce prea multe componente de inventar (maximum 2500).',
  );
  if (!componentCount) return reservation;
  const itemIds = [
    ...new Set(
      [...baseComponents, ...modifierComponents].map((component) => component.inventoryItemId),
    ),
  ].sort();
  await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE id=ANY(${itemIds}::uuid[]) ORDER BY id FOR UPDATE`;
  const materials = await tx.inventoryItem.findMany({ where: { id: { in: itemIds } } });
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const lines: Prisma.InventoryReservationLineCreateManyInput[] = [];
  for (const item of input.items) {
    const recipeId = recipeByProduct.get(item.productId);
    for (const component of baseByVersion.get(recipeId ?? '') ?? []) {
      const material = materialById.get(component.inventoryItemId)!;
      lines.push({
        organizationId: input.organizationId,
        locationId: input.locationId,
        reservationId: reservation.id,
        inventoryItemId: material.id,
        quantity: consumedQuantity(item.quantity, component.quantityPerUnit.toFixed(3)).slice(1),
        itemName: material.name,
        itemSku: material.sku,
        unit: material.unit,
        orderItemId: item.id,
        recipeComponentId: component.id,
        productName: item.productName,
      });
    }
  }
  for (const choice of selected) {
    const item = orderItemById.get(choice.orderItemId)!;
    const recipeId = modifierByPair.get(`${item.productId}:${choice.modifierOptionId}`);
    for (const component of modifierByVersion.get(recipeId ?? '') ?? []) {
      const material = materialById.get(component.inventoryItemId)!;
      lines.push({
        organizationId: input.organizationId,
        locationId: input.locationId,
        reservationId: reservation.id,
        inventoryItemId: material.id,
        quantity: consumedQuantity(item.quantity, component.quantityPerUnit.toFixed(3)).slice(1),
        itemName: material.name,
        itemSku: material.sku,
        unit: material.unit,
        orderItemId: item.id,
        recipeComponentId: null,
        modifierRecipeComponentId: component.id,
        orderItemModifierId: choice.id,
        productName: item.productName,
      });
    }
  }
  await tx.inventoryReservationLine.createMany({ data: lines });
  return reservation;
}
