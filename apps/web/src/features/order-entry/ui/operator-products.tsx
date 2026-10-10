import { DraftCategories } from './draft-categories';
import { Button, Modal } from '@pos/ui';
import { operatorMessages as text, operationalMessages } from '@pos/ui/locales';
import type { OperatorProductsProps } from '../model/operator.types';
import { OrderProducts } from './order-products';
import { OrderUpsell } from './order-upsell';
import { OrderModifierPicker } from './order-modifier-picker';
export function OperatorProducts(props: OperatorProductsProps) {
  const { model } = props;
  return (
    <>
      <DraftCategories props={props} />
      <OrderProducts
        search={props.search}
        products={props.products}
        disabled={model.locked || !!model.pendingProduct}
        onAdd={model.add}
      />
      {model.pendingProduct && (
        <Modal
          open
          title={model.pendingProduct.name}
          description={operationalMessages.productSnapshot}
          onOpenChange={(open) => {
            if (!open && !model.locked) model.cancelPending();
          }}
        >
          <OrderModifierPicker
            product={model.pendingProduct}
            available={model.pendingAvailable}
            choices={model.choices}
            disabled={model.locked}
            onToggle={model.toggleOption}
            onCancel={model.cancelPending}
            onConfirm={model.confirmPending}
          />
        </Modal>
      )}
      {props.hasMoreProducts && (
        <Button
          type="button"
          variant="secondary"
          busy={props.loadingMoreProducts}
          disabled={props.search?.disabled && !props.search.canRetryMore}
          onClick={() => void props.onMoreProducts()}
        >
          {operationalMessages.more} · {operationalMessages.catalog}
        </Button>
      )}
      <p className="section-note">{text.catalogHint}</p>
      <OrderUpsell
        api={props.api}
        locationId={props.locationId}
        productIds={model.draft.items.map((item) => item.productId)}
        disabled={model.locked || !!model.pendingProduct}
        onAdd={model.add}
      />
    </>
  );
}
