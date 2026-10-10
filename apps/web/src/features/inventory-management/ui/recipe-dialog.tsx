import { Button, Field, Loading, Modal, Notice } from '@pos/ui';
import { inventoryMessages as text, operationalMessages } from '@pos/ui/locales';
import { MAX_RECIPE_COMPONENTS } from '../config/inventory.constants';
import type { RecipeEditorProps } from '../model/inventory.types';
import { useRecipeEditor } from '../model/use-recipe-editor';
import { RecipeLine } from './recipe-line';
export function RecipeDialog(props: RecipeEditorProps) {
  const editor = useRecipeEditor(props);
  const { action } = editor;
  return (
    <Modal
      open
      title={text.recipeTitle}
      description={props.product.name}
      onOpenChange={(open) => {
        if (!open && !action.locked) props.onClose();
      }}
    >
      <form className="form-stack" onSubmit={editor.save}>
        {action.error && <Notice>{action.error}</Notice>}
        {action.uncertain && <Notice tone="info">{operationalMessages.retryUnknown}</Notice>}
        {action.stale && <Notice tone="info">{text.staleRecipe}</Notice>}
        {editor.loadError && <Notice>{editor.loadError}</Notice>}
        {editor.loading ? (
          <Loading />
        ) : (
          <>
            <p>
              {text.version}: {editor.recipe?.version ?? 0}
            </p>
            <p className="scope-hint">{text.recipeHint}</p>
            {!editor.lines.length && (
              <Notice tone="info">
                {text.emptyRecipe} {text.noRecipeHint}
              </Notice>
            )}
            <fieldset
              className="operation-fields"
              disabled={action.locked || action.stale || !!editor.loadError}
            >
              {editor.lines.map((line, index) => (
                <RecipeLine
                  key={line.clientId}
                  line={line}
                  index={index}
                  editor={editor}
                  items={props.model.items.data?.items ?? []}
                />
              ))}
              <Button
                type="button"
                variant="secondary"
                disabled={editor.lines.length >= MAX_RECIPE_COMPONENTS}
                onClick={editor.addLine}
              >
                {text.addComponent}
              </Button>
              {props.model.items.data?.nextCursor && (
                <Button
                  type="button"
                  variant="secondary"
                  busy={props.model.items.loadingMore}
                  onClick={() => void props.model.moreItems()}
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
          </>
        )}
        <div className="form-footer">
          <Button
            type="button"
            variant="secondary"
            disabled={action.locked}
            onClick={props.onClose}
          >
            {operationalMessages.cancel}
          </Button>
          {(action.stale || editor.loadError) && (
            <Button
              type="button"
              variant="secondary"
              busy={editor.loading}
              onClick={() => void editor.reload()}
            >
              {operationalMessages.refresh}
            </Button>
          )}
          <Button
            type="submit"
            busy={action.busy}
            disabled={action.stale || editor.loading || !!editor.loadError}
          >
            {action.uncertain ? operationalMessages.retry : text.saveRecipe}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
