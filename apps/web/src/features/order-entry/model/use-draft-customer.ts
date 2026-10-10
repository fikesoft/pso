import { clearLinkedDraftAddress } from '../lib/draft-address';
import { detachDraftCustomer } from '../lib/draft-customer';
import { useEffect, useRef, useState } from 'react';
import type { CustomerCreateRequest } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { customerMessages as text } from '@pos/ui/locales';
import { createCustomer, lookupCustomer } from '../../../entities/customer';
import { customerRegistrationUnknown } from '../lib/customer-registration';
import type { CustomerLookupResult, DraftCustomerInput } from './draft-customer.types';
export function useDraftCustomer(input: DraftCustomerInput) {
  const [result, setResult] = useState<CustomerLookupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const attempt = useRef<CustomerCreateRequest | null>(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  const latest = useRef(input);
  latest.current = input;
  const phone = input.draft.customer?.phone?.trim() ?? '';
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const visible = result?.phone === phone ? result : null;
  async function lookup() {
    if (pending.current || attempt.current || input.disabled || !input.canRead || !phone) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    setResult(null);
    try {
      const customer = await lookupCustomer(input.api, { locationId: input.locationId, phone });
      if (
        mounted.current &&
        latest.current.draft.customer?.phone?.trim() === phone &&
        !latest.current.disabled &&
        latest.current.canRead
      )
        setResult({ phone, customer });
    } catch (error) {
      if (mounted.current) setError(errorMessage(error));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function register() {
    if (pending.current || input.disabled) return;
    if (!attempt.current && (!input.canRead || !input.canCreate)) return;
    if (!attempt.current && (!visible || visible.customer || !phone)) return;
    attempt.current ??= structuredClone({
      locationId: input.locationId,
      requestKey: crypto.randomUUID(),
      phone,
      name: input.draft.customer?.name ?? null,
    });
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const customer = await createCustomer(input.api, attempt.current);
      if (!mounted.current) return;
      setResult({ phone: attempt.current.phone, customer });
      attempt.current = null;
      setUncertain(false);
      setNotice(text.created);
    } catch (error) {
      if (!mounted.current) return;
      const unknown = customerRegistrationUnknown(error, uncertain);
      setUncertain(unknown);
      if (!unknown) {
        attempt.current = null;
        setResult(null);
      }
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function select() {
    if (
      pending.current ||
      attempt.current ||
      input.disabled ||
      !input.canRead ||
      !visible?.customer
    )
      return;
    const customer = visible.customer;
    input.setDraft((draft) => ({
      ...(draft.customerRef?.id !== customer.id ? clearLinkedDraftAddress(draft) : draft),
      customer: { name: customer.name, phone: customer.phone },
      customerEdited: false,
      customerRef: { id: customer.id, version: customer.version },
      customerRefEdited: true,
    }));
    setResult(null);
    setNotice('');
  }
  function detach() {
    if (pending.current || attempt.current || input.disabled) return;
    input.setDraft((draft) => detachDraftCustomer(draft, input.order));
    setResult(null);
    setNotice('');
  }
  return {
    canRead: input.canRead,
    canCreate: input.canRead && input.canCreate,
    result: visible,
    busy,
    uncertain,
    locked: busy || uncertain,
    error,
    notice,
    lookup,
    register,
    select,
    detach,
  };
}
