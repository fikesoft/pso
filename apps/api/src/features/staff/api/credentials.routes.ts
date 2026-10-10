import { setStaffPinSchema, idSchema as uuid } from '@pos/contracts';
import type { Router } from 'express';
import { hashPassword, temporaryPassword } from '../../../entities/session';
import { audit, endpoint } from '../../../entities/tenant-access';
import { config, HOUR_MS } from '../../../shared/config';
import { assert } from '../../../shared/lib/http';
import { configureStaffPin } from '../model/staff-pin';
import { staffUserResponse } from '../model/staff-response';

export function addStaffCredentialRoutes(r: Router) {
  r.post(
    '/staff/:id/reset-password',
    endpoint(async (tx, d, a, req) => {
      const id = uuid.parse(req.params.id);
      assert(d.service.canManageUser(a.user.id, id, 'resetPassword'));
      const password = temporaryPassword();
      await tx.companyUser.update({
        where: { id },
        data: {
          authenticationMethod: 'PASSWORD',
          pinHash: null,
          pinLookup: null,
          passwordHash: await hashPassword(password),
          mustChangePassword: true,
          temporaryPasswordExpiresAt: new Date(Date.now() + config.TEMP_PASSWORD_HOURS * HOUR_MS),
          authVersion: { increment: 1 },
          version: { increment: 1 },
        },
      });
      await tx.tenantSession.updateMany({ where: { userId: id }, data: { revokedAt: new Date() } });
      await audit(tx, a, req, 'staff.password.reset', 'USER', id);
      return { temporaryPassword: password };
    }),
  );
  r.post(
    '/staff/:id/reset-pin',
    endpoint(async (tx, d, a, req) => {
      const id = uuid.parse(req.params.id);
      const body = setStaffPinSchema.parse(req.body);
      assert(d.service.canManageUser(a.user.id, id, 'resetPassword'));
      const configured = await configureStaffPin(tx, d.org.id, id, body.pin);
      await audit(tx, a, req, 'staff.pin.reset', 'USER', id);
      return { user: staffUserResponse(configured.user), pin: configured.pin };
    }),
  );
}
