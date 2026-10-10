import { useCallback, useState } from 'react';
import { Button, Notice, Select } from '@pos/ui';
import { stationMessages as text } from '@pos/ui/locales';
import { readKitchenStations } from '../../../entities/kitchen-station';
import { useRemoteData } from '../../../shared/lib';
import type { RoutingFormProps } from '../model/station.types';
export function RoutingForm({ api, product, locationId, operation, onClose }: RoutingFormProps) {
  const [stationId, setStationId] = useState(product.routing.station?.id ?? '');
  const list = useRemoteData(
    useCallback(
      () => readKitchenStations(api, { locationId, status: 'ACTIVE', limit: 50 }),
      [api, locationId],
    ),
  );
  const blocked = operation.locked || list.loading || !!list.error;
  const stations = list.error ? [] : (list.data?.stations ?? []);
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (blocked) return;
        void operation.send({
          family: 'ROUTING',
          body: {
            locationId,
            productId: product.id,
            version: product.routing.version,
            stationId: stationId || null,
            requestKey: crypto.randomUUID(),
          },
        });
      }}
    >
      <p>
        <strong>{product.name}</strong> · {product.sku}
      </p>
      <p>{text.routingHint}</p>
      {product.stationArchived && <Notice>{text.archivedRouting}</Notice>}
      {list.error && <Notice>{list.error}</Notice>}
      <Select
        label={text.assign}
        value={stationId}
        disabled={blocked || list.loadingMore}
        onChange={(event) => setStationId(event.target.value)}
      >
        <option value="">{text.unassigned}</option>
        {product.routing.station &&
          !stations.some((station) => station.id === product.routing.station!.id) && (
            <option value={product.routing.station.id} disabled={product.stationArchived}>
              {product.routing.station.code} · {product.routing.station.name}
            </option>
          )}
        {stations.map((station) => (
          <option key={station.id} value={station.id}>
            {station.code} · {station.name}
          </option>
        ))}
      </Select>
      {list.error && (
        <Button type="button" disabled={operation.locked} onClick={() => void list.refresh()}>
          {text.refresh}
        </Button>
      )}
      {list.data?.nextCursor && !list.error && (
        <Button
          type="button"
          variant="secondary"
          disabled={blocked}
          busy={list.loadingMore}
          onClick={() =>
            void list.append(
              () =>
                readKitchenStations(api, {
                  locationId,
                  status: 'ACTIVE',
                  limit: 50,
                  cursor: list.data!.nextCursor!,
                }),
              (current, page) => ({
                ...page,
                stations: [
                  ...current.stations,
                  ...page.stations.filter(
                    (station) => !current.stations.some((entry) => entry.id === station.id),
                  ),
                ],
              }),
            )
          }
        >
          {text.more}
        </Button>
      )}
      <div className="inline">
        <Button
          type="submit"
          busy={operation.busy}
          disabled={
            blocked || (product.stationArchived && stationId === product.routing.station?.id)
          }
        >
          {text.saveRouting}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={operation.busy || operation.recovering}
          onClick={onClose}
        >
          {text.cancel}
        </Button>
      </div>
    </form>
  );
}
