import { formText } from '../../../shared/lib';
import type { PermissionItem } from '@pos/ui/types';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { errorMessage } from '@pos/ui/api';
import type { RoleFormProps } from './role-form.types';
import { publishRoleVersion, createRole } from '../api/role-form';
export function useRoleForm({ api, role, onSaved }: RoleFormProps) {
  const [permissions, setPermissions] = useState<PermissionItem[]>(
    role ? [...(role.versions.at(-1)?.permissions || [])] : [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      if (role) await publishRoleVersion(api, role.id, { permissions });
      else
        await createRole(api, {
          name: formText(f, 'name'),
          description: formText(f, 'description'),
          permissions,
        });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return { permissions, setPermissions, busy, setBusy, error, setError, save };
}
