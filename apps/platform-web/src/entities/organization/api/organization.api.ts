import type { Organization } from '@pos/ui/types';
import type { PlatformApi } from '../../../shared/model/api.types';
export async function fetchOrganizations(api: PlatformApi) {
  const { data } = await api.http.get<{ organizations: Organization[] }>('/organizations');
  return data.organizations;
}
