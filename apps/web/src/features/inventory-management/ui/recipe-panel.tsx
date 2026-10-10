import { useCallback, useState } from 'react';
import { Button, Empty, Loading, Notice, Select } from '@pos/ui';
import { inventoryMessages as text } from '@pos/ui/locales';
import { useRemoteData } from '../../../shared/lib';
import { readInventoryProducts } from '../api/inventory.api';
import type { InventoryComponentProps } from '../model/inventory.types';
import { RecipeDialog } from './recipe-dialog';
import { RecipePreview } from './recipe-preview';
import { ModifierRecipeOptions } from './modifier-recipe-options';
export function RecipePanel({ model }: InventoryComponentProps) {
  const load = useCallback(() => readInventoryProducts(model.api), [model.api]);
  const products = useRemoteData(load);
  const [productId, setProductId] = useState('');
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const selected = products.data?.products.find((product) => product.id === productId);
  async function more() {
    const cursor = products.data?.nextCursor;
    if (cursor)
      await products.append(
        () => readInventoryProducts(model.api, cursor),
        (current, page) => ({ ...page, products: [...current.products, ...page.products] }),
      );
  }
  return (
    <section className="stack">
      <Notice tone="info">
        {text.noRecipeHint} {text.consumptionHint}
      </Notice>
      {products.error && (
        <>
          <Notice>{products.error}</Notice>
          <Button
            variant="secondary"
            busy={products.loading}
            onClick={() => void products.refresh()}
          >
            {text.retryProducts}
          </Button>
        </>
      )}
      {products.loading ? (
        <Loading />
      ) : !products.data?.products.length ? (
        <Empty title={text.noProducts} description={text.chooseProductHint} />
      ) : (
        <>
          <Select
            label={text.chooseProduct}
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
          >
            <option value="">{text.chooseProductHint}</option>
            {products.data.products.map((product) => (
              <option value={product.id} key={product.id}>
                {product.name} · {product.sku}
              </option>
            ))}
          </Select>
          {products.data.nextCursor && (
            <Button variant="secondary" busy={products.loadingMore} onClick={() => void more()}>
              {text.moreProducts}
            </Button>
          )}
          {selected && (
            <>
              <Button onClick={() => setOpen(true)}>{text.editRecipe}</Button>
              <RecipePreview
                key={`${selected.id}:${revision}`}
                api={model.api}
                productId={selected.id}
              />
              <ModifierRecipeOptions key={selected.id} api={model.api} product={selected} />
            </>
          )}
        </>
      )}
      {open && selected && (
        <RecipeDialog
          product={selected}
          model={model}
          onClose={() => {
            setOpen(false);
            setRevision((current) => current + 1);
          }}
        />
      )}
    </section>
  );
}
