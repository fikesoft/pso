import type { Dispatch, SetStateAction } from 'react';
import type { Order } from '@pos/contracts';
import type { Api } from '../../../shared/api';
export interface OrderSelectionInput {
  api: Api;
  locationId: string;
  enabled: boolean;
  selected: Order | null;
  setSelected: Dispatch<SetStateAction<Order | null>>;
}
