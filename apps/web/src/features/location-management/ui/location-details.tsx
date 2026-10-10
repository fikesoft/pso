import { Field, Select, roMessages } from '@pos/ui';
import { locationMessages as text } from '@pos/ui/locales';
import { defaultTimezone } from '../../../shared/config';
import type { LocationDetailsProps } from '../model/location-form.types';
import { BusinessHoursFields } from './business-hours-fields';

export function LocationDetails({ location, brands }: LocationDetailsProps) {
  return (
    <>
      <Select label={text.brand} name="brandId" defaultValue={location?.brandId ?? ''}>
        <option value="">{text.noBrand}</option>
        {brands
          .filter((brand) => brand.status === 'ACTIVE' || brand.id === location?.brandId)
          .map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
              {brand.status === 'DISABLED' ? ` · ${text.disabled}` : ''}
            </option>
          ))}
      </Select>
      <Field
        label={roMessages.message111}
        name="address"
        defaultValue={location?.address ?? ''}
        maxLength={250}
      />
      <Field
        label={text.phone}
        name="phone"
        type="tel"
        defaultValue={location?.phone ?? ''}
        maxLength={40}
      />
      <Field
        label={text.timezone}
        name="timezone"
        defaultValue={location?.timezone ?? defaultTimezone}
        required
        maxLength={80}
      />
      <div className="form-grid">
        <Field
          label={text.latitude}
          name="latitude"
          inputMode="decimal"
          defaultValue={location?.latitude ?? ''}
        />
        <Field
          label={text.longitude}
          name="longitude"
          inputMode="decimal"
          defaultValue={location?.longitude ?? ''}
        />
      </div>
      <p className="muted">{text.coordinatesHint}</p>
      <BusinessHoursFields location={location} />
    </>
  );
}
