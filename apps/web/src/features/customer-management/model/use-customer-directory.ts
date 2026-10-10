import { useCallback, useEffect, useRef, useState } from 'react';
import type { CustomerManagementListResponse } from '@pos/contracts';
import { customerManagementMessages as text } from '@pos/ui/locales';
import { readCustomers, searchCustomers, useCustomerOperation } from '../../../entities/customer';
import { useRemoteData, isAccessRejection } from '../../../shared/lib';
import { CUSTOMER_REFRESH_MS } from '../config/customer-management.constants';
import type { CustomerDirectoryQuery, CustomerManagementProps } from './customer-management.types';

export function useCustomerDirectory(props: CustomerManagementProps) {
  const [query, setQuery] = useState<CustomerDirectoryQuery>({ status: 'ACTIVE' });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [addressLocked, setAddressLocked] = useState(false);
  const [createLocked, setCreateLocked] = useState(false);
  const depth = useRef(1);
  const load = useCallback(async () => {
    const result: CustomerManagementListResponse = { customers: [], nextCursor: null };
    const seen = new Set<string>();
    for (let page = 0; page < depth.current; page++) {
      const input = {
        locationId: props.locationId,
        status: query.status,
        limit: 30,
        cursor: result.nextCursor ?? undefined,
      };
      const next =
        query.field && query.query
          ? await searchCustomers(props.api, { ...input, field: query.field, query: query.query })
          : await readCustomers(props.api, input);
      for (const customer of next.customers)
        if (!seen.has(customer.id)) {
          seen.add(customer.id);
          result.customers.push(customer);
        }
      result.nextCursor = next.nextCursor;
      if (!next.nextCursor) break;
    }
    return result;
  }, [props.api, props.locationId, query]);
  const list = useRemoteData(load);
  async function saved() {
    setSelected(null);
    setCreating(false);
    setCreateLocked(false);
    list.setData(null);
    if (!(await list.refresh())) throw new Error(text.refreshRequired);
  }
  const operation = useCustomerOperation({ ...props, onSaved: saved });
  const pending = operation.busy || operation.recovering || createLocked || addressLocked;
  const locked = operation.locked || list.loading || !!list.error || createLocked || addressLocked;
  useEffect(() => {
    if (pending) return;
    let disposed = false;
    let refreshing = false;
    const refresh = async () => {
      if (disposed || refreshing || document.visibilityState !== 'visible') return;
      refreshing = true;
      try {
        await list.revalidate(load, isAccessRejection);
      } finally {
        refreshing = false;
      }
    };
    const timer = window.setInterval(() => void refresh(), CUSTOMER_REFRESH_MS);
    const resume = () => void refresh();
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [pending, load, list.revalidate]);
  async function refresh() {
    if (pending) return;
    setSelected(null);
    list.setData(null);
    if (await list.refresh()) operation.refreshed();
  }
  async function more() {
    if (locked || !list.data?.nextCursor) return;
    depth.current++;
    await refresh();
  }
  function changeQuery(next: CustomerDirectoryQuery) {
    if (pending) return;
    depth.current = 1;
    setSelected(null);
    list.setData(null);
    setQuery(next);
  }
  return {
    addressLocked,
    setAddressLocked,
    list,
    query,
    changeQuery,
    selected,
    setSelected,
    creating,
    setCreating,
    createLocked,
    setCreateLocked,
    operation,
    pending,
    locked,
    refresh,
    more,
    saved,
  };
}
