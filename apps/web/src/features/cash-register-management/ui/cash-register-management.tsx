import { useState } from 'react';
import { Badge, Button, Empty, Loading, Modal, Notice, PageTitle, Select } from '@pos/ui';
import { cashRegisterMessages as text } from '@pos/ui/locales';
import { useRegisterList } from '../model/use-register-list';
import { useRegisterCommand } from '../model/use-register-command';
import type {
  CashRegisterManagementProps,
  RegisterEdit,
  RegisterFilter,
} from '../model/register-management.types';
import { RegisterForm } from './register-form';
import { RegisterRecovery } from './register-recovery';
export function CashRegisterManagement(props: CashRegisterManagementProps) {
  const list = useRegisterList(props);
  const [edit, setEdit] = useState<RegisterEdit | null>(null);
  const enabled = props.canRead && props.canManage;
  const command = useRegisterCommand({
    ...props,
    enabled,
    onSettled: async () => {
      setEdit(null);
      await list.refresh();
    },
  });
  async function refresh() {
    if (command.busy || command.recovering) return;
    setEdit(null);
    if (await list.refresh()) command.refreshed();
  }
  const locked = command.locked || list.loading || !!list.error;
  if (!props.canRead) return <Notice>{text.forbidden}</Notice>;
  return (
    <section className="form-stack">
      <PageTitle title={text.title} eyebrow={props.locationName} description={text.description}>
        {enabled && (
          <Button disabled={locked} onClick={() => setEdit({ kind: 'CREATE' })}>
            {text.create}
          </Button>
        )}
      </PageTitle>
      {command.notice && <Notice tone="success">{command.notice}</Notice>}
      {!edit && command.error && <Notice>{command.error}</Notice>}
      {!edit && <RegisterRecovery command={command} enabled={enabled} />}
      {!edit && command.stale && <Notice>{text.stale}</Notice>}
      <div className="inline">
        <Button
          variant="secondary"
          busy={list.loading}
          disabled={command.busy || command.recovering}
          onClick={() => void refresh()}
        >
          {text.refresh}
        </Button>
        {enabled && (
          <Select
            label={text.status}
            value={list.filter}
            disabled={command.busy || command.recovering || list.loading}
            onChange={(event) => list.setFilter(event.target.value as RegisterFilter)}
          >
            <option value="ACTIVE">{text.active}</option>
            <option value="ARCHIVED">{text.archived}</option>
            <option value="ALL">{text.all}</option>
          </Select>
        )}
      </div>
      {list.error && <Notice>{list.error}</Notice>}
      {list.loading && !list.data && <Loading />}
      {!list.loading && !list.error && !list.data?.registers.length && (
        <Empty title={text.empty} description={text.emptyHint} />
      )}
      {!list.error && (
        <div className="operation-order-list">
          {list.data?.registers.map((register) => (
            <article key={register.id} className="operation-order-card">
              <div className="operation-card-heading">
                <h3>{register.name}</h3>
                <Badge tone={register.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {register.status === 'ACTIVE' ? text.activeStatus : text.archivedStatus}
                </Badge>
              </div>
              <p>
                {text.code}: {register.code}
              </p>
              {enabled && register.status === 'ACTIVE' && (
                <div className="inline">
                  <Button
                    variant="secondary"
                    disabled={locked}
                    onClick={() => setEdit({ kind: 'RENAME', register })}
                  >
                    {text.rename}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={locked}
                    onClick={() => setEdit({ kind: 'ARCHIVE', register })}
                  >
                    {text.archive}
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {list.data?.nextCursor && !list.error && (
        <Button
          variant="secondary"
          busy={list.loading}
          disabled={command.busy || command.recovering}
          onClick={() => void list.more()}
        >
          {text.more}
        </Button>
      )}
      <Modal
        open={!!edit}
        title={
          edit?.kind === 'CREATE'
            ? text.create
            : edit?.kind === 'ARCHIVE'
              ? text.archiveTitle
              : text.rename
        }
        onOpenChange={(open) => {
          if (!open && !command.busy && !command.recovering) setEdit(null);
        }}
      >
        {edit && (
          <RegisterForm
            key={
              edit.kind === 'CREATE'
                ? 'new'
                : `${edit.kind}:${edit.register.id}:${edit.register.version}`
            }
            edit={edit}
            locationId={props.locationId}
            command={command}
            enabled={enabled}
            onCancel={() => setEdit(null)}
            onRefresh={refresh}
          />
        )}
      </Modal>
    </section>
  );
}
