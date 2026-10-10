import type { Router } from 'express';
import { z } from 'zod';
import {
  courierQuerySchema,
  courierListResponseSchema,
  courierCandidateQuerySchema,
  courierCandidateResponseSchema,
  idSchema,
} from '@pos/contracts';
import { endpoint } from '../../../entities/tenant-access';
import { assert, HttpError } from '../../../shared/lib/http';
import { openJson, sealJson } from '../../../shared/lib/sealed-json';
import {
  requireCourierRead,
  requireCourierCommand,
  courierEligible,
} from '../model/courier-access';
import { courierView } from '../model/courier-view';
import {
  COURIER_CURSOR_DOMAIN,
  COURIER_CANDIDATE_CURSOR_DOMAIN,
} from '../config/couriers.constants';
const detailQuery = z.object({ locationId: idSchema }).strict();
function anchor(domain: string, context: string[], cursor?: string) {
  if (!cursor) return undefined;
  try {
    return idSchema.parse(openJson(domain, context, cursor));
  } catch {
    throw new HttpError(400, 'Cursorul curierilor nu este valid pentru acest context.');
  }
}
export function addCourierReadRoutes(router: Router) {
  router.get(
    '/couriers',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const query = courierQuerySchema.parse(req.query);
        requireCourierRead(access, auth.user.id, query.locationId);
        const context = [access.org.id, auth.user.id, query.locationId, query.status];
        const after = anchor(COURIER_CURSOR_DOMAIN, context, query.cursor);
        const rows = await tx.courier.findMany({
          where: {
            organizationId: access.org.id,
            locationId: query.locationId,
            ...(query.status === 'ALL' ? {} : { status: query.status }),
            ...(after ? { id: { gt: after } } : {}),
          },
          orderBy: { id: 'asc' },
          take: query.limit + 1,
        });
        const page = rows.slice(0, query.limit);
        return courierListResponseSchema.parse({
          couriers: await Promise.all(page.map((row) => courierView(tx, access, row))),
          nextCursor:
            rows.length > query.limit
              ? sealJson(COURIER_CURSOR_DOMAIN, context, page.at(-1)!.id)
              : null,
        });
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.get(
    '/couriers/candidates',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const query = courierCandidateQuerySchema.parse(req.query);
        requireCourierCommand(access, auth.user.id, query.locationId, 'CREATE');
        const context = [access.org.id, auth.user.id, query.locationId];
        const after = anchor(COURIER_CANDIDATE_CURSOR_DOMAIN, context, query.cursor);
        const profiles = await tx.courier.findMany({
          where: { organizationId: access.org.id, locationId: query.locationId },
          select: { userId: true },
        });
        const registered = new Set(profiles.map((row) => row.userId));
        const candidates = access.users
          .filter(
            (user) =>
              (!after || user.id > after) &&
              !registered.has(user.id) &&
              courierEligible(access, user.id, query.locationId),
          )
          .sort((a, b) => a.id.localeCompare(b.id));
        const page = candidates.slice(0, query.limit);
        return courierCandidateResponseSchema.parse({
          candidates: page.map((user) => ({ userId: user.id, displayName: user.displayName })),
          nextCursor:
            candidates.length > query.limit
              ? sealJson(COURIER_CANDIDATE_CURSOR_DOMAIN, context, page.at(-1)!.id)
              : null,
        });
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.get(
    '/couriers/me',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const query = detailQuery.parse(req.query);
        requireCourierRead(access, auth.user.id, query.locationId, auth.user.id);
        const row = await tx.courier.findFirst({
          where: {
            organizationId: access.org.id,
            locationId: query.locationId,
            userId: auth.user.id,
          },
        });
        return { courier: row ? await courierView(tx, access, row) : null };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.get(
    '/couriers/:id',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const id = idSchema.parse(req.params.id),
          query = detailQuery.parse(req.query);
        requireCourierRead(access, auth.user.id, query.locationId);
        const row = await tx.courier.findFirst({
          where: { id, organizationId: access.org.id, locationId: query.locationId },
        });
        assert(row, 404, 'Curierul nu există.');
        return { courier: await courierView(tx, access, row) };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
}
