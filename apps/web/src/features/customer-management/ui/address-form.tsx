import { useState } from 'react';
import { Button, Field, Notice } from '@pos/ui';
import { errorMessage } from '@pos/ui/api';
import { addressManagementProfileSchema } from '@pos/contracts/address-management';
import { addressManagementMessages as text } from '@pos/ui/locales';
import type { AddressFormProps } from '../model/address-book.types';
export function AddressForm({ profile, disabled, onSave, onCancel }: AddressFormProps) {
  const [error, setError] = useState('');
  return (
    <form
      className="form-stack panel panel-body"
      onSubmit={async (event) => {
        event.preventDefault();
        if (disabled) return;
        setError('');
        try {
          const data = new FormData(event.currentTarget);
          await onSave(
            addressManagementProfileSchema.parse({
              label: String(data.get('label') ?? ''),
              address: String(data.get('address') ?? ''),
              instructions: String(data.get('instructions') ?? ''),
            }),
          );
        } catch (failure) {
          setError(errorMessage(failure));
        }
      }}
    >
      {error && <Notice>{error}</Notice>}
      <Field
        label={text.label}
        name="label"
        defaultValue={profile?.label ?? ''}
        maxLength={80}
        disabled={disabled}
        autoComplete="off"
      />
      <Field
        label={text.address}
        name="address"
        defaultValue={profile?.address ?? ''}
        required
        maxLength={500}
        disabled={disabled}
        autoComplete="off"
      />
      <Field
        label={text.instructions}
        name="instructions"
        defaultValue={profile?.instructions ?? ''}
        maxLength={500}
        disabled={disabled}
        autoComplete="off"
      />
      <div className="inline">
        <Button type="submit" disabled={disabled}>
          {text.save}
        </Button>
        <Button type="button" variant="secondary" disabled={disabled} onClick={onCancel}>
          {text.cancel}
        </Button>
      </div>
    </form>
  );
}
