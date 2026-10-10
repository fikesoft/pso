import { z } from 'zod';
import { tenantDeploymentOrigin } from '@pos/contracts/deployment';
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url().optional(),
  AUTH_DATABASE_URL: z.string().url().optional(),
  PLATFORM_DATABASE_URL: z.string().url().optional(),
  MFA_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/),
  CSRF_SECRET: z.string().min(48),
  TENANT_ORIGIN: z
    .string()
    .url()
    .default(() => tenantDeploymentOrigin(process.env))
    .transform((value) => tenantDeploymentOrigin({ ...process.env, TENANT_ORIGIN: value })),
  TENANT_REALTIME_URL: z.string().url().optional(),
  PLATFORM_ORIGIN: z.string().url().default('http://127.0.0.1:3001'),
  PLATFORM_PRIVATE_READY: z.enum(['true', 'false']).default('false'),
  TEMP_PASSWORD_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  MEDIA_STORAGE: z.enum(['local', 'vercel-blob']).default('local'),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
});
