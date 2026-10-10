import { createLocationSchema, updateLocationSchema, idSchema as uuid } from '@pos/contracts';
import { Router } from 'express';
import {
  audit,
  endpoint,
  policyChanged,
  publicLocation,
  scopeFor,
  visibleLocations,
} from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function locationsRouter() {
  const r = Router();
  r.get(
    '/locations',
    endpoint(async (_tx, d, a) => ({
      locations: visibleLocations(d, a.user.id).map(publicLocation),
    })),
  );
  r.post(
    '/locations',
    endpoint(async (tx, d, a, req) => {
      assert(d.service.canUse(a.user.id, 'locations.manage', scopeFor(d.org.id, {})));
      const body = createLocationSchema.parse(req.body);
      if (body.brandId) {
        const brand = await tx.brand.findUnique({ where: { id: body.brandId } });
        assert(brand?.status === 'ACTIVE', 400, 'Brandul trebuie să fie activ în companie.');
      }
      const location = await tx.location.create({ data: { ...body, organizationId: d.org.id } });
      await audit(tx, a, req, 'locations.created', 'LOCATION', location.id, location.id);
      return { location: publicLocation(location) };
    }),
  );
  r.patch(
    '/locations/:id',
    endpoint(async (tx, d, a, req) => {
      assert(d.service.canUse(a.user.id, 'locations.manage', scopeFor(d.org.id, {})));
      const id = uuid.parse(req.params.id);
      const body = updateLocationSchema.parse(req.body);
      const existing = d.locations.find((l) => l.id === id);
      assert(existing, 404);
      assert(existing.version === body.version, 409, 'Locația a fost modificată. Reîncărcați.');
      const latitude = body.latitude === undefined ? existing.latitude : body.latitude;
      const longitude = body.longitude === undefined ? existing.longitude : body.longitude;
      assert(
        (latitude === null) === (longitude === null),
        400,
        'Latitudinea și longitudinea se completează împreună.',
      );
      if (body.brandId) {
        const brand = await tx.brand.findUnique({ where: { id: body.brandId } });
        assert(brand?.status === 'ACTIVE', 400, 'Brandul trebuie să fie activ în companie.');
      }
      const location = await tx.location.update({
        where: { id },
        data: { ...body, version: { increment: 1 } },
      });
      await policyChanged(tx, d.org.id, a.session.id);
      await audit(tx, a, req, 'locations.updated', 'LOCATION', id, id);
      return { location: publicLocation(location) };
    }),
  );
  return r;
}
