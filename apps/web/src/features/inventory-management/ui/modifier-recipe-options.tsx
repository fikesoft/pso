import { useCallback, useState } from 'react';
import { Button, Loading, Notice, Select } from '@pos/ui';
import { modifierMessages as text, operationalMessages as common } from '@pos/ui/locales';
import { useRemoteData } from '../../../shared/lib';
import { readModifierRecipeOptions } from '../api/modifier-recipe.api';
import type { ModifierRecipeOptionsProps } from '../model/modifier-recipe.types';
import { ModifierRecipeEditor } from './modifier-recipe-editor';

export function ModifierRecipeOptions({ api, product }: ModifierRecipeOptionsProps) {
  const options = useRemoteData(
    useCallback(() => readModifierRecipeOptions(api, product.id), [api, product.id]),
  );
  const [optionId, setOptionId] = useState('');
  const [open, setOpen] = useState(false);
  const selected = options.data?.options.find((option) => option.modifierOptionId === optionId);
  return (
    <section className="inventory-card form-stack" aria-label={text.recipeTitle}>
      <h3>{text.recipeTitle}</h3>
      {options.error && (
        <Notice>
          {options.error}
          <Button variant="secondary" busy={options.loading} onClick={() => void options.refresh()}>
            {common.refresh}
          </Button>
        </Notice>
      )}
      {options.loading ? (
        <Loading />
      ) : (
        !options.error && (
          <>
            {!options.data?.options.length ? (
              <p>{text.noOptions}</p>
            ) : (
              <Select
                label={text.optionName}
                value={optionId}
                onChange={(event) => setOptionId(event.target.value)}
              >
                <option value="">{text.optionName}</option>
                {options.data.options.map((option) => (
                  <option key={option.modifierOptionId} value={option.modifierOptionId}>
                    {option.modifierGroupName} · {option.optionName} ·{' '}
                    {option.recipeVersion === null
                      ? text.unconfigured
                      : `${text.published} v${option.recipeVersion}`}
                  </option>
                ))}
              </Select>
            )}
            {selected && <Button onClick={() => setOpen(true)}>{text.recipeTitle}</Button>}
          </>
        )
      )}
      {open && selected && (
        <ModifierRecipeEditor
          api={api}
          productId={product.id}
          productName={product.name}
          optionId={selected.modifierOptionId}
          optionName={selected.optionName}
          onClose={() => {
            setOpen(false);
            void options.refresh();
          }}
        />
      )}
    </section>
  );
}
