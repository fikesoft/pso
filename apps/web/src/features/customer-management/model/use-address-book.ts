import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AddressManagementListResponse,
  AddressManagementProfile,
  AddressManagementQuery,
  AddressManagementDto,
} from '@pos/contracts';
import { addressManagementMessages as text } from '@pos/ui/locales';
import { readAddressBook, useAddressBookOperation } from '../../../entities/customer-address';
import { useRemoteData } from '../../../shared/lib';
import type { AddressBookProps } from './address-book.types';
export function useAddressBook(props: AddressBookProps) {
  const [filter, setFilter] = useState<AddressManagementQuery['status']>('ACTIVE');
  const [editing, setEditing] = useState<AddressManagementDto | null | undefined>(undefined);
  const depth = useRef(1);
  const load = useCallback(async () => {
    let result: AddressManagementListResponse | null = null;
    const addresses: AddressManagementDto[] = [];
    for (let page = 0; page < depth.current; page++) {
      result = await readAddressBook(props.api, props.customerId, {
        locationId: props.locationId,
        status: filter,
        limit: 20,
        cursor: result?.nextCursor ?? undefined,
      });
      addresses.push(...result.addresses);
      if (!result.nextCursor) break;
    }
    return { ...result!, addresses };
  }, [props.api, props.customerId, props.locationId, filter]);
  const list = useRemoteData(load);
  const operation = useAddressBookOperation({
    ...props,
    onSaved: async () => {
      setEditing(undefined);
      list.setData(null);
      if (!(await list.refresh())) throw new Error(text.refreshRequired);
    },
  });
  const onLockedChange = props.onLockedChange;
  useEffect(() => {
    onLockedChange(operation.locked);
    return () => onLockedChange(false);
  }, [operation.locked, onLockedChange]);
  const pending = operation.busy || operation.recovering;
  const locked = operation.locked || props.parentLocked || list.loading || !!list.error;
  const canMutate = props.active && props.canManage;
  async function refresh() {
    if (pending || props.parentLocked) return;
    setEditing(undefined);
    list.setData(null);
    if (await list.refresh()) operation.refreshed();
  }
  async function save(profile: AddressManagementProfile) {
    if (locked || !canMutate || editing === undefined) return;
    const identity = { locationId: props.locationId, requestKey: crypto.randomUUID() };
    await operation.send(
      editing
        ? {
            ...identity,
            action: 'UPDATE',
            addressId: editing.id,
            version: editing.version,
            profile,
          }
        : { ...identity, action: 'CREATE', profile },
    );
  }
  async function act(
    address: AddressManagementDto,
    action: 'ARCHIVE' | 'SET_DEFAULT' | 'CLEAR_DEFAULT',
  ) {
    if (locked || !canMutate || !list.data) return;
    const identity = {
      locationId: props.locationId,
      requestKey: crypto.randomUUID(),
      addressId: address.id,
      version: address.version,
    };
    await operation.send(
      action === 'ARCHIVE'
        ? { ...identity, action }
        : { ...identity, action, preferenceVersion: list.data.preference.version },
    );
  }
  async function more() {
    if (locked || !list.data?.nextCursor) return;
    depth.current++;
    await refresh();
  }
  function changeFilter(next: AddressManagementQuery['status']) {
    if (pending || props.parentLocked) return;
    depth.current = 1;
    setEditing(undefined);
    list.setData(null);
    setFilter(next);
  }
  return {
    list,
    operation,
    pending,
    locked,
    canMutate,
    filter,
    changeFilter,
    editing,
    setEditing,
    refresh,
    save,
    act,
    more,
  };
}
