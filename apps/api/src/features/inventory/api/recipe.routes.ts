import { createRecipeSchema, idSchema } from '@pos/contracts';
import type { Router } from 'express';
import { recipeResponse } from '../../../entities/inventory';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { RECIPE_PURPOSES } from '../config/inventory.constants';
import { requireInventoryOrganization } from '../model/inventory-authorization';

export function addInventoryRecipeRoutes(router: Router) {
  router.get(
    '/inventory/recipes/:productId',
    endpoint(async (tx, access, auth, req) => {
      requireInventoryOrganization(access, auth.user.id, 'inventory.recipes.manage');
      const productId = idSchema.parse(req.params.productId);
      assert(await tx.product.findUnique({ where: { id: productId } }), 404, 'Produsul nu există');
      const recipe = await tx.recipeVersion.findFirst({
        where: { productId },
        orderBy: { version: 'desc' },
      });
      return { recipe: recipe ? await recipeResponse(tx, recipe) : null };
    }),
  );
  router.post(
    '/inventory/recipes/:productId',
    endpoint(async (tx, access, auth, req) => {
      requireInventoryOrganization(access, auth.user.id, 'inventory.recipes.manage');
      const productId = idSchema.parse(req.params.productId);
      const body = createRecipeSchema.parse(req.body);
      const hash = requestHash({ productId, ...body });
      const product = await tx.product.findUnique({ where: { id: productId } });
      assert(product, 404, 'Produsul nu există');
      const previous = await tx.recipeVersion.findFirst({ where: { requestKey: body.requestKey } });
      if (previous) {
        assert(
          previous.productId === productId && previous.requestHash === hash,
          409,
          'Cheia cererii a fost folosită pentru alte date',
        );
        return { recipe: await recipeResponse(tx, previous) };
      }
      assert(product.status === 'ACTIVE', 409, 'Produsul este arhivat');
      const current = await tx.recipeVersion.findFirst({
        where: { productId },
        orderBy: { version: 'desc' },
      });
      assert(
        (current?.version ?? 0) === body.expectedVersion,
        409,
        'Rețeta a fost modificată. Reîncărcați.',
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
      const recipe = await tx.recipeVersion.create({
        data: {
          organizationId: access.org.id,
          productId,
          version: body.expectedVersion + 1,
          requestKey: body.requestKey,
          requestHash: hash,
          reason: body.reason,
          createdByUserId: auth.user.id,
        },
      });
      await tx.recipeComponent.createMany({
        data: body.components.map((component, position) => ({
          ...component,
          organizationId: access.org.id,
          recipeVersionId: recipe.id,
          position,
        })),
      });
      await audit(tx, auth, req, 'inventory.recipe.created', 'RECIPE_VERSION', recipe.id);
      return { recipe: await recipeResponse(tx, recipe) };
    }),
  );
}
