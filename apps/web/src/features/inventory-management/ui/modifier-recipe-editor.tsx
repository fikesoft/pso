import { Loading, Modal, Notice, Button } from '@pos/ui';
import { modifierMessages as text, inventoryMessages, operationalMessages } from '@pos/ui/locales';
import type { ModifierRecipeEditorProps } from '../model/modifier-recipe.types';
import { useModifierRecipeEditor } from '../model/use-modifier-recipe-editor';
import { ModifierRecipeFields } from './modifier-recipe-fields';

export function ModifierRecipeEditor(props: ModifierRecipeEditorProps) {
  const editor = useModifierRecipeEditor(props);
  const { action } = editor;
  return (
    <Modal
      open
      title={text.recipeTitle}
      description={`${props.productName} · ${props.optionName}`}
      onOpenChange={(open) => {
        if (!open && !action.locked) props.onClose();
      }}
    >
      <form className="form-stack" onSubmit={editor.save}>
        {action.error && <Notice>{action.error}</Notice>}
        {editor.loadError && <Notice>{editor.loadError}</Notice>}
        {action.uncertain && <Notice tone="info">{operationalMessages.retryUnknown}</Notice>}
        {action.stale && <Notice tone="info">{inventoryMessages.staleRecipe}</Notice>}
        {editor.loading ? (
          <Loading />
        ) : (
          !editor.loadError && (
            <>
              <p>
                {text.recipeStatus}:{' '}
                {editor.recipe.data?.status === 'PUBLISHED' ? text.published : text.unconfigured} ·{' '}
                {inventoryMessages.version} {editor.recipe.data?.recipe?.version ?? 0}
              </p>
              <p className="scope-hint">{text.recipeHint}</p>
              <ModifierRecipeFields editor={editor} />
            </>
          )
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
            {action.uncertain ? operationalMessages.retry : inventoryMessages.saveRecipe}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
