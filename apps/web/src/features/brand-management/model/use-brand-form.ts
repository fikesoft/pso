import { useState } from 'react';
import type { FormEvent } from 'react';
import { errorMessage } from '@pos/ui/api';
import { formText } from '../../../shared/lib';
import { saveBrand } from '../api/brands.api';
import type { BrandFormProps } from './brand-management.types';

export function useBrandForm({ api, brand, onSaved }: BrandFormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await saveBrand(api, brand?.id, {
        name: formText(form, 'name'),
        ...(brand
          ? { status: formText(form, 'status') as 'ACTIVE' | 'DISABLED', version: brand.version }
          : { code: formText(form, 'code') }),
      });
      onSaved();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return { save, busy, error };
}
