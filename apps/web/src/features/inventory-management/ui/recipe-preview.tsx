import { useCallback } from 'react';
import { Badge, Button, Loading, Notice } from '@pos/ui';
import { inventoryMessages as text, operationalMessages } from '@pos/ui/locales';
import { useRemoteData } from '../../../shared/lib';
import { SERVICE_LABELS } from '../../../shared/config/operations.constants';
import { readRecipe } from '../api/inventory.api';
import { PURPOSE_LABELS, INVENTORY_UNIT_SYMBOLS } from '../config/inventory.constants';
import { inventoryTimestamp } from '../lib/presentation';
import type { RecipePreviewProps } from '../model/inventory.types';
export function RecipePreview({ api, productId }: RecipePreviewProps) {
  const load = useCallback(() => readRecipe(api, productId), [api, productId]);
  const result = useRemoteData(load);
  if (result.loading) return <Loading />;
  if (result.error)
    return (
      <>
        <Notice>{result.error}</Notice>
        <Button variant="secondary" onClick={() => void result.refresh()}>
          {operationalMessages.refresh}
        </Button>
      </>
    );
  const recipe = result.data;
  if (!recipe) return <p>{text.noRecipe}</p>;
  return (
    <div className="inventory-card">
      <Badge>
        {text.version} {recipe.version}
      </Badge>
      <p>{recipe.reason}</p>
      <p className="scope-hint">{inventoryTimestamp(recipe.createdAt)}</p>
      {!recipe.components.length && <p>{text.emptyRecipe}</p>}
      {recipe.components.map((line) => (
        <div className="inventory-metadata" key={line.id}>
          <strong>
            {line.itemName}: {line.quantityPerUnit} {INVENTORY_UNIT_SYMBOLS[line.unit]}
          </strong>
          <span>{PURPOSE_LABELS[line.purpose]}</span>
          <span>{line.serviceTypes.map((type) => SERVICE_LABELS[type]).join(', ')}</span>
        </div>
      ))}
    </div>
  );
}
