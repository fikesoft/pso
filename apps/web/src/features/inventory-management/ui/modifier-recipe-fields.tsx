import { Button, Field, Notice } from '@pos/ui';
import { inventoryMessages as text, modifierMessages } from '@pos/ui/locales';
import { MAX_MODIFIER_RECIPE_COMPONENTS } from '../config/inventory.constants';
import type { ModifierRecipeFieldsProps } from '../model/modifier-recipe.types';
import { RecipeLine } from './recipe-line';

export function ModifierRecipeFields({ editor }: ModifierRecipeFieldsProps) {
  return (
    <fieldset
      className="operation-fields"
      disabled={editor.action.locked || editor.action.stale || !!editor.loadError}
    >
      {editor.lines.map((line, index) => (
        <RecipeLine
          key={line.clientId}
          line={line}
          index={index}
          editor={editor}
          items={editor.items.data?.items ?? []}
        />
      ))}
      {!editor.lines.length && (
        <Notice tone="info">
          <label className="check-option">
            <input
              type="checkbox"
              checked={editor.noStockEffect}
              onChange={(event) => editor.setNoStockEffect(event.target.checked)}
            />
            {modifierMessages.confirmNoStock}
          </label>
        </Notice>
      )}
      <Button
        type="button"
        variant="secondary"
        disabled={editor.lines.length >= MAX_MODIFIER_RECIPE_COMPONENTS}
        onClick={editor.addLine}
      >
        {text.addComponent}
      </Button>
      {editor.items.data?.nextCursor && (
        <Button
          type="button"
          variant="secondary"
          busy={editor.items.loadingMore}
          onClick={() => void editor.moreItems()}
        >
          {text.moreItems}
        </Button>
      )}
      <Field
        label={text.recipeReason}
        value={editor.reason}
        onChange={(event) => editor.setReason(event.target.value)}
        required
        minLength={3}
        maxLength={500}
      />
    </fieldset>
  );
}
