import { useCallback, useState } from 'react';
import { Button, Field, Select, Loading, Notice } from '@pos/ui';
import { kitchenAlertMessages as text } from '@pos/ui/locales';
import { readAlertOptions } from '../../../entities/kitchen-alert';
import { useRemoteData } from '../../../shared/lib';
import type { AlertTargetPickerProps } from '../model/alert.types';

export function AlertTargetPicker({
  api,
  scope,
  kind,
  disabled,
  selectedId,
  onSelect,
}: AlertTargetPickerProps) {
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string>();
  const list = useRemoteData(
    useCallback(
      () => readAlertOptions(api, { scope, kind, search, cursor, limit: 50 }),
      [api, scope, kind, search, cursor],
    ),
  );
  const blocked = disabled || list.loading || !!list.error;
  return (
    <div className="form-stack">
      <Field
        label={text.search}
        value={search}
        disabled={disabled}
        onChange={(event) => {
          setSearch(event.target.value);
          setCursor(undefined);
          onSelect(null);
        }}
      />
      {list.loading && <Loading />}
      {list.error && (
        <>
          <Notice>{list.error}</Notice>
          <Button disabled={disabled} onClick={() => void list.refresh()}>
            {text.refresh}
          </Button>
        </>
      )}
      {!list.error && !list.loading && (
        <>
          <Select
            label={text.chooseTarget}
            value={selectedId}
            disabled={blocked}
            onChange={(event) => {
              const id = event.target.value;
              onSelect(
                !id
                  ? null
                  : kind === 'PRODUCT'
                    ? { kind, productId: id }
                    : kind === 'CATEGORY'
                      ? { kind, categoryId: id }
                      : { kind, stationId: id },
              );
            }}
          >
            <option value="">{text.chooseTarget}</option>
            {list.data?.options.map((row) => (
              <option key={row.id} value={row.id}>
                {row.code ? `${row.code} · ` : ''}
                {row.name}
              </option>
            ))}
          </Select>
          {list.data?.options.length === 0 && <Notice>{text.noTargets}</Notice>}
          <div className="inline">
            {cursor && (
              <Button
                disabled={blocked}
                onClick={() => {
                  setCursor(undefined);
                  onSelect(null);
                }}
              >
                {text.first}
              </Button>
            )}
            {list.data?.nextCursor && (
              <Button
                disabled={blocked}
                onClick={() => {
                  setCursor(list.data!.nextCursor!);
                  onSelect(null);
                }}
              >
                {text.next}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
