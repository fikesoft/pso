import { createModifierRecipeSchema, idSchema } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import type { Router } from 'express';
import { loadProductModifierConfigs } from '../../../entities/catalog-modifiers';
import { modifierRecipeResponse } from '../../../entities/inventory';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { RECIPE_PURPOSES } from '../config/inventory.constants';
import { requireInventoryOrganization } from '../model/inventory-authorization';
import type { ModifierRecipeVersionRow } from '../model/inventory.types';

async function modifierRecipeTarget(tx: TenantTransaction, productId: string, optionId: string) {
  const product = await tx.product.findUnique({ where: { id: productId } });
  assert(product, 404, 'Produsul nu există');
  const option = await tx.modifierOption.findUnique({ where: { id: optionId } });
  assert(option, 404, 'Opțiunea nu există');
  const group = await tx.modifierGroup.findUnique({ where: { id: option.modifierGroupId } });
  const binding = await tx.productModifierGroup.findFirst({
    where: { productId, modifierGroupId: option.modifierGroupId },
  });
  assert(group && binding, 404, 'Opțiunea nu aparține produsului');
  return { product, option, group, binding };
}

export function addInventoryModifierRecipeRoutes(router: Router) {
  router.get(
    '/inventory/products/:productId/modifier-options',
    endpoint(async (tx, access, auth, req) => {
      requireInventoryOrganization(access, auth.user.id, 'inventory.recipes.manage');
      const productId = idSchema.parse(req.params.productId);
      const product = await tx.product.findUnique({ where: { id: productId } });
      assert(product && product.status === 'ACTIVE', 404, 'Produsul nu este disponibil');
      const configurations =
        (await loadProductModifierConfigs(tx, [productId])).get(productId) ?? [];
      assert(
        configurations.length <= 10 &&
          configurations.every((binding) => binding.group.options.length <= 20),
        409,
        'Configurația modificatorilor depășește limitele. Verificați catalogul.',
      );
      const optionIds = configurations.flatMap((binding) =>
        binding.group.options.map((option) => option.id),
      );
      const versions = await tx.$queryRaw<ModifierRecipeVersionRow[]>`
        SELECT DISTINCT ON ("modifierOptionId") "modifierOptionId",version
        FROM "ModifierRecipeVersion"
        WHERE "productId"=${productId}::uuid
          AND "modifierOptionId"=ANY(${optionIds}::uuid[])
        ORDER BY "modifierOptionId",version DESC`;
      const latest = new Map(versions.map((row) => [row.modifierOptionId, row.version]));
      return {
        options: configurations.flatMap((binding) =>
          binding.group.options.map((option) => ({
            modifierOptionId: option.id,
            optionName: option.name,
            modifierGroupName: binding.group.name,
            recipeVersion: latest.get(option.id) ?? null,
          })),
        ),
      };
    }),
  );
  router.get(
    '/inventory/modifier-recipes/:productId/:optionId',
    endpoint(async (tx, access, auth, req) => {
      requireInventoryOrganization(access, auth.user.id, 'inventory.recipes.manage');
      const productId = idSchema.parse(req.params.productId);
      const optionId = idSchema.parse(req.params.optionId);
      await modifierRecipeTarget(tx, productId, optionId);
      const recipe = await tx.modifierRecipeVersion.findFirst({
        where: { productId, modifierOptionId: optionId },
        orderBy: { version: 'desc' },
      });
      return {
        status: recipe ? 'PUBLISHED' : 'UNCONFIGURED',
        recipe: recipe ? await modifierRecipeResponse(tx, recipe) : null,
      };
    }),
  );
  router.post(
    '/inventory/modifier-recipes/:productId/:optionId',
    endpoint(async (tx, access, auth, req) => {
      requireInventoryOrganization(access, auth.user.id, 'inventory.recipes.manage');
      const productId = idSchema.parse(req.params.productId);
      const optionId = idSchema.parse(req.params.optionId);
      const body = createModifierRecipeSchema.parse(req.body);
      const hash = requestHash({ productId, modifierOptionId: optionId, ...body });
      const target = await modifierRecipeTarget(tx, productId, optionId);
      const previous = await tx.modifierRecipeVersion.findFirst({
        where: { requestKey: body.requestKey },
      });
      if (previous) {
        assert(
          previous.productId === productId &&
            previous.modifierOptionId === optionId &&
            previous.requestHash === hash,
          409,
          'Cheia cererii a fost folosită pentru alte date',
        );
        return { status: 'PUBLISHED', recipe: await modifierRecipeResponse(tx, previous) };
      }
      assert(
        target.product.status === 'ACTIVE' &&
          target.option.status === 'ACTIVE' &&
          target.group.status === 'ACTIVE' &&
          target.binding.status === 'ACTIVE',
        409,
        'Produsul sau modificatorul este arhivat.',
      );
      const current = await tx.modifierRecipeVersion.findFirst({
        where: { productId, modifierOptionId: optionId },
        orderBy: { version: 'desc' },
      });
      assert(
        (current?.version ?? 0) === body.expectedVersion,
        409,
        'Rețeta modificatorului a fost modificată. Reîncărcați.',
      );
      const items = await tx.inventoryItem.findMany({
        where: { id: { in: body.components.map((component) => component.inventoryItemId) } },
      });
      for (const component of body.components) {
        const item = items.find((entry) => entry.id === component.inventoryItemId);
        assert(item, 404, 'Articolul din rețetă nu există');
        assert(item.status === 'ACTIVE', 409, 'Un articol din rețetă este arhivat');
        assert(
          RECIPE_PURPOSES[item.kind]?.includes(component.purpose),
          400,
          'Rolul componentei nu corespunde tipului articolului',
        );
      }
      const recipe = await tx.modifierRecipeVersion.create({
        data: {
          organizationId: access.org.id,
          productId,
          modifierOptionId: optionId,
          version: body.expectedVersion + 1,
          requestKey: body.requestKey,
          requestHash: hash,
          reason: body.reason,
          createdByUserId: auth.user.id,
        },
      });
      await tx.modifierRecipeComponent.createMany({
        data: body.components.map((component, position) => ({
          ...component,
          organizationId: access.org.id,
          modifierRecipeVersionId: recipe.id,
          position,
        })),
      });
      await audit(
        tx,
        auth,
        req,
        'inventory.modifier-recipe.created',
        'MODIFIER_RECIPE_VERSION',
        recipe.id,
      );
      return { status: 'PUBLISHED', recipe: await modifierRecipeResponse(tx, recipe) };
    }),
  );
}
