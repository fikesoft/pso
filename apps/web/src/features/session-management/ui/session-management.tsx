import { Button, Notice } from '@pos/ui';
import { sessionMessages as text } from '@pos/ui/locales';
import type { SessionManagementProps } from '../model/session-management.types';
import { useSessionManagement } from '../model/use-session-management';
import { SessionList } from './session-list';
import { RevokeConfirmation } from './revoke-confirmation';

export function SessionManagement(props: SessionManagementProps) {
  const model = useSessionManagement(props);
  return (
    <section className="stack" aria-label={text.title}>
      <div className="panel-head">
        <div>
          <h3>{text.title}</h3>
          <p>{model.isOwn ? text.ownDescription : text.staffDescription}</p>
        </div>
      </div>
      {model.notice && <Notice tone="success">{model.notice}</Notice>}
      <SessionList model={model} />
      <div className="form-footer">
        <Button
          variant="secondary"
          busy={model.sessions.loading}
          onClick={() => void model.sessions.refresh()}
        >
          {text.refresh}
        </Button>
        {!model.sessions.error && (
          <Button variant="danger" onClick={() => model.setTarget('all')}>
            {text.closeAll}
          </Button>
        )}
      </div>
      <RevokeConfirmation model={model} />
    </section>
  );
}
