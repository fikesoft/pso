import { Field } from '@pos/ui';
import { customerManagementMessages as text } from '@pos/ui/locales';
import type { CustomerProfileFieldsProps } from '../model/customer-management.types';
export function CustomerProfileFields({ profile, disabled }: CustomerProfileFieldsProps) {
  return (
    <>
      <Field
        label={text.name}
        name="name"
        maxLength={160}
        defaultValue={profile?.name ?? ''}
        disabled={disabled}
        autoComplete="off"
      />
      <Field
        label={text.phone}
        name="phone"
        type="tel"
        required
        maxLength={80}
        defaultValue={profile?.phone ?? ''}
        disabled={disabled}
        autoComplete="off"
      />
      <Field
        label={text.email}
        name="email"
        type="email"
        maxLength={254}
        defaultValue={profile?.email ?? ''}
        disabled={disabled}
        autoComplete="off"
      />
    </>
  );
}
