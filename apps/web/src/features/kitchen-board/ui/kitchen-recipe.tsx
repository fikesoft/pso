import { useCallback, useState } from 'react';
import { Button, Loading, Modal, Notice } from '@pos/ui';
import { kitchenAlertMessages as text } from '@pos/ui/locales';
import { readKitchenRecipe } from '../../../entities/kitchen';
import { useRemoteData } from '../../../shared/lib';
import type { KitchenRecipeProps } from '../model/kitchen-board.types';
import { KITCHEN_RECIPE_UNITS, KITCHEN_RECIPE_PURPOSES } from '../config/recipe.constants';

function RecipeContent({ api, ticketId, item }: KitchenRecipeProps) {
  const { data, loading, error, refresh } = useRemoteData(
    useCallback(() => readKitchenRecipe(api, ticketId, item.id), [api, ticketId, item.id]),
  );
  if (loading) return <Loading />;
  if (error)
    return (
      <div className="form-stack">
        <Notice>{error}</Notice>
        <Button onClick={() => void refresh()}>{text.reloadRecipe}</Button>
      </div>
    );
  if (!data) return null;
  return (
    <div className="form-stack">
      <p>
        <strong>{data.productName}</strong> · {text.orderedQuantity}: {data.quantity}
      </p>
      {data.status !== 'AVAILABLE' ? (
        <Notice tone="info">
          {data.status === 'LEGACY_UNAVAILABLE' ? text.legacyRecipe : text.noRecipeComponents}
        </Notice>
      ) : (
        data.components.map((component) => (
          <section
            key={component.id}
            className="operation-order-card"
            aria-label={component.itemName}
          >
            <h3>{component.itemName}</h3>
            <p>
              {KITCHEN_RECIPE_PURPOSES[component.purpose]} · {text.recipeVersion}{' '}
              {component.recipeVersion}
            </p>
            {component.modifierName && (
              <p>
                {text.modifierRecipe}: {component.modifierName}
              </p>
            )}
            <p>
              {text.perUnit}:{' '}
              <strong>
                {component.quantityPerUnit} {KITCHEN_RECIPE_UNITS[component.unit]}
              </strong>
            </p>
            <p>
              {text.totalRecipe}:{' '}
              <strong>
                {component.totalQuantity} {KITCHEN_RECIPE_UNITS[component.unit]}
              </strong>
            </p>
          </section>
        ))
      )}
    </div>
  );
}

export function KitchenRecipe(props: KitchenRecipeProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-label={`${text.openRecipe}: ${props.item.productName}`}
      >
        {text.openRecipe}
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`${text.recipe} · ${props.item.productName}`}
        description={text.recipeSnapshot}
      >
        {open && <RecipeContent {...props} />}
      </Modal>
    </>
  );
}
