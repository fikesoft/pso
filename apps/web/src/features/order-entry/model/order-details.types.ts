import type { OrderReviewProps } from './order-review.types';
import type { OrderBlockedProps } from './order-blocked.types';
export interface OrderDetailsContentProps extends OrderBlockedProps {
  canEdit: boolean;
  editing?: OrderReviewProps['editing'];
  renderExtension?: OrderReviewProps['renderExtension'];
}
