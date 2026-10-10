import { Button, Notice } from '@pos/ui';
import { upsellMessages as text, operationalMessages as common } from '@pos/ui/locales';
import { useUpsellSuggestions } from '../../../entities/upsell';
import { useUpsellDisplay } from '../model/use-upsell-display';
import type { OrderUpsellProps } from '../model/upsell-entry.types';
import { OrderUpsellCard } from './order-upsell-card';

export function OrderUpsell(props: OrderUpsellProps) {
  const model = useUpsellSuggestions(props.api, props.locationId, props.productIds);
  const ensureShown = useUpsellDisplay(props.api, props.locationId, props.productIds);
  if (!props.productIds.length || (!model.error && !model.suggestions.length)) return null;
  return (
    <section className="stack" aria-label={text.suggestions}>
      <h3>{text.suggestions}</h3>
      {model.error && (
        <Notice>
          {model.error}
          <Button type="button" onClick={() => void model.refresh()}>
            {common.refresh}
          </Button>
        </Notice>
      )}
      {model.suggestions.map((suggestion) => (
        <OrderUpsellCard
          key={`${suggestion.ruleId}:${suggestion.ruleVersion}`}
          suggestion={suggestion}
          disabled={props.disabled || !!model.error || model.loading}
          ensureShown={ensureShown}
          onAdd={props.onAdd}
        />
      ))}
    </section>
  );
}
