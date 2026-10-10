import type {
  CatalogProduct,
  ShowUpsellOffer,
  UpsellOfferDto,
  UpsellSuggestion,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
export interface OrderUpsellProps {
  api: Api;
  locationId: string;
  productIds: string[];
  disabled: boolean;
  onAdd: (product: CatalogProduct, offerId: string) => void;
}
export interface UpsellDisplay {
  input: ShowUpsellOffer;
  offer?: UpsellOfferDto;
  pending?: Promise<UpsellOfferDto>;
}
export interface OrderUpsellCardProps {
  suggestion: UpsellSuggestion;
  disabled: boolean;
  ensureShown: (suggestion: UpsellSuggestion) => Promise<UpsellOfferDto>;
  onAdd: OrderUpsellProps['onAdd'];
}
