import type { PermissionItem, ScopeType } from '@pos/ui/types';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { errorMessage } from '@pos/ui/api';
import type { DelegationFormProps } from './delegation-form.types';
import { createDelegation } from '../api/delegation-form';
export function useDelegationForm({ api, locations, onSaved }: DelegationFormProps) {
  const [userId, setUserId] = useState('');
  const [scope, setScope] = useState<ScopeType>('LOCATION');
  const [locationId, setLocationId] = useState(locations[0]?.id || '');
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewed, setPreviewed] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createDelegation(api, {
        userId,
        scopeType: scope,
        ...(scope === 'LOCATION' ? { locationId } : {}),
        permissions,
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return {
    userId,
    setUserId,
    scope,
    setScope,
    locationId,
    setLocationId,
    permissions,
    setPermissions,
    busy,
    setBusy,
    error,
    setError,
    previewed,
    setPreviewed,
    save,
  };
}
