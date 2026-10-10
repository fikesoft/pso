import { catalogQuerySchema } from '@pos/contracts';
import type { Router } from 'express';
import { endpoint, scopeFor } from '../../../entities/tenant-access';
import { loadProductModifierConfigs } from '../../../entities/catalog-modifiers';
import { loadScheduleAvailability } from '../../../entities/menu-schedule';
import { assert } from '../../../shared/lib/http';
import { categoryResponse, productResponse } from '../model/catalog-response';
import { readCatalogPage } from '../model/read-catalog-page';

export function addCatalogReadRoute(router: Router) {
  router.get(
    '/catalog',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const query = catalogQuerySchema.parse(req.query);
      const scope = scopeFor(access.org.id, {
        scopeType: 'LOCATION',
        locationId: query.locationId,
      });
      const canRead = access.service.canUse(auth.user.id, 'catalog.read', scope);
      const canManageLocal = access.service.canUse(auth.user.id, 'catalog.manage', scope);
      assert(
        canRead || canManageLocal || access.service.canUse(auth.user.id, 'orders.create', scope),
      );
      if (query.includeArchived) {
        assert(canRead || canManageLocal);
        assert(access.service.canUse(auth.user.id, 'catalog.manage', scopeFor(access.org.id, {})));
      }
      if (query.categoryId)
        assert(
          await tx.category.findUnique({
            where: {
              id: query.categoryId,
              ...(!query.includeArchived ? { status: 'ACTIVE' } : {}),
            },
            select: { id: true },
          }),
          404,
          'Categoria nu există',
        );
      const context = { ...query, organizationId: access.org.id, userId: auth.user.id };
      const { products, nextCursor } = await readCatalogPage(tx, context);
      const local = await tx.locationProduct.findMany({
        where: {
          locationId: query.locationId,
          productId: { in: products.map((product) => product.id) },
        },
      });
      const categories = await tx.category.findMany({
        where: !query.includeArchived ? { status: 'ACTIVE' } : {},
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      });
      const modifiers = await loadProductModifierConfigs(
        tx,
        products.slice(0, query.limit).map((product) => product.id),
      );
      const availability = await loadScheduleAvailability(
        tx,
        query.locationId,
        products.slice(0, query.limit).map((product) => product.id),
      );
      return {
        categories: categories.map(categoryResponse),
        products: products.slice(0, query.limit).map((product) =>
          productResponse(
            product,
            query.locationId,
            local.find((item) => item.productId === product.id),
            modifiers.get(product.id),
            availability.get(product.id),
          ),
        ),
        nextCursor,
      };
    }),
  );
}
