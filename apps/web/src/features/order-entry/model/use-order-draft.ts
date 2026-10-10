import { initialOrderDraft, linkedDraftInput } from '../lib/linked-draft-input';
import { newDraftLine } from '../lib/draft-line';
import { useDraftAddress } from './use-draft-address';
import { useDraftCustomer } from './use-draft-customer';
import { useModifierChoices } from './use-modifier-choices';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogProduct, ManualOrderSource, Order } from '@pos/contracts';
import { MODIFIER_CONFIGURATION_STALE } from '@pos/contracts/modifiers';
import { MENU_SCHEDULE_UNAVAILABLE } from '@pos/contracts/menu-schedules';
import axios from 'axios';
import { errorMessage } from '@pos/ui/api';
import { operationalMessages as text } from '@pos/ui/locales';
import { readOrder, updateOrder } from '../../../entities/order';
import { previewProductModifiers } from '../../../entities/modifier';
import type { ModifierChoices } from '../../../entities/modifier';
import { versionedMutationFailure } from '../../../shared/lib';
import type { UpdateOrderInput } from '../../../entities/order';
import { useProductAvailability } from '../../../entities/catalog';
import { acceptUpsellOffer } from '../../../entities/upsell';
import { draftFromOrder, draftInput } from '../lib/draft';
import { useOrderCreation } from './use-order-creation';
import type { OrderEditorProps } from './order-entry.types';
export function useOrderDraft({
  api,
  locationId,
  organizationId,
  actorUserId,
  order,
  onSaved,
  onReload,
  onRefreshProducts,
  tableContext,
  canReadCustomers = false,
  canCreateCustomers = false,
  canManageAddresses = false,
}: OrderEditorProps) {
  const [draft, setDraft] = useState(() => initialOrderDraft(order, tableContext));
  const [source, setSource] = useState<ManualOrderSource>(tableContext ? 'WAITER' : 'POS');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  const [catalogStale, setCatalogStale] = useState(false);
  const [menuUnavailable, setMenuUnavailable] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<CatalogProduct | null>(null);
  const [pendingOfferId, setPendingOfferId] = useState<string | undefined>();
  const pendingAvailable = useProductAvailability(api, locationId, pendingProduct?.id);
  const { choices, setChoices, toggleOption } = useModifierChoices();
  const pending = useRef(false);
  const pendingEdit = useRef<UpdateOrderInput | null>(null);
  const unconfirmed = useRef(false);
  const mounted = useRef(true);
  const creation = useOrderCreation({
    api,
    organizationId,
    actorUserId,
    locationId,
    enabled: !order,
    onSaved,
    onSettled: () => {
      unconfirmed.current = false;
      setUncertain(false);
      setCatalogStale(false);
      setMenuUnavailable(false);
      setError('');
    },
  });
  const orderLocked =
    busy ||
    uncertain ||
    stale ||
    (!order && (!creation.ready || creation.recovering || creation.busy));
  const customerLock = useRef(false);
  const addresses = useDraftAddress({
    api,
    organizationId,
    actorUserId,
    locationId,
    draft,
    order,
    setDraft,
    disabled: orderLocked,
    isOtherLocked: () => customerLock.current,
    canRead: canReadCustomers,
    canManage: canManageAddresses,
  });
  const customerLookup = useDraftCustomer({
    api,
    locationId,
    draft,
    order,
    setDraft,
    disabled: orderLocked || addresses.locked,
    canRead: canReadCustomers,
    canCreate: canCreateCustomers,
  });
  customerLock.current = customerLookup.locked;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function add(product: CatalogProduct, offerId?: string) {
    if (pending.current || uncertain || stale || customerLookup.locked || addresses.locked) return;
    if (!product.enabled || product.price === null || product.status !== 'ACTIVE') return;
    if (product.scheduleAvailability?.available === false) return;
    if (product.modifierGroups.length) {
      setPendingProduct(product);
      setPendingOfferId(offerId);
      setChoices({});
      return;
    }
    void append(product, {}, [], offerId);
  }
  async function append(
    product: CatalogProduct,
    selected: ModifierChoices,
    groups = product.modifierGroups,
    offerId?: string,
  ) {
    if (pending.current) return false;
    const preview = previewProductModifiers({ ...product, modifierGroups: groups }, selected);
    if (!preview.valid) return false;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      if (offerId) await acceptUpsellOffer(api, offerId);
      if (!mounted.current) return false;
      setDraft((value) => ({
        ...value,
        items: [...value.items, newDraftLine(product, preview, offerId)],
      }));
      return true;
    } catch (error) {
      if (mounted.current) setError(errorMessage(error));
      return false;
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function confirmPending() {
    if (!pendingProduct) return;
    if (!pendingAvailable) {
      setError(text.productChanged);
      return;
    }
    const preview = previewProductModifiers(pendingProduct, choices);
    if (!preview.valid) return;
    if (await append(pendingProduct, choices, pendingProduct.modifierGroups, pendingOfferId)) {
      setPendingProduct(null);
      setChoices({});
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      pending.current ||
      stale ||
      customerLookup.locked ||
      addresses.locked ||
      draft.addressInvalid
    )
      return;
    pending.current = true;
    setBusy(true);
    setError('');
    let saved: Order | undefined;
    try {
      if (order) {
        pendingEdit.current ??= structuredClone({ ...draftInput(draft), version: order.version });
        saved = await updateOrder(api, order.id, pendingEdit.current);
      } else {
        saved = await creation.save({
          ...linkedDraftInput(draft, tableContext),
          source,
          locationId,
        });
      }
      if (mounted.current) {
        unconfirmed.current = false;
        setUncertain(false);
      }
      pendingEdit.current = null;
    } catch (error) {
      if (!mounted.current) return;
      // Preserve the original create payload until its outcome is confirmed.
      const failure = versionedMutationFailure(error, unconfirmed.current);
      const unknown = order ? failure.uncertain : creation.isUncertain();
      unconfirmed.current = unknown;
      setUncertain(unknown);
      setStale(!!order && failure.stale);
      setCatalogStale(
        !unknown &&
          !order &&
          axios.isAxiosError(error) &&
          error.response?.data?.code === MODIFIER_CONFIGURATION_STALE,
      );
      setMenuUnavailable(
        !unknown &&
          !order &&
          axios.isAxiosError(error) &&
          error.response?.data?.code === MENU_SCHEDULE_UNAVAILABLE,
      );
      if (!unknown) {
        pendingEdit.current = null;
      }
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
    if (saved && mounted.current) {
      try {
        await onSaved(saved);
      } catch (error) {
        setError(errorMessage(error));
        onReload(saved);
      }
    }
  }
  async function reload() {
    if (
      !order ||
      pending.current ||
      unconfirmed.current ||
      customerLookup.locked ||
      addresses.locked
    )
      return;
    setBusy(true);
    pending.current = true;
    try {
      const [current] = await Promise.all([readOrder(api, order.id), onRefreshProducts()]);
      if (mounted.current) {
        setDraft(draftFromOrder(current));
        setError('');
        setStale(false);
        setCatalogStale(false);
        setMenuUnavailable(false);
        setPendingProduct(null);
        onReload(current);
      }
    } catch (error) {
      if (mounted.current) setError(errorMessage(error));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function reloadCatalog() {
    setBusy(true);
    try {
      await onRefreshProducts();
      setCatalogStale(false);
      setMenuUnavailable(false);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return {
    draft,
    source,
    setSource,
    setDraft,
    busy: busy || creation.busy || customerLookup.busy,
    customerLookup,
    addresses,
    creation,
    error,
    uncertain,
    stale,
    catalogStale,
    menuUnavailable,
    pendingProduct,
    pendingAvailable,
    choices,
    add,
    confirmPending,
    toggleOption,
    cancelPending: () => setPendingProduct(null),
    save,
    reload,
    reloadCatalog,
    locked: orderLocked || customerLookup.locked || addresses.locked,
    hint: uncertain ? text.retryUnknown : stale ? text.stale : '',
  };
}
