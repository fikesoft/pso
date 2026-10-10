import { useCallback, useState } from 'react';
import { Button, Field, Loading, Modal, Notice } from '@pos/ui';
import { stationMessages as text } from '@pos/ui/locales';
import type { KitchenRoutingProduct } from '@pos/contracts/kitchen-stations';
import { readRoutingProducts, useStationOperation } from '../../../entities/kitchen-station';
import { useRemoteData } from '../../../shared/lib';
import type { StationConfigurationProps } from '../model/station.types';
import { RoutingForm } from './routing-form';
import { StationRecovery } from './station-recovery';
export function RoutingConfiguration(props: StationConfigurationProps) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string>();
  const [edit, setEdit] = useState<KitchenRoutingProduct | null>(null);
  const list = useRemoteData(
    useCallback(
      () => readRoutingProducts(props.api, props.locationId, search, cursor),
      [props.api, props.locationId, search, cursor],
    ),
  );
  const operation = useStationOperation({
    ...props,
    family: 'ROUTING',
    onSaved: async () => {
      setEdit(null);
      await list.refresh();
    },
  });
  const blocked = operation.locked || list.loading || !!edit;
  async function refresh() {
    if (await list.refresh()) {
      setEdit(null);
      operation.refreshed();
    }
  }
  return (
    <section className="form-stack" aria-label={text.routing}>
      <Button
        variant="secondary"
        disabled={operation.busy || operation.recovering || !!edit}
        onClick={props.onBack}
      >
        {text.back}
      </Button>
      <h2>{text.routing}</h2>
      <p>{text.routingHint}</p>
      {!edit && (
        <StationRecovery
          operation={operation}
          onRefresh={() => void refresh()}
          refreshLabel={text.refreshProducts}
        />
      )}
      <form
        className="inline"
        onSubmit={(event) => {
          event.preventDefault();
          if (blocked) return;
          setCursor(undefined);
          setSearch(query.trim());
        }}
      >
        <Field
          label={text.searchProducts}
          value={query}
          maxLength={80}
          disabled={blocked}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button type="submit" disabled={blocked}>
          {text.search}
        </Button>
      </form>
      {list.error && <Notice>{list.error}</Notice>}
      {list.loading && <Loading />}
      {!list.error &&
        !list.loading &&
        list.data?.products.map((product) => (
          <article className="operation-ticket" key={product.id}>
            <h3>{product.name}</h3>
            <p>{product.sku}</p>
            <p>
              {text.currentAssignment}:{' '}
              {product.routing.station
                ? `${product.routing.station.code} · ${product.routing.station.name}`
                : text.unassigned}
            </p>
            {product.stationArchived && <Notice>{text.archivedRouting}</Notice>}
            <Button disabled={blocked} onClick={() => setEdit(product)}>
              {text.assign}
            </Button>
          </article>
        ))}
      {!list.error && !list.loading && !list.data?.products.length && <p>{text.noProducts}</p>}
      <div className="inline">
        <Button
          variant="secondary"
          disabled={operation.busy || operation.recovering || !!edit}
          busy={list.loading}
          onClick={() => void refresh()}
        >
          {text.refreshProducts}
        </Button>
        {list.data?.nextCursor && !list.error && (
          <Button disabled={blocked} onClick={() => setCursor(list.data!.nextCursor!)}>
            {text.more}
          </Button>
        )}
      </div>
      <Modal
        open={!!edit}
        title={text.assign}
        onOpenChange={(open) => {
          if (!open && !operation.busy && !operation.recovering) setEdit(null);
        }}
      >
        <StationRecovery
          operation={operation}
          onRefresh={() => void refresh()}
          refreshLabel={text.refreshProducts}
        />
        {edit && (
          <RoutingForm
            key={`${edit.id}:${edit.routing.version}`}
            api={props.api}
            product={edit}
            locationId={props.locationId}
            operation={operation}
            onClose={() => setEdit(null)}
          />
        )}
      </Modal>
    </section>
  );
}
