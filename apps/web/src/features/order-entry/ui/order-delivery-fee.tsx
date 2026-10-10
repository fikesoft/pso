import { Button, Field, Notice } from '@pos/ui';
import {
  orderDeliveryFeeMessages as text,
  deliveryZoneMessages as zone,
  checkoutMessages,
} from '@pos/ui/locales';
import type { DeliveryFeeProps } from '../model/delivery-fee.types';
import { DeliveryFeeRecovery } from './delivery-fee-recovery';
export function OrderDeliveryFee({ model, disabled }: DeliveryFeeProps) {
  if (!model.enabled && !model.command.recovering) return null;
  const blocked = disabled || model.locked || model.command.stale;
  const result = model.quote?.result;
  return (
    <section className="form-stack" aria-label={text.title}>
      <h3>{text.title}</h3>
      <p>{model.order.deliveryFeeConfirmed ? text.confirmed : text.pending}</p>
      <DeliveryFeeRecovery model={model} disabled={disabled} />
      {model.enabled && !model.command.recovering && (
        <>
          <p className="muted">{text.hint}</p>
          {model.error && <Notice>{model.error}</Notice>}
          <div className="form-grid">
            <Field
              label={zone.latitude}
              type="number"
              min={-90}
              max={90}
              step="0.000001"
              value={model.latitude}
              disabled={blocked}
              onChange={(event) => model.change('latitude', event.target.value)}
            />
            <Field
              label={zone.longitude}
              type="number"
              min={-180}
              max={180}
              step="0.000001"
              value={model.longitude}
              disabled={blocked}
              onChange={(event) => model.change('longitude', event.target.value)}
            />
          </div>
          <Button
            disabled={blocked || !model.order.deliveryAddress}
            onClick={() => void model.preview()}
          >
            {text.preview}
          </Button>
          {model.command.stale && (
            <Button disabled={disabled || model.locked} onClick={() => void model.refresh()}>
              {text.refresh}
            </Button>
          )}
          {result &&
            (result.status === 'AVAILABLE' ? (
              <>
                <p>
                  {result.zoneName} · {zone.eta}: {result.estimatedMinutes}
                </p>
                <p>
                  {text.subtotal}: {result.subtotal} MDL · {zone.fee}: {result.fee} MDL ·{' '}
                  {checkoutMessages.total}: {result.total} MDL
                </p>
                <label className="inline">
                  <input
                    type="checkbox"
                    checked={model.confirmed}
                    disabled={blocked}
                    onChange={(event) => model.setConfirmed(event.target.checked)}
                  />
                  {text.confirm}
                </label>
                <Button disabled={blocked || !model.confirmed} onClick={() => void model.apply()}>
                  {text.apply}
                </Button>
              </>
            ) : (
              <Notice tone="info">
                {text[result.status]}
                {result.status === 'MINIMUM_NOT_MET' &&
                  ` ${zone.minimum}: ${result.minimumOrder} MDL`}
              </Notice>
            ))}
        </>
      )}
    </section>
  );
}
