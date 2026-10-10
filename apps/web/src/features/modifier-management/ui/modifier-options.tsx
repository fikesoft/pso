import { Button, Empty, Loading, Notice, PageTitle } from '@pos/ui';
import { modifierMessages as text, operationalMessages as common } from '@pos/ui/locales';
import { MAX_GROUP_ACTIVE_OPTIONS } from '@pos/contracts/modifiers';
import type { ModifierOptionsProps } from '../model/modifier-management.types';
import { useModifierOptions } from '../model/use-modifier-options';
import { OptionDialog } from './option-dialog';
import { OptionList } from './option-list';

export function ModifierOptions(props: ModifierOptionsProps) {
  const model = useModifierOptions(props);
  const { options } = model;
  return (
    <section className="stack">
      <PageTitle title={props.group.name} eyebrow={text.title} description={text.groupHint}>
        <Button variant="secondary" disabled={model.busy} onClick={props.onBack}>
          {text.backGroups}
        </Button>
        <Button variant="secondary" busy={options.loading} onClick={() => void options.refresh()}>
          {common.refresh}
        </Button>
        <Button
          disabled={
            props.group.status !== 'ACTIVE' ||
            props.group.options.length >= MAX_GROUP_ACTIVE_OPTIONS
          }
          onClick={() => model.edit(null)}
        >
          {text.newOption}
        </Button>
      </PageTitle>
      {model.notice && <Notice tone="success">{model.notice}</Notice>}
      {model.editing === undefined && model.error && <Notice>{model.error}</Notice>}
      {options.error && <Notice>{options.error}</Notice>}
      {options.loading ? (
        <Loading />
      ) : options.error ? null : !options.data?.modifierOptions.length ? (
        <Empty title={text.noOptions} description={text.noOptionsHint} />
      ) : (
        <OptionList model={model} />
      )}
      {options.data?.nextCursor && !options.error && (
        <Button variant="secondary" busy={options.loadingMore} onClick={() => void model.more()}>
          {common.more}
        </Button>
      )}
      <OptionDialog
        option={model.editing}
        busy={model.busy}
        error={model.error}
        onClose={() => model.setEditing(undefined)}
        onSave={(event) => void model.save(event)}
        onReload={model.reloadEditing}
      />
    </section>
  );
}
