import { useCallback, useEffect, useState } from 'react';
import { readOrderRepeat } from '../../../entities/order';
import { useRemoteData } from '../../../shared/lib';
import type { ModifierChoices } from '../../../entities/modifier';
import { prepareRepeatRows, repairRepeatRow, transferableRepeatLines } from '../lib/order-repeat';
import type { RepeatPreviewProps, PreparedRepeat } from './order-repeat.types';
export function useRepeatPreview({ source, props, model }: RepeatPreviewProps) {
  const load = useCallback(
    () => readOrderRepeat(props.api, source.id, props.locationId),
    [props.api, props.locationId, source.id],
  );
  const resource = useRemoteData(load);
  const [prepared, setPrepared] = useState<PreparedRepeat>({ response: null, rows: [] });
  const [modified, setModified] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [choices, setChoices] = useState<ModifierChoices>({});
  useEffect(() => {
    setPrepared({
      response: resource.data,
      rows: resource.data ? prepareRepeatRows(resource.data) : [],
    });
    setModified(false);
    setConfirmed(false);
    setEditing(null);
  }, [resource.data]);
  const ready =
    !resource.loading &&
    !resource.error &&
    prepared.response === resource.data &&
    !!resource.data &&
    resource.data.source.id === source.id &&
    resource.data.locationId === props.locationId;
  const locked = model.locked || !!model.pendingProduct || !!props.order || !props.canReadOrders;
  const lines = transferableRepeatLines(prepared.rows);
  function remove(id: string) {
    if (!locked) {
      setPrepared((value) => ({
        ...value,
        rows: value.rows.map((row) =>
          row.line.sourceItemId === id ? { ...row, removed: true } : row,
        ),
      }));
      setModified(true);
    }
  }
  function repair(id: string) {
    if (!locked) {
      setEditing(id);
      setChoices({});
    }
  }
  function confirmRepair() {
    if (locked || !editing) return;
    setPrepared((value) => ({
      ...value,
      rows: value.rows.map((row) =>
        row.line.sourceItemId === editing ? repairRepeatRow(row, choices) : row,
      ),
    }));
    setEditing(null);
    setModified(true);
  }
  function toggle(bindingId: string, optionId: string) {
    setChoices((value) => ({
      ...value,
      [bindingId]: value[bindingId]?.includes(optionId)
        ? value[bindingId].filter((id) => id !== optionId)
        : [...(value[bindingId] ?? []), optionId],
    }));
  }
  function apply() {
    if (locked || !ready || !lines || (model.draft.items.length > 0 && !confirmed) || editing)
      return;
    model.setDraft((draft) => ({ ...draft, items: lines }));
    props.onCloseRepeat?.();
  }
  function refresh() {
    resource.setData(null);
    void resource.refresh();
  }
  return {
    ...resource,
    refresh,
    rows: prepared.rows,
    ready,
    locked,
    lines,
    modified,
    confirmed,
    setConfirmed,
    editing: prepared.rows.find((row) => row.line.sourceItemId === editing),
    choices,
    toggle,
    confirmRepair,
    cancelRepair: () => setEditing(null),
    remove,
    repair,
    apply,
  };
}
