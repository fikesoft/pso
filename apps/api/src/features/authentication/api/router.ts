import { Router } from 'express';
import type { PrincipalKind } from '../../../entities/session';
import { mfaRoutes } from './mfa.routes';
import { passwordRoutes } from './password.routes';
import { sessionRoutes } from './session.routes';
import { pinRoutes } from './pin.routes';
export function authRouter(kind: PrincipalKind) {
  const router = Router().use(sessionRoutes(kind), passwordRoutes(kind), mfaRoutes(kind));
  if (kind === 'TENANT') router.use(pinRoutes());
  router.use((_req, res) => res.status(404).json({ error: 'Ruta nu există', code: 'NOT_FOUND' }));
  return router;
}
