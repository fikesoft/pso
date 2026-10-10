import type { Location } from '@pos/ui/types';
export interface StaffLocationsProps {
  locations: Location[];
  selected: string[];
  onChange: (ids: string[]) => void;
}
