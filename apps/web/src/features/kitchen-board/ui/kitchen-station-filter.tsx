import { Button, Notice, Select } from '@pos/ui';
import { stationMessages as text } from '@pos/ui/locales';
import { useKitchenStationOptions } from '../model/use-kitchen-station-options';
import type { KitchenStationFilterProps } from '../model/kitchen-board.types';
export function KitchenStationFilter({
  api,
  locationId,
  value,
  disabled,
  onChange,
}: KitchenStationFilterProps) {
  const list = useKitchenStationOptions(api, locationId);
  const stations = list.error ? [] : (list.data?.stations ?? []);
  return (
    <div className="form-stack">
      <Select
        label={text.filter}
        value={value ?? ''}
        disabled={disabled || list.loading || list.loadingMore || !!list.error}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">{text.all}</option>
        <option value="UNASSIGNED">{text.unassigned}</option>
        {value && value !== 'UNASSIGNED' && !stations.some((station) => station.id === value) && (
          <option value={value}>{text.filter}</option>
        )}
        {stations.map((station) => (
          <option key={station.id} value={station.id}>
            {station.code} · {station.name}
            {station.status === 'ARCHIVED' ? ` (${text.archivedOption})` : ''}
          </option>
        ))}
      </Select>
      {list.error && <Notice>{list.error}</Notice>}
      {list.error && (
        <Button disabled={disabled} busy={list.loading} onClick={() => void list.refresh()}>
          {text.refresh}
        </Button>
      )}
      {!list.error && list.data?.nextCursor && (
        <Button
          variant="secondary"
          disabled={disabled}
          busy={list.loadingMore}
          onClick={() => void list.more()}
        >
          {text.more}
        </Button>
      )}
    </div>
  );
}
