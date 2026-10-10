import { TENANT_WEB_ORIGIN } from '../config/platform.constants';
export function tenantLoginUrl(slug: string) {
  return `${TENANT_WEB_ORIGIN}/c/${encodeURIComponent(slug)}/login`;
}
