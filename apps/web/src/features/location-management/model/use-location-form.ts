import { formText, useRemoteData } from '../../../shared/lib';
import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { errorMessage } from '@pos/ui/api';
import type { LocationFormProps } from './location-form.types';
import { updateLocation, createLocation } from '../api/location-form';
import { readBrands } from '../../../entities/brand';
import { locationMetadata } from '../lib/location-metadata';
export function useLocationForm({ api, location, onSaved }: LocationFormProps) {
  const loadBrands = useCallback(() => readBrands(api), [api]);
  const brands = useRemoteData(loadBrands);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || brands.loading || brands.error) return;
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      if (location)
        await updateLocation(api, location.id, {
          ...locationMetadata(f),
          name: formText(f, 'name'),
          status: formText(f, 'status') as 'ACTIVE' | 'DISABLED',
          version: location.version,
        });
      else
        await createLocation(api, {
          ...locationMetadata(f),
          name: formText(f, 'name'),
          code: formText(f, 'code'),
        });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, setBusy, error, setError, save, brands };
}
