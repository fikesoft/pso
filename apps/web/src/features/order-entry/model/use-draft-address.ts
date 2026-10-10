import { useCallback, useRef, useState } from 'react';
import { readCustomerAddresses } from '../../../entities/customer-address';
import { useRemoteData, isAccessRejection } from '../../../shared/lib';
import { useAddressCommand } from './use-address-command';
import { selectDraftAddress, detachDraftAddress, clearDraftAddress } from '../lib/draft-address';
import type { CustomerAddressDto } from '@pos/contracts';
import type { DraftAddressInput } from './draft-address.types';
export function useDraftAddress(input: DraftAddressInput) {
  const customerId = input.draft.customerRef?.id;
  const visible = input.canRead && input.draft.serviceType === 'DELIVERY' && !!customerId;
  const load = useCallback(
    async () => ({
      ...(visible
        ? await readCustomerAddresses(input.api, customerId!, input.locationId)
        : { addresses: [], nextCursor: null }),
      customerId,
    }),
    [input.api, input.locationId, customerId, visible],
  );
  const list = useRemoteData(load);
  const [label, setLabel] = useState('');
  const paging = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const refresh = () => list.revalidate(load, isAccessRejection);
  const command = useAddressCommand({
    ...input,
    onResult(address) {
      if (address.status === 'ARCHIVED')
        input.setDraft((draft) =>
          draft.addressRef?.id === address.id && draft.addressRefEdited
            ? { ...draft, addressInvalid: true }
            : draft,
        );
      void refresh();
    },
  });
  function locked() {
    return input.disabled || input.isOtherLocked() || command.locked;
  }
  function select(address: CustomerAddressDto) {
    if (locked() || !input.canRead || list.loading || list.error) return;
    input.setDraft((draft) => selectDraftAddress(draft, address));
  }
  async function create() {
    if (
      locked() ||
      !input.canManage ||
      !input.canRead ||
      !customerId ||
      input.draft.serviceType !== 'DELIVERY' ||
      !input.draft.deliveryAddress?.address.trim()
    )
      return;
    await command.create(customerId, {
      ...input.draft.deliveryAddress,
      label: label.trim() || null,
    });
  }
  async function archive(address: CustomerAddressDto) {
    if (
      locked() ||
      !input.canManage ||
      !input.canRead ||
      list.loading ||
      list.error ||
      customerId !== address.customerId
    )
      return;
    await command.archive(address);
  }
  async function more() {
    const data = list.data;
    if (
      !visible ||
      list.loading ||
      paging.current ||
      data?.customerId !== customerId ||
      !data?.nextCursor
    )
      return;
    paging.current = true;
    setLoadingMore(true);
    try {
      await list.revalidate(async () => {
        const page = await readCustomerAddresses(
          input.api,
          customerId!,
          input.locationId,
          data.nextCursor!,
        );
        return {
          ...page,
          customerId,
          addresses: [
            ...new Map(
              [...data.addresses, ...page.addresses].map((address) => [address.id, address]),
            ).values(),
          ],
        };
      }, isAccessRejection);
    } finally {
      paging.current = false;
      setLoadingMore(false);
    }
  }
  return {
    ...command,
    list: {
      ...list,
      refresh,
      loadingMore,
      data: visible && list.data?.customerId === customerId ? list.data : null,
    },
    label,
    setLabel,
    canRead: input.canRead,
    canManage: input.canManage && input.canRead,
    customerId,
    create,
    archive,
    select,
    more,
    detach: () => {
      if (!locked()) input.setDraft((draft) => detachDraftAddress(draft, input.order));
    },
    clear: () => {
      if (!locked()) input.setDraft(clearDraftAddress);
    },
  };
}
