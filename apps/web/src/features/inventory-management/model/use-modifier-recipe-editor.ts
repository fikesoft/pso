import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { CreateModifierRecipeRequest } from '@pos/contracts';
import { inventoryMessages as text, modifierMessages } from '@pos/ui/locales';
import { useRemoteData } from '../../../shared/lib';
import { readInventoryItems } from '../api/inventory.api';
import { publishModifierRecipe, readModifierRecipe } from '../api/modifier-recipe.api';
import { MAX_MODIFIER_RECIPE_COMPONENTS } from '../config/inventory.constants';
import { useRecipeLines } from './use-recipe-lines';
import { useInventoryAction } from './use-inventory-action';
import type { ModifierRecipeEditorProps } from './modifier-recipe.types';

export function useModifierRecipeEditor({
  api,
  productId,
  optionId,
  onClose,
}: ModifierRecipeEditorProps) {
  const items = useRemoteData(useCallback(() => readInventoryItems(api, ''), [api]));
  const recipe = useRemoteData(
    useCallback(() => readModifierRecipe(api, productId, optionId), [api, productId, optionId]),
  );
  const lineEditor = useRecipeLines(items.data?.items ?? [], MAX_MODIFIER_RECIPE_COMPONENTS);
  const { lines, setLines } = lineEditor;
  const [reason, setReason] = useState('');
  const [noStockEffect, setNoStockEffect] = useState(false);
  useEffect(() => {
    if (!recipe.data) return;
    setLines(recipe.data.recipe?.components.map((line) => ({ ...line, clientId: line.id })) ?? []);
    setReason('');
    setNoStockEffect(false);
  }, [recipe.data, setLines]);
  const action = useInventoryAction({
    operation: (input: CreateModifierRecipeRequest) =>
      publishModifierRecipe(api, productId, optionId, input),
    onSaved: onClose,
  });
  const loading = recipe.loading || items.loading;
  const loadError = recipe.error || items.error;
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || loadError) return;
    if (!lines.length && !noStockEffect) return action.setError(modifierMessages.confirmNoStock);
    if (lines.some((line) => !line.serviceTypes.length))
      return action.setError(text.requiredService);
    if (new Set(lines.map((line) => line.inventoryItemId)).size !== lines.length)
      return action.setError(text.duplicateItem);
    if (lines.some((line) => !/[1-9]/.test(line.quantityPerUnit)))
      return action.setError(text.perProductHint);
    void action.submit({
      expectedVersion: recipe.data?.recipe?.version ?? 0,
      requestKey: crypto.randomUUID(),
      reason,
      components: lines.map((line) => ({
        inventoryItemId: line.inventoryItemId,
        purpose: line.purpose,
        quantityPerUnit: line.quantityPerUnit.trim(),
        serviceTypes: [...line.serviceTypes],
      })),
    });
  }
  async function reload() {
    if (action.locked) return;
    const [nextRecipe, nextItems] = await Promise.all([recipe.refresh(), items.refresh()]);
    if (nextRecipe && nextItems) action.resetError();
  }
  async function moreItems() {
    const cursor = items.data?.nextCursor;
    if (cursor)
      await items.append(
        () => readInventoryItems(api, '', cursor),
        (current, page) => ({ ...page, items: [...current.items, ...page.items] }),
      );
  }
  return {
    ...lineEditor,
    addLine() {
      setNoStockEffect(false);
      lineEditor.addLine();
    },
    items,
    recipe,
    reason,
    setReason,
    noStockEffect,
    setNoStockEffect,
    action,
    loading,
    loadError,
    save,
    reload,
    moreItems,
  };
}
