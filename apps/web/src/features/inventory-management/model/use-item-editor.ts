import axios from 'axios';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { InventoryKind, InventoryUnit, InventoryStatus } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { createInventoryItem, updateInventoryItem, readInventoryItem } from '../api/inventory.api';
import type { ItemEditorProps } from './inventory.types';
export function useItemEditor(props: ItemEditorProps) {
  const [item, setItem] = useState(props.item);
  const [name, setName] = useState(item?.name ?? '');
  const [sku, setSku] = useState(item?.sku ?? '');
  const [kind, setKind] = useState<InventoryKind>(item?.kind ?? 'INGREDIENT');
  const [unit, setUnit] = useState<InventoryUnit>(item?.unit ?? 'G');
  const [status, setStatus] = useState<InventoryStatus>(item?.status ?? 'ACTIVE');
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || stale) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      if (item)
        await updateInventoryItem(props.api, item.id, { version: item.version, name, status });
      else await createInventoryItem(props.api, { name, sku, kind, unit });
      props.onSaved();
    } catch (error) {
      setError(errorMessage(error));
      setStale(!!item && axios.isAxiosError(error) && error.response?.status === 409);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function reload() {
    if (!item || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const updated = await readInventoryItem(props.api, item.id, props.locationId);
      setItem(updated);
      setName(updated.name);
      setStatus(updated.status);
      setStale(false);
      setError('');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return {
    item,
    name,
    setName,
    sku,
    setSku,
    kind,
    setKind,
    unit,
    setUnit,
    status,
    setStatus,
    busy,
    stale,
    error,
    save,
    reload,
  };
}
