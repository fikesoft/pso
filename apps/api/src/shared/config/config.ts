import { envSchema } from './env.schema';
export const config = envSchema.parse(process.env);
if (
  config.NODE_ENV === 'production' &&
  (!config.TENANT_ORIGIN.startsWith('https://') ||
    (config.PLATFORM_DATABASE_URL && !config.PLATFORM_ORIGIN.startsWith('https://')))
)
  throw new Error('HTTPS obligatoriu în producție');
export const isProd = config.NODE_ENV === 'production';
