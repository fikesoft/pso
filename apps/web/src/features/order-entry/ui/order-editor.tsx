import { DraftRepeat } from './draft-repeat';
import { DraftCategories } from './draft-categories';
import { DraftNotices } from './draft-notices';
import { DraftSource } from './draft-source';
import { DraftActions } from './draft-actions';
import { Button, Empty, Modal } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import { useOrderDraft } from '../model/use-order-draft';
import type { OrderEditorProps } from '../model/order-entry.types';
import { DraftFields } from './draft-fields';
import { OrderProducts } from './order-products';
import { OrderModifierPicker } from './order-modifier-picker';
import { OrderUpsell } from './order-upsell';
export function OrderEditor(props: OrderEditorProps) {
  const model = useOrderDraft(props);
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (
          !open &&
          !model.busy &&
          !model.uncertain &&
          !model.creation.recovering &&
          !model.customerLookup.locked &&
          !model.addresses.locked
        )
          props.onClose();
      }}
      title={props.order ? `${text.editOrder} #${props.order.number}` : text.orderEditor}
      description={text.productSnapshot}
    >
      <form className="form-stack" onSubmit={(event) => void model.save(event)}>
        <DraftNotices model={model} props={props} />
        <DraftFields model={model} />
        <DraftRepeat model={model} props={props} />
        <DraftSource model={model} props={props} />
        <OrderUpsell
          api={props.api}
          locationId={props.locationId}
          productIds={model.draft.items.map((item) => item.productId)}
          disabled={model.locked || !!model.pendingProduct}
          onAdd={model.add}
        />
        <DraftCategories props={props} />
        <OrderProducts
          search={props.search}
          products={props.products}
          disabled={model.locked || !!model.pendingProduct}
          onAdd={model.add}
        />
        {model.pendingProduct && (
          <OrderModifierPicker
            product={model.pendingProduct}
            available={model.pendingAvailable}
            choices={model.choices}
            disabled={model.locked}
            onToggle={model.toggleOption}
            onCancel={model.cancelPending}
            onConfirm={model.confirmPending}
          />
        )}
        {props.hasMoreProducts && (
          <Button
            type="button"
            variant="secondary"
            busy={props.loadingMoreProducts}
            disabled={props.search?.disabled && !props.search.canRetryMore}
            onClick={() => void props.onMoreProducts()}
          >
            {text.more} · {text.catalog}
          </Button>
        )}
        {!model.draft.items.length && (
          <Empty title={text.emptyDraft} description={text.emptyDraftHint} />
        )}
        <p className="section-note">{text.pendingTotal}</p>
        <DraftActions model={model} props={props} />
      </form>
    </Modal>
  );
}
