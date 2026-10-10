import { Field } from '@pos/ui';
import { deliveryZoneMessages as text } from '@pos/ui/locales';
import type { ZonePricingProps } from '../model/delivery-zone.types';
export function ZonePricingFields({ profile, disabled, onChange }: ZonePricingProps) {
  return (
    <>
      <Field
        label={text.minimum}
        inputMode="decimal"
        required
        disabled={disabled}
        value={profile.minimumOrder}
        onChange={(event) => onChange({ ...profile, minimumOrder: event.target.value })}
      />
      <Field
        label={text.fee}
        inputMode="decimal"
        required
        disabled={disabled}
        value={profile.deliveryFee}
        onChange={(event) => onChange({ ...profile, deliveryFee: event.target.value })}
      />
      <Field
        label={text.free}
        inputMode="decimal"
        disabled={disabled}
        value={profile.freeDeliveryFrom ?? ''}
        onChange={(event) => onChange({ ...profile, freeDeliveryFrom: event.target.value || null })}
      />
      <Field
        label={text.eta}
        type="number"
        required
        min="1"
        max="1440"
        disabled={disabled}
        value={Number.isFinite(profile.estimatedMinutes) ? profile.estimatedMinutes : ''}
        onChange={(event) => onChange({ ...profile, estimatedMinutes: event.target.valueAsNumber })}
      />
      <Field
        label={text.priority}
        type="number"
        required
        min="0"
        max="999"
        disabled={disabled}
        value={Number.isFinite(profile.priority) ? profile.priority : ''}
        onChange={(event) => onChange({ ...profile, priority: event.target.valueAsNumber })}
      />
    </>
  );
}
