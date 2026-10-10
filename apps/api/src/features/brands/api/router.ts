import { createBrandSchema, idSchema, updateBrandSchema } from '@pos/contracts';
import { Router } from 'express';
import {
  audit,
  endpoint,
  policyChanged,
  scopeFor,
  visibleLocations,
} from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function brandsRouter() {
  const router = Router();
  router.get(
    '/brands',
    endpoint(async (tx, data, auth) => {
      const organizationScope = scopeFor(data.org.id, {});
      const canReadAll = ['organization.read', 'locations.read', 'locations.manage'].some(
        (permission) => data.service.canUse(auth.user.id, permission, organizationScope),
      );
      const brandIds = canReadAll
        ? null
        : new Set(
            visibleLocations(data, auth.user.id)
              .map((location) => location.brandId)
              .filter(Boolean),
          );
      const brands = await tx.brand.findMany({
        where: brandIds === null ? {} : { id: { in: [...brandIds] as string[] } },
        orderBy: { name: 'asc' },
      });
      return {
        brands: brands.map(({ id, organizationId, name, code, status, version }) => ({
          id,
          organizationId,
          name,
          code,
          status,
          version,
        })),
      };
    }),
  );
  router.post(
    '/brands',
    endpoint(async (tx, data, auth, req) => {
      assert(data.service.canUse(auth.user.id, 'locations.manage', scopeFor(data.org.id, {})));
      const body = createBrandSchema.parse(req.body);
      const brand = await tx.brand.create({ data: { ...body, organizationId: data.org.id } });
      await audit(tx, auth, req, 'brands.created', 'BRAND', brand.id);
      return {
        brand: {
          id: brand.id,
          organizationId: brand.organizationId,
          name: brand.name,
          code: brand.code,
          status: brand.status,
          version: brand.version,
        },
      };
    }),
  );
  router.patch(
    '/brands/:id',
    endpoint(async (tx, data, auth, req) => {
      assert(data.service.canUse(auth.user.id, 'locations.manage', scopeFor(data.org.id, {})));
      const id = idSchema.parse(req.params.id);
      const { version, ...change } = updateBrandSchema.parse(req.body);
      const existing = await tx.brand.findUnique({ where: { id } });
      assert(existing, 404);
      if (change.status === 'DISABLED' && existing.status !== 'DISABLED') {
        const activeLocations = await tx.location.count({
          where: { brandId: id, status: 'ACTIVE' },
        });
        assert(
          activeLocations === 0,
          409,
          'Brandul are locații active. Dezactivați-le sau mutați-le mai întâi.',
        );
      }
      const updated = await tx.brand.updateMany({
        where: { id, version },
        data: { ...change, version: { increment: 1 } },
      });
      assert(updated.count === 1, 409, 'Brandul a fost modificat. Reîncărcați.');
      const brand = await tx.brand.findUniqueOrThrow({ where: { id } });
      await policyChanged(tx, data.org.id, auth.session.id);
      await audit(tx, auth, req, 'brands.updated', 'BRAND', id);
      return {
        brand: {
          id: brand.id,
          organizationId: brand.organizationId,
          name: brand.name,
          code: brand.code,
          status: brand.status,
          version: brand.version,
        },
      };
    }),
  );
  return router;
}
