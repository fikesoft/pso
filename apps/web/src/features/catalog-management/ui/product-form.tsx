import { Button } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import type { ProductFormProps } from '../model/catalog-management.types';
import { ProductFields } from './product-fields';
export function ProductForm({ model, canManageCatalog, mode }: ProductFormProps) {
  return (
    <form className="form-stack" onSubmit={(event) => void model.save(event, mode)}>
      <fieldset className="operation-fields" disabled={model.busy || model.catalog.loading}>
        <ProductFields
          product={model.product}
          categories={model.catalog.data?.categories ?? []}
          metadata={canManageCatalog && mode !== 'local'}
          local={mode !== 'metadata'}
        />
      </fieldset>
      <div className="form-footer">
        <Button busy={model.busy} disabled={model.catalog.loading} type="submit">
          {mode === 'metadata'
            ? text.saveMetadata
            : mode === 'local'
              ? text.saveLocal
              : text.saveProduct}
        </Button>
      </div>
    </form>
  );
}
