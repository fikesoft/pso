import { useCallback, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { ModifierGroupDto } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { modifierMessages as text } from '@pos/ui/locales';
import { formText, useRemoteData } from '../../../shared/lib';
import {
  readModifierGroup,
  readModifierGroups,
  saveModifierGroup,
} from '../api/modifier-management.api';
import type { ModifierManagementProps } from './modifier-management.types';

export function useModifierGroups({ api, locationId }: ModifierManagementProps) {
  const groups = useRemoteData(
    useCallback(() => readModifierGroups(api, locationId), [api, locationId]),
  );
  const [editing, setEditing] = useState<ModifierGroupDto | null | undefined>();
  const [selected, setSelected] = useState<ModifierGroupDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  function edit(group: ModifierGroupDto | null) {
    setError('');
    setEditing(group);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || editing === undefined) return;
    const form = new FormData(event.currentTarget);
    if (Number(formText(form, 'minSelections')) > Number(formText(form, 'maxSelections')))
      return setError(text.invalidRange);
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await saveModifierGroup(api, editing, form);
      setEditing(undefined);
      setNotice(text.saved);
      await groups.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function reloadEditing() {
    if (!editing || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      setEditing(await readModifierGroup(api, locationId, editing.id));
      setError('');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function refreshSelected() {
    if (selected) setSelected(await readModifierGroup(api, locationId, selected.id));
    await groups.refresh();
  }
  async function more() {
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
  return {
    groups,
    editing,
    setEditing,
    selected,
    setSelected,
    edit,
    save,
    reloadEditing,
    refreshSelected,
    more,
    busy,
    error,
    notice,
  };
}
