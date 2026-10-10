import type { Api } from '../api';
export interface OperationalPanelProps {
  api: Api;
  locationId: string;
  locationName: string;
  actorName: string;
  can: (permission: string) => boolean;
  canManageCatalog: boolean;
}
