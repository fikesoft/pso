import {
  createInventoryItemSchema,
  idSchema,
  inventoryItemsQuerySchema,
  inventoryProductsQuerySchema,
  updateInventoryItemSchema,
} from '@pos/contracts';
import type { Router } from 'express';
import { inventoryItemResponse, stockLevels } from '../../../entities/inventory';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import {
  inventoryItemVisibility,
  requireInventoryOrganization,
} from '../model/inventory-authorization';

export function addInventoryItemRoutes(router: Router) {
  router.get(
    '/inventory/items',
    endpoint(async (tx, access, auth, req) => {
      const query = inventoryItemsQuerySchema.parse(req.query);
      const locationId = inventoryItemVisibility(access, auth.user.id, query.locationId);
      if (query.cursor)
        assert(
          await tx.inventoryItem.findFirst({ where: { id: query.cursor, status: query.status } }),
          400,
          'Cursorul nu este valid',
        );
      const items = await tx.inventoryItem.findMany({
        where: { status: query.status, ...(query.cursor ? { id: { gt: query.cursor } } : {}) },
        orderBy: { id: 'asc' },
        take: query.limit + 1,
      });
      const page = items.slice(0, query.limit);
      const levels = locationId
        ? await stockLevels(
            tx,
            locationId,
            page.map((item) => item.id),
          )
        : null;
      return {
        items: page.map((item) =>
          inventoryItemResponse(
            item,
            locationId,
            levels ? (levels.get(item.id)?.balance ?? '0.000000') : null,
            levels ? (levels.get(item.id)?.reservedQuantity ?? '0.000000') : null,
          ),
        ),
        nextCursor: items.length > query.limit ? page.at(-1)!.id : null,
      };
    }),
  );
  router.get(
    '/inventory/items/:id',
    endpoint(async (tx, access, auth, req) => {
      const query = inventoryItemsQuerySchema.pick({ locationId: true }).strict().parse(req.query);
      const locationId = inventoryItemVisibility(access, auth.user.id, query.locationId);
      const item = await tx.inventoryItem.findUnique({
        where: { id: idSchema.parse(req.params.id) },
      });
      assert(item, 404, 'Articolul nu există');
      const level = locationId ? (await stockLevels(tx, locationId, [item.id])).get(item.id) : null;
      return {
        item: inventoryItemResponse(
          item,
          locationId,
          level?.balance ?? null,
          level?.reservedQuantity ?? null,
        ),
      };
    }),
  );
  router.post(
    '/inventory/items',
    endpoint(async (tx, access, auth, req) => {
      requireInventoryOrganization(access, auth.user.id, 'inventory.manage');
      const body = createInventoryItemSchema.parse(req.body);
      const item = await tx.inventoryItem.create({
        data: { ...body, organizationId: access.org.id, createdByUserId: auth.user.id },
      });
      await audit(tx, auth, req, 'inventory.item.created', 'INVENTORY_ITEM', item.id);
      return { item: inventoryItemResponse(item) };
    }),
  );
  router.patch(
    '/inventory/items/:id',
    endpoint(async (tx, access, auth, req) => {
      requireInventoryOrganization(access, auth.user.id, 'inventory.manage');
      const body = updateInventoryItemSchema.parse(req.body);
      const current = await tx.inventoryItem.findUnique({
        where: { id: idSchema.parse(req.params.id) },
      });
      assert(current, 404, 'Articolul nu există');
      assert(current.version === body.version, 409, 'Articolul a fost modificat. Reîncărcați.');
      const item = await tx.inventoryItem.update({
        where: { id: current.id },
        data: { ...body, version: { increment: 1 } },
      });
      await audit(tx, auth, req, 'inventory.item.updated', 'INVENTORY_ITEM', item.id);
      return { item: inventoryItemResponse(item) };
    }),
  );
  router.get(
    '/inventory/products',
    endpoint(async (tx, access, auth, req) => {
      requireInventoryOrganization(access, auth.user.id, 'inventory.recipes.manage');
      const query = inventoryProductsQuerySchema.parse(req.query);
      if (query.cursor)
        assert(
          await tx.product.findUnique({ where: { id: query.cursor } }),
          400,
          'Cursorul nu este valid',
        );
      const products = await tx.product.findMany({
        where: query.cursor ? { id: { gt: query.cursor } } : {},
        select: { id: true, name: true, sku: true, status: true },
        orderBy: { id: 'asc' },
        take: query.limit + 1,
      });
      return {
        products: products.slice(0, query.limit),
        nextCursor: products.length > query.limit ? products[query.limit - 1]!.id : null,
      };
    }),
  );
}
