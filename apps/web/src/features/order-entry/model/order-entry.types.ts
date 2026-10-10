import type {
  CatalogProduct,
  CatalogCategory,
  ModifierGroupSnapshotDto,
  ModifierSelectionInput,
  Order,
  OrderRepeatSource,
  ServiceType,
} from '@pos/contracts';
import type { CatalogSearchControls } from '../../../entities/catalog';
import type { Api } from '../../../shared/api';
import type { ModifierChoices } from '../../../entities/modifier';
import type { OperationalPanelProps } from '../../../shared/model/operations.types';
import type { OrderReviewProps } from './order-review.types';
import type { useOrderEntry } from './use-order-entry';
import type { useOrderDraft } from './use-order-draft';
export interface OrderEntryProps extends OperationalPanelProps {
  canReadCustomers?: boolean;
  canCreateCustomers?: boolean;
  canManageAddresses?: boolean;
  organizationId: string;
  actorUserId: string;
}
export interface DraftLine {
  clientId: string;
  id?: string;
  productId: string;
  name: string;
  price: string;
  taxRateSnapshot?: string | null;
  quantity: string;
  courseNumber?: number;
  note: string;
  modifiers?: ModifierSelectionInput[];
  sourceUpsellOfferId?: string;
  modifierGroups: ModifierGroupSnapshotDto[];
}
export interface OrderDraftState {
  tableVisitId?: string;
  serviceType: ServiceType;
  tableLabel: string;
  notes: string;
  items: DraftLine[];
  customer?: Order['customer'];
  customerEdited?: boolean;
  customerRef?: Order['customerRef'];
  customerRefEdited?: boolean;
  deliveryAddress?: Order['deliveryAddress'];
  deliveryAddressEdited?: boolean;
  addressRef?: Order['addressRef'];
  addressRefEdited?: boolean;
  addressInvalid?: boolean;
  addressCleared?: boolean;
}
export interface TableOrderContext {
  visitId: string;
  tableLabel: string;
}
export interface OrderEditorProps {
  tableContext?: TableOrderContext;
  repeatSource?: OrderRepeatSource | null;
  onRepeatSource?: (source: OrderRepeatSource) => void;
  onCloseRepeat?: () => void;
  onRepeatGuard?: (blocked: boolean) => void;
  canReadOrders?: boolean;
  canReadCustomers?: boolean;
  canCreateCustomers?: boolean;
  canManageAddresses?: boolean;
  categories?: CatalogCategory[];
  organizationId: string;
  actorUserId: string;
  api: Api;
  locationId: string;
  order: Order | null;
  search?: CatalogSearchControls;
  products: CatalogProduct[];
  hasMoreProducts: boolean;
  loadingMoreProducts: boolean;
  onMoreProducts: () => Promise<void>;
  onRefreshProducts: () => Promise<unknown>;
  onClose: () => void;
  onSaved: (order: Order) => Promise<void>;
  onReload: (order: Order) => void;
}
export type OrderDraftModel = ReturnType<typeof useOrderDraft>;
export type OrderEntryModel = ReturnType<typeof useOrderEntry>;
export interface DraftFieldsProps {
  model: OrderDraftModel;
}
export interface OrderProductsProps {
  emptyMessage?: string;
  search?: CatalogSearchControls;
  products: CatalogProduct[];
  disabled: boolean;
  onAdd: (product: CatalogProduct) => void;
}
export interface OrderModifierPickerProps {
  product: CatalogProduct;
  choices: ModifierChoices;
  disabled: boolean;
  available: boolean;
  onToggle: (bindingId: string, optionId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}
export interface OrderListProps {
  timezone: string;
  orders: Order[];
  canEdit: boolean;
  busy: boolean;
  onOpen: (order: Order) => void;
  onEdit: (order: Order) => void;
}
export type OrderDetailsProps = OrderReviewProps;
export interface OrderLifecycleActionsProps extends OrderDetailsProps {
  checkoutLocked: boolean;
}
export interface OrderSummaryProps {
  order: Order;
}
