import { createInventoryDocumentSchema, inventoryMovementsQuerySchema } from '@pos/contracts';
import { Router } from 'express';
import { endpoint } from '../../../entities/tenant-access';
import { createInventoryDocument } from '../model/create-document';
import { requireInventoryStock } from '../model/inventory-authorization';
import { listInventoryMovements } from '../model/list-movements';
import { addInventoryItemRoutes } from './item.routes';
import { addInventoryRecipeRoutes } from './recipe.routes';
import { addInventoryModifierRecipeRoutes } from './modifier-recipe.routes';

export function inventoryRouter() {
  const router = Router();
  addInventoryItemRoutes(router);
  addInventoryRecipeRoutes(router);
  addInventoryModifierRecipeRoutes(router);
  router.get(
    '/inventory/movements',
    endpoint(async (tx, access, auth, req) => {
      const query = inventoryMovementsQuerySchema.parse(req.query);
      requireInventoryStock(access, auth.user.id, query.locationId);
      return listInventoryMovements(tx, query);
    }),
  );
  router.post(
    '/inventory/documents',
    endpoint(async (tx, access, auth, req) =>
      createInventoryDocument(tx, access, auth, req, createInventoryDocumentSchema.parse(req.body)),
    ),
  );
  return router;
}
