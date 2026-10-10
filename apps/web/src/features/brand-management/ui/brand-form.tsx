import { Button, Field, Select, Notice } from '@pos/ui';
import { locationMessages as text } from '@pos/ui/locales';
import type { BrandFormProps } from '../model/brand-management.types';
import { useBrandForm } from '../model/use-brand-form';

export function BrandForm(props: BrandFormProps) {
  const { brand } = props;
  const { save, busy, error } = useBrandForm(props);
  return (
    <form className="form-stack" onSubmit={save}>
      {error && (
        <Notice>
          {error} {text.stale}
        </Notice>
      )}
      <Field
        label={text.brandName}
        name="name"
        defaultValue={brand?.name}
        required
        minLength={2}
        maxLength={100}
      />
      {brand ? (
        <Select label={text.status} name="status" defaultValue={brand.status}>
          <option value="ACTIVE">{text.active}</option>
          <option value="DISABLED">{text.disabled}</option>
        </Select>
      ) : (
        <Field
          label={text.brandCode}
          name="code"
          required
          minLength={2}
          maxLength={30}
          pattern="[A-Za-z0-9_\-]+"
        />
      )}
      <div className="form-footer">
        <Button type="submit" busy={busy}>
          {brand ? text.save : text.createBrand}
        </Button>
      </div>
    </form>
  );
}
