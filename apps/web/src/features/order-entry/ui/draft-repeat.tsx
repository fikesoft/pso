import { useEffect } from 'react';
import type { DraftRepeatProps } from '../model/order-repeat.types';
import { LastCustomerOrder } from './last-customer-order';
import { OrderRepeatPreview } from './order-repeat-preview';
export function DraftRepeat({ props, model }: DraftRepeatProps) {
  const blocked = model.locked || !!model.pendingProduct;
  useEffect(() => {
    if (!props.order) props.onRepeatGuard?.(blocked);
  }, [props.order, props.onRepeatGuard, blocked]);
  if (props.order) return null;
  return (
    <>
      {props.canReadOrders &&
        props.canReadCustomers &&
        model.draft.customerRef &&
        props.onRepeatSource && (
          <LastCustomerOrder
            key={`${props.locationId}:${model.draft.customerRef.id}`}
            api={props.api}
            locationId={props.locationId}
            customerId={model.draft.customerRef.id}
            disabled={blocked}
            onRepeat={(source) => {
              if (!blocked) props.onRepeatSource?.(source);
            }}
          />
        )}
      {props.repeatSource && props.canReadOrders && (
        <OrderRepeatPreview
          key={`${props.locationId}:${props.repeatSource.id}`}
          source={props.repeatSource}
          props={props}
          model={model}
        />
      )}
    </>
  );
}
