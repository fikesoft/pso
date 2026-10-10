import {
  roMessages,
  formatMessage,
  Button,
  Notice,
  Badge,
  Empty,
  Loading,
  PageTitle,
  Plus,
} from '@pos/ui';
import type { WorkspaceComponentProps } from '../model/workspace.types';
import { active, statusLabel } from '../lib/presentation';
export function DelegationsSection({ model }: WorkspaceComponentProps) {
  const { loading, users, grants, setModal, setModalError, labelPermission, locationName } = model;
  return (
    <>
      <PageTitle title={roMessages.message236} description={roMessages.message237}>
        <Button onClick={() => setModal({ kind: 'delegation' })}>
          <Plus size={16} />
          {roMessages.message238}
        </Button>
      </PageTitle>
      <Notice tone="info">{roMessages.message239}</Notice>
      <section className="panel">
        {loading ? (
          <Loading />
        ) : !grants.length ? (
          <Empty title={roMessages.message240} description={roMessages.message241} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{roMessages.message242}</th>
                <th>{roMessages.message243}</th>
                <th>{roMessages.message097}</th>
                <th>{roMessages.message106}</th>
                <th aria-label={roMessages.message207} />
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.id}>
                  <td>
                    <strong>
                      {users.find((u) => u.id === g.userId)?.displayName || roMessages.message244}
                    </strong>
                    <small>
                      {roMessages.message245}{' '}
                      {users.find((u) => u.id === (g.issuedByUserId || g.issuerUserId))
                        ?.displayName || roMessages.message246}
                    </small>
                  </td>
                  <td data-label={roMessages.message243}>{locationName(g.locationId)}</td>
                  <td>
                    <div className="permission-tags">
                      {g.permissions.map((p) => (
                        <Badge key={p.permission}>
                          {labelPermission(p.permission)}
                          {p.limits?.maxAmount
                            ? formatMessage(roMessages.message247, p.limits.maxAmount)
                            : ''}
                          {p.limits?.maxPercent
                            ? formatMessage(roMessages.message248, p.limits.maxPercent)
                            : ''}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td data-label={roMessages.message106}>
                    <Badge tone={active(g.status) ? 'success' : 'neutral'}>
                      {statusLabel(g.status)}
                    </Badge>
                  </td>
                  <td className="actions-cell">
                    {active(g.status) && (
                      <Button
                        variant="danger"
                        onClick={() => {
                          setModalError('');
                          setModal({ kind: 'revoke', value: g });
                        }}
                      >
                        {roMessages.message249}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
