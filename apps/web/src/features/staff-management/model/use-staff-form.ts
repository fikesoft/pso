import { normalizePinInput } from '@pos/ui';
import { formText } from '../../../shared/lib';
import type { ScopeType, AuthenticationMethod } from '@pos/ui/types';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { errorMessage } from '@pos/ui/api';
import type { StaffFormProps } from './staff-form.types';
import { updateStaff, createStaff } from '../api/staff-form';
import { employeeFields } from '../lib/employee-fields';
export function useStaffForm({
  api,
  user,
  locations,
  roles,
  catalog,
  onSaved,
  onCredential,
}: StaffFormProps) {
  const [locationIds, setLocationIds] = useState<string[]>(
    user?.locationIds || user?.locations?.map((l) => l.locationId || l.id || '') || [],
  );
  const [roleVersionId, updateRoleVersionId] = useState('');
  const [authenticationMethod, setAuthenticationMethod] = useState<AuthenticationMethod>('PIN');
  const [scope, setScope] = useState<ScopeType>('LOCATION');
  const [locationId, setLocationId] = useState(locations[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewed, setPreviewed] = useState(false);
  const selectedRole = roles.flatMap((r) => r.versions).find((v) => v.id === roleVersionId);
  const requiresPassword = !!selectedRole?.permissions.some((item) =>
    catalog.some((permission) => permission.key === item.permission && permission.privileged),
  );
  function setRoleVersionId(id: string) {
    updateRoleVersionId(id);
    const role = roles.flatMap((value) => value.versions).find((version) => version.id === id);
    if (
      role?.permissions.some((item) =>
        catalog.some((permission) => permission.key === item.permission && permission.privileged),
      )
    )
      setAuthenticationMethod('PASSWORD');
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      if (user)
        await updateStaff(api, user.id, {
          ...employeeFields(f),
          displayName: formText(f, 'displayName'),
          status: formText(f, 'status'),
          locationIds,
          version: user.version,
        });
      else {
        const { data } = await createStaff(api, {
          ...employeeFields(f),
          displayName: formText(f, 'displayName'),
          login: formText(f, 'login'),
          authenticationMethod: requiresPassword ? 'PASSWORD' : authenticationMethod,
          ...(authenticationMethod === 'PIN' && !requiresPassword && formText(f, 'pin')
            ? { pin: normalizePinInput(formText(f, 'pin').trim()) }
            : {}),
          ...(authenticationMethod === 'PASSWORD' && formText(f, 'password')
            ? { password: formText(f, 'password') }
            : {}),
          locationIds,
          ...(formText(f, 'managedByUserId')
            ? { managedByUserId: formText(f, 'managedByUserId') }
            : {}),
          ...(roleVersionId
            ? {
                assignments: [
                  {
                    roleVersionId,
                    scopeType: scope,
                    ...(scope === 'LOCATION' ? { locationId } : {}),
                  },
                ],
              }
            : {}),
        });
        if (data.pin) onCredential({ kind: 'PIN', value: data.pin });
        else if (data.temporaryPassword)
          onCredential({ kind: 'PASSWORD', value: data.temporaryPassword });
      }
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function updateLocations(ids: string[]) {
    setLocationIds(ids);
    if (!ids.includes(locationId)) setLocationId(ids[0] || '');
    setPreviewed(false);
  }
  return {
    locationIds,
    updateLocations,
    roleVersionId,
    setRoleVersionId,
    scope,
    setScope,
    locationId,
    setLocationId,
    busy,
    setBusy,
    error,
    setError,
    previewed,
    setPreviewed,
    selectedRole,
    authenticationMethod,
    setAuthenticationMethod,
    requiresPassword,
    save,
  };
}
