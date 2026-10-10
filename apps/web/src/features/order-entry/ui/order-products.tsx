import { useState } from 'react';
import { CATALOG_SEARCH_MAX_LENGTH } from '../../../entities/catalog';
import { Button, Field, Loading, Notice } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import type { OrderProductsProps } from '../model/order-entry.types';
import { ResourceImage } from '../../../entities/file-asset';
export function OrderProducts({
  products,
  disabled,
  onAdd,
  emptyMessage,
  search,
}: OrderProductsProps) {
  const [query, setQuery] = useState('');
  const visible = products.filter(
    (product) =>
      product.price !== null &&
      product.status === 'ACTIVE' &&
      (search || `${product.name} ${product.sku}`.toLowerCase().includes(query.toLowerCase())),
  );
  return (
    <section className="order-product-picker">
      <h3>{text.chooseProducts}</h3>
      <Field
        label={text.searchProducts}
        value={search?.query ?? query}
        maxLength={CATALOG_SEARCH_MAX_LENGTH}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault();
        }}
        onChange={(event) => (search?.setQuery ?? setQuery)(event.target.value)}
      />
      {search?.pending && !search.error && <Loading />}
      {search?.error && (
        <Notice>
          {search.error}
          <Button type="button" variant="secondary" onClick={() => void search.retry()}>
            {text.refresh} · {text.catalog}
          </Button>
        </Notice>
      )}
      <div className="order-product-options">
        {visible.map((product) => (
          <Button
            type="button"
            variant="secondary"
            key={product.id}
            disabled={
              disabled ||
              search?.disabled ||
              !product.enabled ||
              product.scheduleAvailability?.available === false
            }
            onClick={() => onAdd(product)}
          >
            {product.imageUrl && (
              <ResourceImage src={product.imageUrl} alt="" fallback="" className="avatar-photo" />
            )}
            <span>{product.name}</span>
            <small>{product.price} MDL</small>
            {!product.enabled && <small>{text.unavailable}</small>}
            {product.scheduleAvailability?.available === false && (
              <small>{text.outsideMenuSchedule}</small>
            )}
          </Button>
        ))}
      </div>
      {!search?.pending && !search?.error && !visible.length && (
        <p>{emptyMessage ?? text.noAvailableProducts}</p>
      )}
    </section>
  );
}
