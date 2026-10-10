import { roMessages, Button, Field, Select, Notice } from '@pos/ui';
import type { LocationFormProps } from '../model/location-form.types';
import { useLocationForm } from '../model/use-location-form';
import { LocationDetails } from './location-details';
import { locationMessages as text } from '@pos/ui/locales';
export function LocationForm(props: LocationFormProps) {
  const { location } = props;
  const { busy, error, save, brands } = useLocationForm(props);
  return (
    <form className="form-stack" onSubmit={save}>
      {error && <Notice>{error}</Notice>}
      {brands.error && (
        <Notice>
          {brands.error}
          <Button variant="secondary" onClick={() => void brands.refresh()}>
            {text.refresh}
          </Button>
        </Notice>
      )}
      <Field
        label={roMessages.message104}
        name="name"
        defaultValue={location?.name}
        placeholder={roMessages.message105}
        required
        minLength={2}
      />
      {location ? (
        <Select label={roMessages.message106} name="status" defaultValue={location.status}>
          <option value="ACTIVE">{roMessages.message107}</option>
          <option value="DISABLED">{roMessages.message108}</option>
        </Select>
      ) : (
        <>
          <Field
            label={roMessages.message109}
            name="code"
            placeholder={roMessages.message110}
            required
            minLength={2}
            pattern="[A-Za-z0-9_\-]+"
          />
        </>
      )}
      {brands.loading ? (
        <p>{text.loadingBrands}</p>
      ) : (
        !brands.error && <LocationDetails location={location} brands={brands.data ?? []} />
      )}
      <Notice tone="info">
        {roMessages.message113} {location ? roMessages.message114 : roMessages.message115}
      </Notice>
      <div className="form-footer">
        <Button type="submit" busy={busy} disabled={brands.loading || !!brands.error}>
          {location ? roMessages.message116 : roMessages.message117}
        </Button>
      </div>
    </form>
  );
}
