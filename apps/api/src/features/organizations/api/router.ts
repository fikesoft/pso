import { Router } from 'express';
import { authMiddleware, hashPassword, temporaryPassword } from '../../../entities/session';
import type { AuthRequest } from '../../../entities/session';
import { config, HOUR_MS, MINUTE_MS } from '../../../shared/config';
import type { OrganizationListResult, ProvisioningResult } from '../../../shared/db';
import { platformDb } from '../../../shared/db';
import { assert } from '../../../shared/lib/http';
import { PROVISIONING_MFA_MINUTES } from '../config/provisioning.constants';
import { provisioningSchema } from '../model/provisioning.schema';
export function organizationsRouter() {
  const r = Router();
  r.use(authMiddleware('PLATFORM'));
  r.get('/organizations', async (_req, res) => {
    const rows = await platformDb.$queryRaw<
      OrganizationListResult[]
    >`SELECT pos_control.list_organizations() AS data`;
    res.json({ organizations: rows.map((r) => r.data) });
  });
  r.post('/organizations', async (req, res) => {
    const auth = (req as AuthRequest).auth!;
    assert(
      auth.session.mfaVerifiedAt &&
        Date.now() - new Date(auth.session.mfaVerifiedAt).getTime() <
          PROVISIONING_MFA_MINUTES * MINUTE_MS,
      403,
      'Reautentificare MFA necesară pentru această operațiune',
    );
    const body = provisioningSchema.parse(req.body);
    const password = body.password ?? temporaryPassword();
    const passwordHash = await hashPassword(password);
    const expiresAt = new Date(Date.now() + config.TEMP_PASSWORD_HOURS * HOUR_MS);
    const rows = await platformDb.$queryRaw<
      ProvisioningResult[]
    >`SELECT pos_control.provision_organization(${body.slug},${body.name},${body.legalName ?? null},${body.adminLogin},${body.adminDisplayName},${passwordHash},${expiresAt},${auth.user.id}::uuid) AS data`;
    res.status(201).json({ organization: rows[0].data.organization, temporaryPassword: password });
  });
  return r;
}
