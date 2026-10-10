import type { TenantTransaction } from '@pos/db';
import type { KitchenRecipeComponent } from '@pos/contracts';

export async function readKitchenRecipeComponents(
  tx: TenantTransaction,
  organizationId: string,
  locationId: string,
  orderItemId: string,
): Promise<KitchenRecipeComponent[]> {
  // Reservation names/units/totals and immutable recipe components are the preparation
  // snapshot. Never substitute today's inventory names, recipe, prices or balances.
  return tx.$queryRaw<KitchenRecipeComponent[]>`
    SELECT line.id,line."itemName",line.unit,
      coalesce(base.purpose,modifier.purpose) AS purpose,
      coalesce(base."quantityPerUnit",modifier."quantityPerUnit")::text AS "quantityPerUnit",
      line.quantity::text AS "totalQuantity",coalesce(recipe.version,extra.version) AS "recipeVersion",
      CASE WHEN base.id IS NULL THEN 'MODIFIER' ELSE 'BASE' END AS source,
      choice."optionName" AS "modifierName"
    FROM "InventoryReservationLine" line
    LEFT JOIN "RecipeComponent" base ON base."organizationId"=line."organizationId" AND base.id=line."recipeComponentId"
    LEFT JOIN "RecipeVersion" recipe ON recipe."organizationId"=base."organizationId" AND recipe.id=base."recipeVersionId"
    LEFT JOIN "ModifierRecipeComponent" modifier ON modifier."organizationId"=line."organizationId" AND modifier.id=line."modifierRecipeComponentId"
    LEFT JOIN "ModifierRecipeVersion" extra ON extra."organizationId"=modifier."organizationId" AND extra.id=modifier."modifierRecipeVersionId"
    LEFT JOIN "OrderItemModifier" choice ON choice."organizationId"=line."organizationId" AND choice."locationId"=line."locationId"
      AND choice."orderItemId"=line."orderItemId" AND choice.id=line."orderItemModifierId"
    WHERE line."organizationId"=${organizationId}::uuid AND line."locationId"=${locationId}::uuid
      AND line."orderItemId"=${orderItemId}::uuid
    ORDER BY CASE WHEN base.id IS NULL THEN 1 ELSE 0 END,choice."modifierGroupSnapshotId",choice.position,
      coalesce(base.position,modifier.position),line.id`;
}
