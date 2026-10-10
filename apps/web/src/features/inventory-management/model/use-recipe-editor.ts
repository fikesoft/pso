import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CreateRecipeRequest, RecipeVersion } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { inventoryMessages as text } from '@pos/ui/locales';
import { createRecipe, readRecipe } from '../api/inventory.api';
import { MAX_RECIPE_COMPONENTS } from '../config/inventory.constants';
import { useInventoryAction } from './use-inventory-action';
import { useRecipeLines } from './use-recipe-lines';
import type { RecipeEditorProps } from './inventory.types';
export function useRecipeEditor({ model, product, onClose }: RecipeEditorProps) {
  const [recipe, setRecipe] = useState<RecipeVersion | null>(null);
  const lineEditor = useRecipeLines(model.items.data?.items ?? [], MAX_RECIPE_COMPONENTS);
  const { lines, setLines } = lineEditor;
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const revision = useRef(0);
  const action = useInventoryAction({
    operation: (input: CreateRecipeRequest) => createRecipe(model.api, product.id, input),
    onSaved: () => {
      model.setNotice(text.recipeSaved);
      onClose();
    },
  });
  const load = useCallback(async () => {
    const current = ++revision.current;
    setLoading(true);
    setLoadError('');
    try {
      const value = await readRecipe(model.api, product.id);
      if (current !== revision.current) return false;
      setRecipe(value);
      setLines(value?.components.map((line) => ({ ...line, clientId: line.id })) ?? []);
      setReason('');
      return true;
    } catch (error) {
      if (current === revision.current) setLoadError(errorMessage(error));
      return false;
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, [model.api, product.id]);
  useEffect(() => {
    void load();
    return () => {
      revision.current++;
    };
  }, [load]);
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || loadError) return;
    if (lines.some((line) => !line.serviceTypes.length))
      return action.setError(text.requiredService);
    if (new Set(lines.map((line) => line.inventoryItemId)).size !== lines.length)
      return action.setError(text.duplicateItem);
    if (lines.some((line) => !/[1-9]/.test(line.quantityPerUnit)))
      return action.setError(text.perProductHint);
    void action.submit({
      expectedVersion: recipe?.version ?? 0,
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
    if (!action.locked && (await load())) action.resetError();
  }
  return {
    recipe,
    ...lineEditor,
    reason,
    setReason,
    loading,
    loadError,
    action,
    save,
    reload,
  };
}
