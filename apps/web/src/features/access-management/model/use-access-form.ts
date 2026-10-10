import type { CreateOverrideRequest } from './access-request.types';
import type { ScopeType } from '@pos/ui/types';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { errorMessage } from '@pos/ui/api';
import type { AccessFormProps } from './access-form.types';
import { assignRole, createOverride } from '../api/access-form';
export function useAccessForm({ api, user, locations, onSaved }: AccessFormProps) {
  const [mode, setMode] = useState('assignment');
  const [scope, setScope] = useState<ScopeType>('LOCATION');
  const [locationId, setLocationId] = useState(locations[0]?.id || '');
  const [roleVersionId, setRoleVersionId] = useState('');
  const [permission, setPermission] = useState('');
  const [effect, setEffectState] = useState<CreateOverrideRequest['effect']>('DENY');
  const setEffect = (value: string) => setEffectState(value === 'ALLOW' ? 'ALLOW' : 'DENY');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewed, setPreviewed] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const shared = { scopeType: scope, ...(scope === 'LOCATION' ? { locationId } : {}) };
      if (mode === 'assignment') await assignRole(api, user.id, { ...shared, roleVersionId });
      else await createOverride(api, user.id, { ...shared, permission, effect });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return {
    mode,
    setMode,
    scope,
    setScope,
    locationId,
    setLocationId,
    roleVersionId,
    setRoleVersionId,
    permission,
    setPermission,
    effect,
    setEffect,
    busy,
    setBusy,
    error,
    setError,
    previewed,
    setPreviewed,
    save,
  };
}
