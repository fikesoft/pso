import {
  createWebsiteConnectionSchema,
  createWebsiteKeySchema,
  idSchema,
  updateWebsiteConnectionSchema,
} from '@pos/contracts';
import type { Router } from 'express';
import { audit, endpoint } from '../../../entities/tenant-access';
import {
  generateWebsiteKey,
  websiteConnectionResponse,
  websiteKeyResponse,
} from '../../../entities/website-order';
import { assert } from '../../../shared/lib/http';
import { DAY_MS } from '../../../shared/lib/time';
import { requireWebsiteManagement } from '../model/website-authorization';

export function addWebsiteManagementRoutes(router: Router) {
  router.get(
    '/website/connections',
    endpoint(async (tx, access, auth) => {
      requireWebsiteManagement(access, auth.user.id);
      const connections = await tx.websiteConnection.findMany({ orderBy: { createdAt: 'desc' } });
      return {
        connections: await Promise.all(
          connections.map((connection) => websiteConnectionResponse(tx, connection)),
        ),
      };
    }),
  );
  router.post(
    '/website/connections',
    endpoint(async (tx, access, auth, req) => {
      requireWebsiteManagement(access, auth.user.id);
      const body = createWebsiteConnectionSchema.parse(req.body);
      assert(
        access.locations.some(
          (location) => location.id === body.locationId && location.status === 'ACTIVE',
        ),
        404,
        'Locația nu există sau este arhivată',
      );
      const connection = await tx.websiteConnection.create({
        data: { ...body, organizationId: access.org.id, createdByUserId: auth.user.id },
      });
      await audit(
        tx,
        auth,
        req,
        'website.connection.created',
        'WEBSITE_CONNECTION',
        connection.id,
        connection.locationId,
      );
      return { connection: await websiteConnectionResponse(tx, connection) };
    }),
  );
  router.patch(
    '/website/connections/:id',
    endpoint(async (tx, access, auth, req) => {
      requireWebsiteManagement(access, auth.user.id);
      const id = idSchema.parse(req.params.id);
      const body = updateWebsiteConnectionSchema.parse(req.body);
      const current = await tx.websiteConnection.findUnique({ where: { id } });
      assert(current, 404, 'Conexiunea nu există');
      assert(current.version === body.version, 409, 'Conexiunea a fost modificată. Reîncărcați.');
      const connection = await tx.websiteConnection.update({
        where: { id },
        data: { ...body, version: { increment: 1 } },
      });
      await audit(
        tx,
        auth,
        req,
        'website.connection.updated',
        'WEBSITE_CONNECTION',
        id,
        current.locationId,
      );
      return { connection: await websiteConnectionResponse(tx, connection) };
    }),
  );
  router.post(
    '/website/connections/:id/keys',
    endpoint(async (tx, access, auth, req) => {
      requireWebsiteManagement(access, auth.user.id);
      const connection = await tx.websiteConnection.findUnique({
        where: { id: idSchema.parse(req.params.id) },
      });
      assert(connection, 404, 'Conexiunea nu există');
      assert(
        access.locations.some(
          (location) => location.id === connection.locationId && location.status === 'ACTIVE',
        ),
        409,
        'Locația este arhivată',
      );
      const body = createWebsiteKeySchema.parse(req.body);
      const { apiKey, ...generated } = generateWebsiteKey();
      const key = await tx.websiteApiKey.create({
        data: {
          ...generated,
          organizationId: access.org.id,
          locationId: connection.locationId,
          connectionId: connection.id,
          name: body.name,
          expiresAt: new Date(Date.now() + body.expiresInDays * DAY_MS),
          createdByUserId: auth.user.id,
        },
      });
      await audit(
        tx,
        auth,
        req,
        'website.key.created',
        'WEBSITE_KEY',
        key.id,
        connection.locationId,
      );
      return { key: websiteKeyResponse(key), apiKey };
    }),
  );
  router.delete(
    '/website/keys/:id',
    endpoint(async (tx, access, auth, req) => {
      requireWebsiteManagement(access, auth.user.id);
      const key = await tx.websiteApiKey.findUnique({
        where: { id: idSchema.parse(req.params.id) },
      });
      assert(key, 404, 'Cheia nu există');
      if (key.revokedAt) return { key: websiteKeyResponse(key) };
      const revoked = await tx.websiteApiKey.update({
        where: { id: key.id },
        data: { revokedAt: new Date() },
      });
      await audit(tx, auth, req, 'website.key.revoked', 'WEBSITE_KEY', key.id, key.locationId);
      return { key: websiteKeyResponse(revoked) };
    }),
  );
}
