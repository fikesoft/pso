import { tenantLocale, defaultTimezone } from '../../../shared/config';
import { roMessages, Button, Badge, Empty, Loading, PageTitle, RefreshCw } from '@pos/ui';
import type { WorkspaceComponentProps } from '../model/workspace.types';
export function AuditSection({ model }: WorkspaceComponentProps) {
  const { loading, audit, loadView } = model;
  return (
    <>
      <PageTitle title={roMessages.message250} description={roMessages.message251}>
        <Button variant="secondary" onClick={() => void loadView()}>
          <RefreshCw size={15} />
          {roMessages.message174}
        </Button>
      </PageTitle>
      <section className="panel">
        {loading ? (
          <Loading />
        ) : !audit.length ? (
          <Empty title={roMessages.message252} description={roMessages.message253} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{roMessages.message254}</th>
                <th>{roMessages.message149}</th>
                <th>{roMessages.message255}</th>
                <th>{roMessages.message256}</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td data-label={roMessages.message254}>
                    {new Date(a.createdAt).toLocaleString(tenantLocale, {
                      timeZone: defaultTimezone,
                    })}
                  </td>
                  <td>
                    <strong className="audit-action">{a.action}</strong>
                    <small>
                      {roMessages.message257} {a.targetId || '—'}
                    </small>
                  </td>
                  <td data-label={roMessages.message255}>
                    {a.actorLabel || roMessages.message258}
                  </td>
                  <td data-label={roMessages.message256}>
                    <Badge tone={a.outcome === 'SUCCESS' ? 'success' : 'warning'}>
                      {a.outcome === 'SUCCESS'
                        ? roMessages.message259
                        : a.outcome === 'DENIED'
                          ? roMessages.message260
                          : a.outcome}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="section-note">{roMessages.message261}</p>
    </>
  );
}
