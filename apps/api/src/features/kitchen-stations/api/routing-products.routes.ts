import type { Router } from 'express';
import { kitchenRoutingProductsSchema } from '@pos/contracts';
import type { KitchenRoutingProduct } from '@pos/contracts';
import { endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireStationAccess } from '../model/station-access';
import { routingResponse } from '../model/routing-command';
export function addRoutingProductRoutes(router: Router) {
  router.get(
    '/kitchen-routing/products',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const query = kitchenRoutingProductsSchema.parse(req.query);
        requireStationAccess(access, auth.user.id, query.locationId, true);
        if (query.cursor)
          assert(
            await tx.locationProduct.findFirst({
              where: { locationId: query.locationId, productId: query.cursor },
              select: { id: true },
            }),
            400,
            'Cursorul produselor nu aparține locației.',
          );
        const rows = await tx.$queryRaw<Array<Pick<KitchenRoutingProduct, 'id' | 'name' | 'sku'>>>`
      SELECT p.id,p.name,p.sku FROM "Product" p JOIN "LocationProduct" lp
        ON lp."productId"=p.id AND lp."organizationId"=p."organizationId"
      WHERE p."organizationId"=${access.org.id}::uuid AND lp."locationId"=${query.locationId}::uuid
        AND p.status='ACTIVE'
        AND (${query.cursor ?? null}::uuid IS NULL OR p.id>${query.cursor ?? null}::uuid)
        AND (${query.search}::text='' OR strpos(lower(p.name),lower(${query.search}))>0
          OR strpos(lower(p.sku),lower(${query.search}))>0)
      ORDER BY p.id LIMIT ${query.limit + 1}`;
        const products = await Promise.all(
          rows.slice(0, query.limit).map(
            async (product) => {
              const row = await tx.kitchenRoutingCommand.findFirst({
                where: { locationId: query.locationId, productId: product.id, status: 'SUCCEEDED' },
                orderBy: { resultVersion: 'desc' },
              });
              const station = row?.stationId
                ? await tx.kitchenStation.findUnique({
                    where: { id: row.stationId },
                    select: { status: true },
                  })
                : null;
              return {
                ...product,
                stationArchived: station?.status === 'ARCHIVED',
                routing: row
                  ? routingResponse(row)
                  : {
                      locationId: query.locationId,
                      productId: product.id,
                      version: 0,
                      station: null,
                    },
              };
            },
            { readOnly: true, readOnlySnapshot: true },
          ),
        );
        return { products, nextCursor: rows.length > query.limit ? products.at(-1)!.id : null };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
}
