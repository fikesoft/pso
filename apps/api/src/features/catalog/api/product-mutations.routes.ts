import type { Router } from 'express';
import {
  createProductSchema,
  idSchema,
  locationProductSchema,
  updateProductSchema,
} from '@pos/contracts';
import { audit, endpoint, scopeFor } from '../../../entities/tenant-access';
import { loadProductModifierConfigs } from '../../../entities/catalog-modifiers';
import { loadScheduleAvailability } from '../../../entities/menu-schedule';
import { productInformation, productInformationWrite } from '../../../entities/catalog-product';
import { assert } from '../../../shared/lib/http';
import { productResponse, requireActiveCategory } from '../model/catalog-response';

export function addProductMutationRoutes(router: Router) {
  router.post(
    '/catalog/products',
    endpoint(async (tx, access, auth, req) => {
      const body = createProductSchema.parse(req.body);
      assert(access.service.canUse(auth.user.id, 'catalog.manage', scopeFor(access.org.id, {})));
      assert(
        access.service.canUse(
          auth.user.id,
          'catalog.manage',
          scopeFor(access.org.id, {
            scopeType: 'LOCATION',
            locationId: body.locationId,
          }),
        ),
      );
      await requireActiveCategory(tx, body.categoryId);
      const { locationId, price, ...metadata } = body;
      const product = await tx.product.create({
        data: {
          ...productInformationWrite(metadata),
          organizationId: access.org.id,
          createdByUserId: auth.user.id,
        },
      });
      const local = await tx.locationProduct.create({
        data: {
          organizationId: access.org.id,
          locationId,
          productId: product.id,
          price,
        },
      });
      await audit(tx, auth, req, 'catalog.product.created', 'PRODUCT', product.id, locationId);
      return { product: productResponse(product, locationId, local) };
    }),
  );
  router.patch(
    '/catalog/products/:id',
    endpoint(async (tx, access, auth, req) => {
      assert(access.service.canUse(auth.user.id, 'catalog.manage', scopeFor(access.org.id, {})));
      const id = idSchema.parse(req.params.id);
      const body = updateProductSchema.parse(req.body);
      const current = await tx.product.findUnique({ where: { id } });
      assert(current, 404, 'Produsul nu există');
      assert(current.version === body.version, 409, 'Produsul a fost modificat. Reîncărcați.');
      const effectiveCategoryId =
        body.categoryId !== undefined ? body.categoryId : current.categoryId;
      if (
        (body.categoryId !== undefined && body.categoryId !== current.categoryId) ||
        (body.status === 'ACTIVE' && current.status !== 'ACTIVE')
      )
        await requireActiveCategory(tx, effectiveCategoryId);
      const product = await tx.product.update({
        where: { id },
        data: { ...productInformationWrite(body), version: { increment: 1 } },
      });
      await audit(tx, auth, req, 'catalog.product.updated', 'PRODUCT', id);
      return {
        product: {
          id: product.id,
          categoryId: product.categoryId,
          name: product.name,
          sku: product.sku,
          description: product.description,
          taxRate: product.taxRate?.toFixed(4) ?? null,
          ...productInformation(product),
          status: product.status,
          version: product.version,
        },
      };
    }),
  );
  router.put(
    '/catalog/products/:id/locations/:locationId',
    endpoint(async (tx, access, auth, req) => {
      const id = idSchema.parse(req.params.id);
      const locationId = idSchema.parse(req.params.locationId);
      const body = locationProductSchema.parse(req.body);
      assert(
        access.service.canUse(
          auth.user.id,
          'catalog.manage',
          scopeFor(access.org.id, {
            scopeType: 'LOCATION',
            locationId,
          }),
        ),
      );
      const product = await tx.product.findUnique({ where: { id } });
      assert(product, 404, 'Produsul nu există');
      const current = await tx.locationProduct.findFirst({ where: { locationId, productId: id } });
      assert(
        current ? body.version === current.version : body.version === undefined,
        409,
        'Disponibilitatea a fost modificată. Reîncărcați.',
      );
      const local = current
        ? await tx.locationProduct.update({
            where: { id: current.id },
            data: {
              price: body.price,
              enabled: body.enabled,
              version: { increment: 1 },
            },
          })
        : await tx.locationProduct.create({
            data: {
              organizationId: access.org.id,
              locationId,
              productId: id,
              price: body.price,
              enabled: body.enabled,
            },
          });
      await audit(tx, auth, req, 'catalog.availability.updated', 'PRODUCT', id, locationId);
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
}
