import { Button, Modal, Notice } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import type { ProductDialogProps } from '../model/catalog-management.types';
import { ProductForm } from './product-form';
export function ProductDialog({
  model,
  canManageCatalog,
  renderImage,
  renderModifiers,
}: ProductDialogProps) {
  return (
    <Modal
      open={model.productOpen}
      onOpenChange={(open) => {
        if (!model.busy) model.setProductOpen(open);
      }}
      title={model.product ? text.editProduct : text.newProduct}
      description={text.productScope}
    >
      {(model.error || model.catalog.error) && (
        <>
          <Notice>{model.catalog.error || model.error}</Notice>
          <Button
            variant="secondary"
            busy={model.catalog.loading}
            disabled={model.busy}
            onClick={() => void model.reloadProduct()}
          >
            {text.refresh}
          </Button>
        </>
      )}
      <div className="form-stack">
        {model.product && (
          <fieldset className="operation-fields" disabled={model.metadataBusy || model.imageLocked}>
            {renderModifiers?.(model.product, model.reloadProduct, model.setModifiersLocked)}
          </fieldset>
        )}
        {model.product && (
          <fieldset
            className="operation-fields"
            disabled={model.metadataBusy || model.modifiersLocked}
          >
            {renderImage?.(model.product, model.reloadProduct, model.setImageLocked)}
          </fieldset>
        )}
        {(!model.product || canManageCatalog) && (
          <ProductForm
            key={`metadata:${model.product?.version}:${model.product?.locationVersion}`}
            model={model}
            canManageCatalog={canManageCatalog}
            mode={model.product ? 'metadata' : 'product'}
          />
        )}
        {model.product && (
          <ProductForm
            key={`local:${model.product.version}:${model.product.locationVersion}`}
            model={model}
            canManageCatalog={canManageCatalog}
            mode="local"
          />
        )}
        <Button
          type="button"
          variant="secondary"
          disabled={model.busy}
          onClick={() => model.setProductOpen(false)}
        >
          {text.cancel}
        </Button>
      </div>
    </Modal>
  );
}
