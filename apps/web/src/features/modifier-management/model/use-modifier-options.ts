import { useCallback, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { ModifierOptionDto } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { modifierMessages as text } from '@pos/ui/locales';
import { useRemoteData } from '../../../shared/lib';
import {
  readModifierOption,
  readModifierOptions,
  saveModifierOption,
} from '../api/modifier-management.api';
import type { ModifierOptionsProps } from './modifier-management.types';

export function useModifierOptions({ api, locationId, group, onChanged }: ModifierOptionsProps) {
  const options = useRemoteData(
    useCallback(() => readModifierOptions(api, locationId, group.id), [api, locationId, group.id]),
  );
  const [editing, setEditing] = useState<ModifierOptionDto | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  function edit(option: ModifierOptionDto | null) {
    setError('');
    setEditing(option);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || editing === undefined) return;
    const form = new FormData(event.currentTarget);
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await saveModifierOption(api, group.id, editing, form);
      setEditing(undefined);
      setNotice(text.saved);
      await Promise.all([options.refresh(), onChanged()]);
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
      setEditing(await readModifierOption(api, locationId, group.id, editing.id));
      setError('');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function more() {
    const cursor = options.data?.nextCursor;
    if (cursor)
      await options.append(
        () => readModifierOptions(api, locationId, group.id, cursor),
        (current, page) => ({
          ...page,
          modifierOptions: [...current.modifierOptions, ...page.modifierOptions],
        }),
      );
  }
  return { options, editing, setEditing, edit, save, reloadEditing, more, busy, error, notice };
}
