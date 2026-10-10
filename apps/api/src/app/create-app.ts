import cookieParser from 'cookie-parser';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { auditRejection, checkCsrf } from '../entities/session';
import type { AuthRequest, PrincipalKind } from '../entities/session';
import { authRouter } from '../features/authentication';
import { organizationsRouter as platformRouter } from '../features/organizations';
import { config } from '../shared/config';
import { HttpError } from '../shared/lib/http';
import { tenantRouter } from './tenant-router';
import { JSON_BODY_LIMIT } from './config/http.constants';
import { websiteIntegrationRouter } from '../features/website-integration';
export function createApp(kind: PrincipalKind) {
  if (
    kind === 'PLATFORM' &&
    config.NODE_ENV === 'production' &&
    config.PLATFORM_PRIVATE_READY !== 'true'
  )
    throw new Error('Control plane dezactivat: configurarea privată nu a fost confirmată');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(helmet());
  app.use((req, res, next) => {
    (req as AuthRequest).requestId = randomUUID();
    res.set('X-Request-Id', (req as AuthRequest).requestId);
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());
  app.get('/health', (_req, res) =>
    res.json({ status: 'ok', surface: kind === 'TENANT' ? 'tenant' : 'private-platform' }),
  );
  const prefix = kind === 'TENANT' ? '/api/tenant' : '/api/platform';
  if (kind === 'TENANT') app.use('/api/integrations', websiteIntegrationRouter());
  app.use(prefix, checkCsrf(kind));
  app.use(prefix + '/auth', authRouter(kind));
  app.use(prefix, kind === 'TENANT' ? tenantRouter() : platformRouter());
  app.use((_req, res) => res.status(404).json({ error: 'Ruta nu există', code: 'NOT_FOUND' }));
  const errors: ErrorRequestHandler = async (error, req, res, _next) => {
    if (error?.type === 'entity.too.large') {
      res.status(413).json({ error: 'Cererea depășește limita permisă', code: 'BODY_TOO_LARGE' });
      return;
    }
    if (error?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Corpul JSON nu este valid', code: 'INVALID_JSON' });
      return;
    }
    if (error instanceof HttpError && [401, 403].includes(error.status)) {
      try {
        await auditRejection(req, error.status, error.code);
      } catch {
        console.error(
          JSON.stringify({
            event: 'audit.write.failed',
            requestId: (req as AuthRequest).requestId,
          }),
        );
      }
    }
    if (error instanceof ZodError) {
      res.status(400).json({
        error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        code: 'VALIDATION_ERROR',
      });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }
    if (['P2002', 'P2003', 'P2004', 'P2025'].includes(error?.code)) {
      res.status(error.code === 'P2025' ? 404 : 409).json({
        error: 'Date conflictuale sau relație nepermisă. Verificați formularul.',
        code: 'DATA_CONFLICT',
      });
      return;
    }
    console.error(
      JSON.stringify({
        event: 'request.error',
        requestId: (req as AuthRequest).requestId,
        errorType: error?.name ?? 'UnknownError',
        code: error?.code ?? 'INTERNAL',
      }),
    );
    res.status(500).json({
      error: 'Eroare internă. Folosiți identificatorul cererii pentru diagnostic.',
      code: 'INTERNAL_ERROR',
    });
  };
  app.use(errors);
  return app;
}
