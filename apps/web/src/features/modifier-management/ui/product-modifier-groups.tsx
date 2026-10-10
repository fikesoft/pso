import { MAX_PRODUCT_MODIFIER_GROUPS } from '@pos/contracts/modifiers';
import { useEffect } from 'react';
import { Button, Field, Loading, Notice, Select } from '@pos/ui';
import { modifierMessages as text, operationalMessages as common } from '@pos/ui/locales';
import type { ProductModifiersProps } from '../model/product-modifiers.types';
import { useProductModifiers } from '../model/use-product-modifiers';
import { ProductModifierBinding } from './product-modifier-binding';

export function ProductModifierGroups(props: ProductModifiersProps) {
  const model = useProductModifiers(props);
  const { onLockedChange } = props;
  useEffect(() => {
    onLockedChange(model.busy);
  }, [model.busy, onLockedChange]);
  useEffect(() => () => onLockedChange(false), [onLockedChange]);
  const { bindings, groups } = model;
  const error = model.error || bindings.error || groups.error;
  const active = props.product.modifierGroups.length;
  return (
    <section className="form-stack" aria-label={text.productGroups}>
      <h3>{text.productGroups}</h3>
      {error && (
        <Notice>
          {error}
          <Button
            type="button"
            variant="secondary"
            busy={bindings.loading || groups.loading}
            onClick={() => void model.reload()}
          >
            {common.refresh}
          </Button>
        </Notice>
      )}
      {model.notice && <Notice tone="success">{model.notice}</Notice>}
      {bindings.loading ? (
        <Loading />
      ) : (
        !bindings.error && (
          <>
            {!bindings.data?.modifierGroups.length && (
              <p className="muted">{text.noAssociations}</p>
            )}
            {bindings.data?.modifierGroups.map((binding) => (
              <ProductModifierBinding
                key={`${binding.id}:${binding.version}`}
                binding={binding}
                model={model}
                editable={props.editable}
                onEditRecipe={props.onEditRecipe}
              />
            ))}
          </>
        )
      )}
      {bindings.data?.nextCursor && !bindings.error && (
        <Button
          type="button"
          variant="secondary"
          busy={bindings.loadingMore}
          onClick={() => void model.moreBindings()}
        >
          {common.more}
        </Button>
      )}
      {props.editable && (
        <form className="form-stack" onSubmit={(event) => void model.save(event, null)}>
          <fieldset
            className="operation-fields"
            disabled={
              model.busy ||
              bindings.loading ||
              groups.loading ||
              !!error ||
              active >= MAX_PRODUCT_MODIFIER_GROUPS
            }
          >
            <Select label={text.chooseGroup} name="modifierGroupId" defaultValue="" required>
              <option value="">{text.chooseGroup}</option>
              {groups.data?.modifierGroups
                .filter(
                  (group) =>
                    group.status === 'ACTIVE' &&
                    !bindings.data?.modifierGroups.some(
                      (binding) => binding.modifierGroupId === group.id,
                    ),
                )
                .map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
            </Select>
            <Field
              label={text.groupOrder}
              name="sortOrder"
              type="number"
              min={0}
              max={100000}
              step={1}
              defaultValue={0}
              required
            />
            <Button type="submit" busy={model.busy}>
              {text.attachGroup}
            </Button>
          </fieldset>
          {groups.data?.nextCursor && (
            <Button
              type="button"
              variant="secondary"
              busy={groups.loadingMore}
              onClick={() => void model.moreGroups()}
            >
              {common.more}
            </Button>
          )}
        </form>
      )}
    </section>
  );
}
