import { useState } from 'react';
import { Button, Loading, Notice } from '@pos/ui';
import { menuScheduleMessages as text, operationalMessages as common } from '@pos/ui/locales';
import { MAX_SCHEDULE_PRODUCTS } from '@pos/contracts/menu-schedules';
import { useCatalog } from '../../../entities/catalog';
import type { ScheduleProductsProps } from '../model/menu-schedules.types';

export function ScheduleProducts({ api, locationId, schedule }: ScheduleProductsProps) {
  const catalog = useCatalog(api, locationId);
  const [selected, setSelected] = useState(
    new Map((schedule?.products ?? []).map((product) => [product.id, product])),
  );
  const products = new Map(selected);
  for (const product of catalog.data?.products ?? [])
    if (product.locationVersion !== null) products.set(product.id, product);
  return (
    <fieldset className="operation-fields">
      <legend>
        {text.products} ({selected.size}/{MAX_SCHEDULE_PRODUCTS})
      </legend>
      <p className="muted">{text.productsHint}</p>
      {catalog.error && (
        <Notice>
          {catalog.error}
          <Button type="button" variant="secondary" onClick={() => void catalog.refresh()}>
            {common.refresh}
          </Button>
        </Notice>
      )}
      {catalog.loading && <Loading />}
      <div className="stack">
        {[...products.values()].map((product) => (
          <label key={product.id}>
            <input
              type="checkbox"
              name="productIds"
              value={product.id}
              checked={selected.has(product.id)}
              disabled={!selected.has(product.id) && selected.size >= MAX_SCHEDULE_PRODUCTS}
              onChange={(event) =>
                setSelected((current) => {
                  const next = new Map(current);
                  if (event.target.checked) next.set(product.id, product);
                  else next.delete(product.id);
                  return next;
                })
              }
            />{' '}
            {product.name}
          </label>
        ))}
      </div>
      {catalog.data?.nextCursor && (
        <Button
          type="button"
          variant="secondary"
          busy={catalog.moreLoading}
          onClick={() => void catalog.more()}
        >
          {common.more}
        </Button>
      )}
    </fieldset>
  );
}
