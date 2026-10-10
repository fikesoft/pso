import type { Location, Brand } from '@pos/ui/types';
import type { Api } from '../../../shared/api';
export interface LocationFormProps {
  api: Api;
  location?: Location;
  onSaved: () => void;
}
export interface LocationDetailsProps {
  location?: Location;
  brands: Brand[];
}
