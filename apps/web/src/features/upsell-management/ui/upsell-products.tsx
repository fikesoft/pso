import { useState } from 'react';
import type { CatalogProduct } from '@pos/contracts';
import { Button, Loading, Notice, Select } from '@pos/ui';
import { upsellMessages as text, operationalMessages as common } from '@pos/ui/locales';
import { useCatalog } from '../../../entities/catalog';
import type { UpsellManagementProps } from '../model/upsell-management.types';

export function UpsellProducts({ api, locationId }: UpsellManagementProps) {
  const catalog = useCatalog(api, locationId);
  const [source, setSource] = useState<CatalogProduct | null>(null);
  const [target, setTarget] = useState<CatalogProduct | null>(null);
  const products = new Map(
    [source, target].filter((value) => value !== null).map((value) => [value.id, value]),
  );
  for (const product of catalog.data?.products ?? [])
    if (product.locationVersion !== null) products.set(product.id, product);
  return (
    <div className="form-stack">
      <p className="muted">{text.localHint}</p>
      {catalog.loading && <Loading />}
      {catalog.error && (
        <Notice>
          {catalog.error}
          <Button type="button" variant="secondary" onClick={() => void catalog.refresh()}>
            {common.refresh}
          </Button>
        </Notice>
      )}
      <Select
        label={text.source}
        name="sourceProductId"
        value={source?.id ?? ''}
        required
        onChange={(event) => {
          setSource(products.get(event.target.value) ?? null);
          if (target?.id === event.target.value) setTarget(null);
        }}
      >
        <option value="">{text.choose}</option>
        {[...products.values()].map((product) => (
          <option key={product.id} value={product.id}>
            {product.name}
          </option>
        ))}
      </Select>
      <Select
        label={text.target}
        name="targetProductId"
        value={target?.id ?? ''}
        required
        onChange={(event) => setTarget(products.get(event.target.value) ?? null)}
      >
        <option value="">{text.choose}</option>
        {[...products.values()]
          .filter((product) => product.id !== source?.id)
          .map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
      </Select>
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
    </div>
  );
}
