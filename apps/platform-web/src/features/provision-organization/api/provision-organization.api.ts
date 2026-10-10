import type { PlatformApi } from '../../../shared/model/api.types';
import type { ProvisionOrganizationInput } from '../model/provision-organization.types';
export async function provisionOrganization(api: PlatformApi, input: ProvisionOrganizationInput) {
  const { data } = await api.http.post<{ temporaryPassword: string }>('/organizations', input);
  return data;
}
