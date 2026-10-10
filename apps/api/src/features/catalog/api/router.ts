import { addCatalogReadRoute } from './read.routes';
import {
  catalogProductQuerySchema,
  createCategorySchema,
  idSchema,
  updateCategorySchema,
} from '@pos/contracts';
import { Router } from 'express';
import { audit, endpoint, scopeFor } from '../../../entities/tenant-access';
import { loadProductModifierConfigs } from '../../../entities/catalog-modifiers';
import { loadScheduleAvailability } from '../../../entities/menu-schedule';
import { assert } from '../../../shared/lib/http';
import { categoryResponse, productResponse } from '../model/catalog-response';
import { addModifierReadRoutes } from './modifier-read.routes';
import { addModifierGroupRoutes } from './modifier-group.routes';
import { addModifierOptionRoutes } from './modifier-option.routes';
import { addProductModifierRoutes } from './product-modifier.routes';
import { addMenuScheduleReadRoutes } from './menu-schedule-read.routes';
import { addMenuScheduleWriteRoutes } from './menu-schedule-write.routes';

import { addUpsellSuggestionRoutes } from './upsell-suggestion.routes';
import { addUpsellRuleRoutes } from './upsell-rule.routes';
import { addUpsellOfferRoutes } from './upsell-offer.routes';
import { addUpsellMetricsRoutes } from './upsell-metrics.routes';
import { addProductMutationRoutes } from './product-mutations.routes';

export function catalogRouter() {
  const router = Router();
  addProductMutationRoutes(router);
  addUpsellRuleRoutes(router);
  addUpsellSuggestionRoutes(router);
  addUpsellOfferRoutes(router);
  addUpsellMetricsRoutes(router);
  addMenuScheduleReadRoutes(router);
  addMenuScheduleWriteRoutes(router);
  addModifierReadRoutes(router);
  addModifierGroupRoutes(router);
  addModifierOptionRoutes(router);
  addProductModifierRoutes(router);
  addCatalogReadRoute(router);
  router.get(
    '/catalog/products/:id',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const id = idSchema.parse(req.params.id);
      const { locationId } = catalogProductQuerySchema.parse(req.query);
      const scope = scopeFor(access.org.id, { scopeType: 'LOCATION', locationId });
      const canRead = access.service.canUse(auth.user.id, 'catalog.read', scope);
      const canManageLocal = access.service.canUse(auth.user.id, 'catalog.manage', scope);
      assert(
        canRead || canManageLocal || access.service.canUse(auth.user.id, 'orders.create', scope),
      );
      const product = await tx.product.findUnique({ where: { id } });
      assert(product, 404, 'Produsul nu există');
      if (product.status === 'ARCHIVED') {
        assert(canRead || canManageLocal);
        assert(access.service.canUse(auth.user.id, 'catalog.manage', scopeFor(access.org.id, {})));
      }
      const local = await tx.locationProduct.findFirst({ where: { productId: id, locationId } });
      const modifiers = await loadProductModifierConfigs(tx, [id]);
      const availability = await loadScheduleAvailability(tx, locationId, [id]);
      return {
        product: productResponse(
          product,
          locationId,
          local,
          modifiers.get(id),
          availability.get(id),
        ),
      };
    }),
  );
  router.post(
    '/catalog/categories',
    endpoint(async (tx, access, auth, req) => {
      assert(access.service.canUse(auth.user.id, 'catalog.manage', scopeFor(access.org.id, {})));
      const body = createCategorySchema.parse(req.body);
      const category = await tx.category.create({
        data: { ...body, organizationId: access.org.id },
      });
      await audit(tx, auth, req, 'catalog.category.created', 'CATEGORY', category.id);
      return { category: categoryResponse(category) };
    }),
  );
  router.patch(
    '/catalog/categories/:id',
    endpoint(async (tx, access, auth, req) => {
      assert(access.service.canUse(auth.user.id, 'catalog.manage', scopeFor(access.org.id, {})));
      const id = idSchema.parse(req.params.id);
      const body = updateCategorySchema.parse(req.body);
      const current = await tx.category.findUnique({ where: { id } });
      assert(current, 404, 'Categoria nu există');
      assert(current.version === body.version, 409, 'Categoria a fost modificată. Reîncărcați.');
      if (body.status === 'ARCHIVED' && current.status !== 'ARCHIVED') {
        const active = await tx.product.count({ where: { categoryId: id, status: 'ACTIVE' } });
        assert(active === 0, 409, 'Arhivați produsele active înaintea categoriei.');
      }
      const { version: _version, ...changes } = body;
      const category = await tx.category.update({
        where: { id },
        data: { ...changes, version: { increment: 1 } },
      });
      await audit(tx, auth, req, 'catalog.category.updated', 'CATEGORY', id);
      return { category: categoryResponse(category) };
    }),
  );
  return router;
}
