import { useState } from 'react';
import type { FormEvent } from 'react';
import { errorMessage } from '@pos/ui/api';
import { provisionOrganization } from '../api/provision-organization.api';
import type {
  ProvisionOrganizationOptions,
  ProvisionOrganizationController,
  ProvisionedCredential,
} from './provision-organization.types';
export function useProvisionOrganization({
  api,
  onCreated,
}: ProvisionOrganizationOptions): ProvisionOrganizationController {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [credential, setCredential] = useState<ProvisionedCredential | null>(null);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const { temporaryPassword } = await provisionOrganization(api, {
        name: form.get('name'),
        slug: form.get('slug'),
        legalName: form.get('legalName'),
        adminLogin: form.get('adminLogin'),
        adminDisplayName: form.get('adminDisplayName'),
        ...(form.get('password') ? { password: form.get('password')! } : {}),
      });
      setCredential({
        password: temporaryPassword,
        slug: String(form.get('slug')),
        login: String(form.get('adminLogin')),
      });
      setOpen(false);
      await onCreated();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return {
    open,
    setOpen,
    busy,
    error,
    credential,
    create,
    dismissCredential: () => setCredential(null),
    start: () => {
      setError('');
      setOpen(true);
    },
  };
}
