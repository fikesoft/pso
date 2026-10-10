import { DraftRepeat } from './draft-repeat';
import { useOperatorCartHeight } from '../model/use-operator-cart-height';
import { useOperatorCatalogHeight } from '../model/use-operator-catalog-height';
import { useState } from 'react';
import { Button, Empty } from '@pos/ui';
import { operatorMessages as text, operationalMessages } from '@pos/ui/locales';
import type { OperatorComposerProps } from '../model/operator.types';
import { useOrderDraft } from '../model/use-order-draft';
import { DraftNotices } from './draft-notices';
import { DraftSource } from './draft-source';
import { DraftActions } from './draft-actions';
import { DraftFields } from './draft-fields';
import { OperatorProducts } from './operator-products';
import { operatorModes } from '../config/operator-mode.constants';
export function OperatorComposer(props: OperatorComposerProps) {
  const presentation = operatorModes[props.mode ?? 'operator'];
  const model = useOrderDraft(props);
  const cart = useOperatorCartHeight();
  const catalog = useOperatorCatalogHeight();
  const [panel, setPanel] = useState('products');
  return (
    <form
      id={presentation.composerId}
      tabIndex={-1}
      className="operator-composer form-stack"
      onSubmit={(event) => void model.save(event)}
    >
      <DraftNotices model={model} props={props} />
      <div className="operator-panel-switch" role="group" aria-label={presentation.title}>
        <Button
          type="button"
          variant="secondary"
          aria-pressed={panel === 'products'}
          onClick={() => setPanel('products')}
        >
          {text.products}
        </Button>
        <Button
          type="button"
          variant="secondary"
          aria-pressed={panel === 'draft'}
          onClick={() => setPanel('draft')}
        >
          {text.current} ({model.draft.items.length})
        </Button>
      </div>
      <div className="operator-columns" data-panel={panel}>
        <section
          ref={catalog}
          className="operator-catalog form-stack"
          aria-label={presentation.catalog}
        >
          <h2>{presentation.catalog}</h2>
          <OperatorProducts {...props} model={model} />
        </section>
        <section ref={cart} className="operator-draft form-stack" aria-label={text.current}>
          <h2>{text.current}</h2>
          <p className="section-note">{text.draftHint}</p>
          <div className="operator-draft-body form-stack">
            <DraftSource model={model} props={props} />
            <DraftFields model={model} />
            <DraftRepeat model={model} props={props} />
            {!model.draft.items.length && (
              <Empty
                title={operationalMessages.emptyDraft}
                description={operationalMessages.emptyDraftHint}
              />
            )}
            <p className="section-note">{operationalMessages.pendingTotal}</p>
          </div>
          <DraftActions model={model} props={props} />
        </section>
      </div>
    </form>
  );
}
