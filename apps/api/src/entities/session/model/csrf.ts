import type { NextFunction, Request, Response } from 'express';
import { config, HOUR_MS, isProd } from '../../../shared/config';
import { assert } from '../../../shared/lib/http';
import { CSRF_SAFE_METHODS, SESSION_POLICY } from '../config/session.constants';
import { csrf, safeEqual, token } from '../lib/crypto';
import type { PrincipalKind } from './session.types';
export const cookieName = (kind: PrincipalKind) => SESSION_POLICY[kind].cookieName;
const pathFor = (kind: PrincipalKind) => SESSION_POLICY[kind].path;
export const cookieOptions = (kind: PrincipalKind) => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'strict' as const,
  path: pathFor(kind),
});
export function seed(req: Request, res: Response, kind: PrincipalKind) {
  const name = cookieName(kind);
  let raw = req.cookies[name] || req.cookies[name + '_csrf'];
  if (!raw) {
    raw = token();
    res.cookie(name + '_csrf', raw, { ...cookieOptions(kind), maxAge: HOUR_MS });
  }
  return raw as string;
}
export function checkCsrf(kind: PrincipalKind) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (CSRF_SAFE_METHODS.includes(req.method)) return next();
    try {
      const expectedOrigin = kind === 'TENANT' ? config.TENANT_ORIGIN : config.PLATFORM_ORIGIN;
      assert(req.headers.origin === expectedOrigin, 403, 'Origine nepermisă');
      const raw = seed(req, res, kind);
      assert(
        typeof req.headers['x-csrf-token'] === 'string' &&
          safeEqual(req.headers['x-csrf-token'], csrf(raw)),
        403,
        'Sesiunea formularului a expirat. Reîncărcați pagina.',
      );
      next();
    } catch (error) {
      next(error);
    }
  };
}
