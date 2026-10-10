import type { KitchenStationDto, KitchenRoutingProduct } from '@pos/contracts/kitchen-stations';
import type { StationAccessProps, StationOperationModel } from '../../../entities/kitchen-station';
export type StationEdit =
  | { kind: 'CREATE' }
  | { kind: 'UPDATE' | 'ARCHIVE'; station: KitchenStationDto };
export interface StationConfigurationProps extends StationAccessProps {
  onBack: () => void;
}
export interface StationFormProps {
  edit: StationEdit;
  locationId: string;
  operation: StationOperationModel;
  onClose: () => void;
}
export interface StationRecoveryProps {
  operation: StationOperationModel;
  onRefresh: () => void;
  refreshLabel?: string;
}
export interface RoutingFormProps {
  api: StationAccessProps['api'];
  product: KitchenRoutingProduct;
  locationId: string;
  operation: StationOperationModel;
  onClose: () => void;
}
