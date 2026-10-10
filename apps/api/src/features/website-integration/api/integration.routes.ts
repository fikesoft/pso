import {
  idSchema,
  websiteCatalogQuerySchema,
  websiteExternalOrderQuerySchema,
} from '@pos/contracts';
import { Router } from 'express';
import { z } from 'zod';
import { readPrivateImage } from '../../../entities/file-assets';
import { loadProductModifierConfigs } from '../../../entities/catalog-modifiers';
import { loadScheduleAvailability } from '../../../entities/menu-schedule';
import { websiteReceipt } from '../../../entities/website-order';
import { assert } from '../../../shared/lib/http';
import { lineAmount } from '../../../shared/lib/money';
import { integrationEndpoint, withIntegrationContext } from '../model/integration-endpoint';
import type { WebsiteCatalogRow } from '../model/integration.types';
import { receiveWebsiteOrder } from '../model/receive-order';
import { addWebsiteCatalogEventRoutes } from './catalog-events.routes';

export function websiteIntegrationRouter() {
  const router = Router();
  addWebsiteCatalogEventRoutes(router);
  router.get(
    '/catalog',
    integrationEndpoint(async (tx, context, req) => {
      const query = websiteCatalogQuerySchema.parse(req.query);
      if (query.cursor)
        assert(
          await tx.locationProduct.findFirst({
            where: { productId: query.cursor, locationId: context.location.id },
          }),
          400,
          'Cursorul nu este valid',
        );
      const cursor = query.cursor ?? null;
      const rows = await tx.$queryRaw<WebsiteCatalogRow[]>`
      SELECT p.id AS "productId",p.sku AS "externalProductId",p.name,l.price::text AS price,
        p."imageAssetId" AS "imageAssetId",p.calories::text AS calories,
        p.protein::text AS protein,p.fat::text AS fat,p.carbs::text AS carbs,p."nutritionBasis",
        CASE WHEN p."allergensDeclared" THEN p.allergens ELSE NULL END AS allergens,
        CASE WHEN p."ingredientsDeclared" THEN p.ingredients ELSE NULL END AS ingredients
      FROM "Product" p JOIN "LocationProduct" l ON l."productId"=p.id AND l."organizationId"=p."organizationId"
      WHERE l."locationId"=${context.location.id}::uuid AND p.status='ACTIVE' AND l.enabled
        AND (${cursor}::uuid IS NULL OR p.id>${cursor}::uuid)
      ORDER BY p.id ASC LIMIT ${query.limit + 1}`;
      const page = rows.slice(0, query.limit);
      const modifiers = await loadProductModifierConfigs(
        tx,
        page.map((row) => row.productId),
      );
      const availability = await loadScheduleAvailability(
        tx,
        context.location.id,
        page.map((row) => row.productId),
      );
      return {
        connectionId: context.connection.id,
        locationCode: context.location.code,
        currency: 'MDL',
        products: page.map(({ imageAssetId, ...row }) => ({
          ...row,
          unitTotal: lineAmount(row.price, '1.000'),
          modifierGroups: modifiers.get(row.productId) ?? [],
          scheduleAvailability: availability.get(row.productId)!,
          imageUrl: imageAssetId
            ? `/api/integrations/website/products/${row.productId}/image?assetId=${imageAssetId}`
            : null,
        })),
        nextCursor: rows.length > query.limit ? rows[query.limit - 1]!.productId : null,
      };
    }),
  );
  router.get('/website/products/:id/image', async (req, res) => {
    const bytes = await withIntegrationContext(req, async (tx, context) => {
      const productId = idSchema.parse(req.params.id);
      const { assetId } = z.object({ assetId: idSchema }).strict().parse(req.query);
      const product = await tx.product.findFirst({
        where: {
          id: productId,
          organizationId: context.organizationId,
          status: 'ACTIVE',
          imageAssetId: assetId,
        },
      });
      assert(product, 404, 'Imaginea nu este disponibilă.');
      const local = await tx.locationProduct.findFirst({
        where: {
          organizationId: context.organizationId,
          locationId: context.location.id,
          productId,
          enabled: true,
        },
      });
      assert(local, 404, 'Imaginea nu este disponibilă.');
      const asset = await tx.fileAsset.findFirst({
        where: {
          id: assetId,
          organizationId: context.organizationId,
          productId,
          purpose: 'PRODUCT_IMAGE',
          mimeType: 'image/webp',
        },
      });
      assert(asset, 404, 'Imaginea nu este disponibilă.');
      assert(asset.size <= 2 * 1024 * 1024, 500, 'Imaginea depășește limita permisă.');
      return readPrivateImage(context.organizationId, assetId, asset.checksum, asset.size);
    });
    assert(bytes.length <= 2 * 1024 * 1024, 500, 'Imaginea depășește limita permisă.');
    res.set('Cache-Control', 'no-store');
    res.type('image/webp').send(bytes);
  });
  router.post('/orders', integrationEndpoint(receiveWebsiteOrder));
  router.get(
    '/orders',
    integrationEndpoint(async (tx, context, req) => {
      const query = websiteExternalOrderQuerySchema.parse(req.query);
      const order = await tx.websiteOrder.findFirst({
        where: { connectionId: context.connection.id, externalOrderId: query.externalOrderId },
      });
      assert(order, 404, 'Comanda nu există');
      return { receipt: websiteReceipt(order) };
    }),
  );
  return router;
}
