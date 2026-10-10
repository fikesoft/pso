import { Badge, Button, Empty, Loading, Notice } from '@pos/ui';
import { sessionMessages as text } from '@pos/ui/locales';
import { sessionTime } from '../lib/session-time';
import type { SessionComponentProps } from '../model/session-management.types';

export function SessionList({ model }: SessionComponentProps) {
  const { sessions } = model;
  if (sessions.loading) return <Loading />;
  if (sessions.error) return <Notice>{sessions.error}</Notice>;
  return (
    <>
      {!sessions.data?.sessions.length ? (
        <Empty title={text.empty} description={text.ownDescription} />
      ) : (
        <div className="stack">
          {sessions.data.sessions.map((session) => (
            <article className="details-block" key={session.id}>
              <div className="inline">
                <strong>{session.authenticationMethod === 'PIN' ? text.pin : text.password}</strong>
                {session.current && <Badge tone="success">{text.current}</Badge>}
              </div>
              <p className="scope-hint">
                {text.started}:{' '}
                <time dateTime={session.createdAt}>{sessionTime(session.createdAt)}</time>
                <br />
                {text.seen}:{' '}
                <time dateTime={session.lastSeenAt}>{sessionTime(session.lastSeenAt)}</time>
                <br />
                {text.expires}:{' '}
                <time dateTime={session.expiresAt}>{sessionTime(session.expiresAt)}</time>
              </p>
              <Button variant="danger" onClick={() => model.setTarget(session)}>
                {text.close}
              </Button>
            </article>
          ))}
        </div>
      )}
      {sessions.data?.nextCursor && (
        <Button variant="secondary" busy={sessions.loadingMore} onClick={() => void model.more()}>
          {text.more}
        </Button>
      )}
    </>
  );
}
