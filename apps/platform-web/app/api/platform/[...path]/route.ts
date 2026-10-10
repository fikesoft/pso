export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export {
  proxyPlatformRequest as GET,
  proxyPlatformRequest as POST,
  proxyPlatformRequest as PUT,
  proxyPlatformRequest as PATCH,
  proxyPlatformRequest as DELETE,
  proxyPlatformRequest as HEAD,
  proxyPlatformRequest as OPTIONS,
} from '../../../../src/shared/api/platform-gateway';
