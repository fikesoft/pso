import { useEffect, useRef, useState } from 'react';
import type { CustomerAddressCreateRequest, CustomerAddressDto } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { addressMessages as text } from '@pos/ui/locales';
import {
  archiveCustomerAddress,
  createCustomerAddress,
  resolveCustomerAddress,
} from '../../../entities/customer-address';
import {
  clearAddressPointer,
  readAddressPointer,
  storeAddressPointer,
} from '../lib/address-pointer';
import { customerRegistrationUnknown } from '../lib/customer-registration';
import type {
  AddressCommandInput,
  AddressCreateFields,
  AddressPointer,
} from './draft-address.types';
export function useAddressCommand(input: AddressCommandInput) {
  const [ready, setReady] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<CustomerAddressDto | null>(null);
  const pointer = useRef<AddressPointer | null>(null);
  const payload = useRef<CustomerAddressCreateRequest | null>(null);
  const uncertain = useRef(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  const current = useRef(input);
  current.current = input;
  useEffect(() => {
    mounted.current = true;
    try {
      pointer.current = readAddressPointer(sessionStorage, input);
      uncertain.current = !!pointer.current;
      setRecovering(!!pointer.current);
      setReady(true);
    } catch {
      setError(text.storageError);
    }
    return () => {
      mounted.current = false;
    };
    // The enclosing composer is keyed by organization, actor and location.
  }, []);
  function blocked() {
    return !ready || pending.current || current.current.disabled || current.current.isOtherLocked();
  }
  function checked(address: CustomerAddressDto, expected: AddressPointer) {
    if (
      !address?.id ||
      address.customerId !== expected.customerId ||
      !Number.isInteger(address.version) ||
      address.version < 1 ||
      !['ACTIVE', 'ARCHIVED'].includes(address.status) ||
      typeof address.address !== 'string' ||
      !address.address.trim() ||
      (address.label !== null && typeof address.label !== 'string') ||
      (address.instructions !== null && typeof address.instructions !== 'string') ||
      (expected.operation === 'ARCHIVE' &&
        (address.id !== expected.addressId ||
          address.status !== 'ARCHIVED' ||
          address.version !== expected.version! + 1))
    )
      throw new Error(text.invalid);
    return address;
  }
  function finish(address?: CustomerAddressDto) {
    clearAddressPointer(sessionStorage, pointer.current!);
    pointer.current = null;
    payload.current = null;
    uncertain.current = false;
    if (!mounted.current) return;
    setRecovering(false);
    setError('');
    setResult(address ?? null);
    setNotice(address ? (address.status === 'ACTIVE' ? text.saved : text.archived) : text.retired);
    if (address) current.current.onResult(address);
  }
  async function retry() {
    if (
      blocked() ||
      !pointer.current ||
      (pointer.current.operation === 'CREATE' && !payload.current)
    )
      return;
    pending.current = true;
    setBusy(true);
    setError('');
    let sent = false;
    try {
      storeAddressPointer(sessionStorage, pointer.current);
      sent = true;
      const address =
        pointer.current.operation === 'CREATE'
          ? await createCustomerAddress(input.api, pointer.current.customerId, payload.current!)
          : await archiveCustomerAddress(
              input.api,
              pointer.current.customerId,
              pointer.current.addressId!,
              {
                locationId: pointer.current.locationId,
                requestKey: pointer.current.requestKey,
                version: pointer.current.version!,
              },
            );
      finish(checked(address, pointer.current));
    } catch (error) {
      if (!sent) {
        try {
          const stored = readAddressPointer(sessionStorage, input);
          if (stored && JSON.stringify(stored) !== JSON.stringify(pointer.current)) {
            pointer.current = stored;
            payload.current = null;
          }
        } catch {
          /* Keep the opaque attempt locked until storage can be checked. */
        }
      }
      const canRelease = sent && !customerRegistrationUnknown(error, uncertain.current);
      if (canRelease) {
        try {
          clearAddressPointer(sessionStorage, pointer.current!);
          pointer.current = null;
          payload.current = null;
          uncertain.current = false;
        } catch {
          uncertain.current = true;
        }
      } else uncertain.current = true;
      if (mounted.current) {
        setRecovering(!!pointer.current);
        setError(errorMessage(error));
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function create(customerId: string, fields: AddressCreateFields) {
    if (blocked() || pointer.current) return;
    payload.current = structuredClone({
      ...fields,
      locationId: input.locationId,
      requestKey: crypto.randomUUID(),
    });
    pointer.current = {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      locationId: input.locationId,
      customerId,
      requestKey: payload.current.requestKey,
      operation: 'CREATE',
    };
    setRecovering(true);
    setNotice('');
    await retry();
  }
  async function archive(address: CustomerAddressDto) {
    if (blocked() || pointer.current) return;
    pointer.current = {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      locationId: input.locationId,
      customerId: address.customerId,
      requestKey: crypto.randomUUID(),
      operation: 'ARCHIVE',
      addressId: address.id,
      version: address.version,
    };
    setRecovering(true);
    setNotice('');
    await retry();
  }
  async function resolve() {
    if (blocked() || !pointer.current || pointer.current.operation !== 'CREATE') return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      storeAddressPointer(sessionStorage, pointer.current);
      const value = await resolveCustomerAddress(input.api, pointer.current.customerId, {
        locationId: pointer.current.locationId,
        requestKey: pointer.current.requestKey,
      });
      if (value.status === 'CREATED') finish(checked(value.address, pointer.current));
      else if (
        value.status === 'RETIRED' &&
        value.customerId === pointer.current.customerId &&
        value.locationId === pointer.current.locationId &&
        value.requestKey === pointer.current.requestKey
      )
        finish();
      else throw new Error(text.invalid);
    } catch (error) {
      if (mounted.current) setError(errorMessage(error));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    ready,
    recovering,
    busy,
    locked: !ready || recovering || busy,
    error,
    notice,
    result,
    create,
    archive,
    retry,
    resolve,
    operation: pointer.current?.operation,
    canRetry: pointer.current?.operation === 'ARCHIVE' || !!payload.current,
  };
}
