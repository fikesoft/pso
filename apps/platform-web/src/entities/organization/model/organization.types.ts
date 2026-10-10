import type { Organization } from '@pos/ui/types';
export type OrganizationListProps = {
  organizations: Organization[];
  loading: boolean;
  query: string;
  onQueryChange: (query: string) => void;
};
