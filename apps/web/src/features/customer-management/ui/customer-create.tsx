import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import type { CustomerCreateRequest } from '@pos/contracts';
import { Button, Notice } from '@pos/ui';
import { errorMessage } from '@pos/ui/api';
import { customerManagementMessages as text } from '@pos/ui/locales';
import { createCustomer } from '../../../entities/customer';
import type { CustomerCreateProps } from '../model/customer-management.types';
import { customerProfileFromForm } from '../model/customer-profile';
import { CustomerProfileFields } from './customer-profile-fields';
export function CustomerCreate({ api, locationId, onSaved, onLockedChange }: CustomerCreateProps) {
  const attempt = useRef<CustomerCreateRequest | null>(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function send() {
    if (pending.current || !attempt.current) return;
    pending.current = true;
    setBusy(true);
    onLockedChange(true);
    setError('');
    try {
      await createCustomer(api, attempt.current);
      if (!mounted.current) return;
      attempt.current = null;
      setUnknown(false);
      onLockedChange(false);
      await onSaved();
    } catch (failure) {
      if (!mounted.current) return;
      const status = axios.isAxiosError(failure) ? failure.response?.status : undefined;
      const uncertain = unknown || !status || status >= 500;
      setUnknown(uncertain);
      onLockedChange(uncertain);
      if (!uncertain) attempt.current = null;
      setError(errorMessage(failure));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <form
      className="form-stack"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending.current || unknown) return;
        try {
          attempt.current = {
            ...customerProfileFromForm(event.currentTarget),
            locationId,
            requestKey: crypto.randomUUID(),
          };
          await send();
        } catch (failure) {
          setError(errorMessage(failure));
        }
      }}
    >
      {error && <Notice>{error}</Notice>}
      {unknown && <Notice tone="info">{text.createUnknown}</Notice>}
      <CustomerProfileFields disabled={busy || unknown} />
      {unknown ? (
        <Button type="button" busy={busy} onClick={() => void send()}>
          {text.retry}
        </Button>
      ) : (
        <Button type="submit" busy={busy}>
          {text.register}
        </Button>
      )}
    </form>
  );
}
