import { proxyTenantRequest } from '../../../../src/shared/api/server';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 20;
export {
  proxyTenantRequest as GET,
  proxyTenantRequest as POST,
  proxyTenantRequest as PUT,
  proxyTenantRequest as PATCH,
  proxyTenantRequest as DELETE,
  proxyTenantRequest as HEAD,
  proxyTenantRequest as OPTIONS,
};
