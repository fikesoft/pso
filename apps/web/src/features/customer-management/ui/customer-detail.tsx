import { CustomerAnalytics } from './customer-analytics';
import { CustomerHistory } from './customer-history';
import { AddressBook } from './address-book';
import { useCallback } from 'react';
import { Loading, Notice } from '@pos/ui';
import { readManagedCustomer } from '../../../entities/customer';
import { useRemoteData } from '../../../shared/lib';
import type { CustomerDetailProps } from '../model/customer-management.types';
import { CustomerEditor } from './customer-editor';
export function CustomerDetail(props: CustomerDetailProps) {
  const load = useCallback(
    () => readManagedCustomer(props.api, props.customerId, props.locationId),
    [props.api, props.customerId, props.locationId],
  );
  const detail = useRemoteData(load);
  if (detail.loading) return <Loading />;
  if (detail.error) return <Notice>{detail.error}</Notice>;
  if (!detail.data) return null;
  return (
    <div className="form-stack">
      <CustomerEditor
        key={`${detail.data.id}:${detail.data.version}`}
        {...props}
        customer={detail.data}
        locked={props.locked || props.addressLocked}
      />
      <AddressBook
        {...props}
        active={detail.data.status === 'ACTIVE'}
        canManage={props.canManageAddresses}
        parentLocked={props.locked}
        onLockedChange={props.onAddressLockedChange}
      />
      {props.canReadAnalytics && <CustomerAnalytics {...props} />}
      {props.canReadOrders && <CustomerHistory {...props} />}
    </div>
  );
}
