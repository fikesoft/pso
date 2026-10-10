import { Button, Empty, Loading, Notice, PageTitle } from '@pos/ui';
import { modifierMessages as text, operationalMessages as common } from '@pos/ui/locales';
import type { ModifierManagementProps } from '../model/modifier-management.types';
import { useModifierGroups } from '../model/use-modifier-groups';
import { GroupDialog } from './group-dialog';
import { GroupList } from './group-list';
import { ModifierOptions } from './modifier-options';

export function ModifierManagement(props: ModifierManagementProps) {
  const model = useModifierGroups(props);
  if (model.selected)
    return (
      <ModifierOptions
        key={model.selected.id}
        {...props}
        group={model.selected}
        onBack={() => model.setSelected(null)}
        onChanged={model.refreshSelected}
      />
    );
  const { groups } = model;
  return (
    <section className="stack">
      <PageTitle title={text.title} eyebrow={props.locationName} description={text.description}>
        <Button variant="secondary" busy={groups.loading} onClick={() => void groups.refresh()}>
          {common.refresh}
        </Button>
        <Button onClick={() => model.edit(null)}>{text.newGroup}</Button>
      </PageTitle>
      {model.notice && <Notice tone="success">{model.notice}</Notice>}
      {groups.error && <Notice>{groups.error}</Notice>}
      {groups.loading ? (
        <Loading />
      ) : groups.error ? null : !groups.data?.modifierGroups.length ? (
        <Empty title={text.noGroups} description={text.noGroupsHint} />
      ) : (
        <GroupList model={model} />
      )}
      {groups.data?.nextCursor && !groups.error && (
        <Button variant="secondary" busy={groups.loadingMore} onClick={() => void model.more()}>
          {common.more}
        </Button>
      )}
      <GroupDialog
        group={model.editing}
        busy={model.busy}
        error={model.error}
        onClose={() => model.setEditing(undefined)}
        onSave={(event) => void model.save(event)}
        onReload={model.reloadEditing}
      />
    </section>
  );
}
