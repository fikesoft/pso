import type { Location, ScopeType } from '@pos/ui/types';
export interface ScopeFieldsProps {
  locations: Location[];
  scope: ScopeType;
  setScope: (s: ScopeType) => void;
  locationId: string;
  setLocationId: (s: string) => void;
}
