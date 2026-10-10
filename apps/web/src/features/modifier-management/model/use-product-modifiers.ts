import { useCallback, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { ProductModifierGroupDto, ModifierGroupsResponse } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { modifierMessages as text } from '@pos/ui/locales';
import { useRemoteData } from '../../../shared/lib';
import { readModifierGroups } from '../api/modifier-management.api';
import { readProductModifierGroups, saveProductModifierGroup } from '../api/product-modifiers.api';
import type { ProductModifiersProps } from './product-modifiers.types';

export function useProductModifiers({
  api,
  locationId,
  product,
  editable,
  onSaved,
}: ProductModifiersProps) {
  const bindings = useRemoteData(
    useCallback(
      () => readProductModifierGroups(api, locationId, product.id, editable),
      [api, locationId, product.id, editable],
    ),
  );
  const groups = useRemoteData(
    useCallback(
      () =>
        editable
          ? readModifierGroups(api, locationId)
          : Promise.resolve<ModifierGroupsResponse>({ modifierGroups: [], nextCursor: null }),
      [api, locationId, editable],
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  async function save(event: FormEvent<HTMLFormElement>, binding: ProductModifierGroupDto | null) {
    event.preventDefault();
    if (pending.current || !editable) return;
    const form = new FormData(event.currentTarget);
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await saveProductModifierGroup(api, product.id, binding, form);
      setNotice(text.saved);
      await Promise.all([bindings.refresh(), groups.refresh(), onSaved()]);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function reload() {
    if (pending.current) return;
    const [nextBindings, nextGroups] = await Promise.all([bindings.refresh(), groups.refresh()]);
    if (nextBindings && nextGroups) setError('');
  }
  async function moreBindings() {
    const cursor = bindings.data?.nextCursor;
    if (cursor)
      await bindings.append(
        () => readProductModifierGroups(api, locationId, product.id, editable, cursor),
        (current, page) => ({
          ...page,
          modifierGroups: [...current.modifierGroups, ...page.modifierGroups],
        }),
      );
  }
  async function moreGroups() {
    const cursor = groups.data?.nextCursor;
    if (cursor)
      await groups.append(
        () => readModifierGroups(api, locationId, cursor),
        (current, page) => ({
          ...page,
          modifierGroups: [...current.modifierGroups, ...page.modifierGroups],
        }),
      );
  }
  return { bindings, groups, busy, error, notice, save, reload, moreBindings, moreGroups };
}
