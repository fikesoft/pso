import { Badge } from '@pos/ui';
import { checkoutMessages as text } from '@pos/ui/locales';
import type { CheckoutStatusProps } from '../model/checkout.types';
export function CheckoutStatus({ mode }: CheckoutStatusProps) {
  return (
    <Badge tone={mode === 'DEMO' ? 'warning' : 'success'}>
      {mode === 'DEMO' ? text.demoBadge : text.manualBadge}
    </Badge>
  );
}
