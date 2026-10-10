import type { SessionOrganization } from '../lib/http';
export type ProvisioningResult = {
  data: { organization: SessionOrganization; user: { id: string } };
};
export type OrganizationListResult = {
  data: Pick<SessionOrganization, 'id' | 'slug' | 'name' | 'status' | 'currency' | 'timezone'>;
};
