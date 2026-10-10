import {
  roMessages,
  pinMessages,
  formatMessage,
  Button,
  Badge,
  Empty,
  Loading,
  PageTitle,
  Plus,
  ArrowUpRight,
} from '@pos/ui';
import type { WorkspaceComponentProps } from '../model/workspace.types';
import { initials, active, statusLabel } from '../lib/presentation';
import { WorkspaceToolbar } from './workspace-toolbar';
import { ResourceImage } from '../../../entities/file-asset';
export function StaffSection({ model }: WorkspaceComponentProps) {
  const { loading, query, setQuery, users, setModal, can, shownUsers, locationName } = model;
  return (
    <>
      <PageTitle title={roMessages.message210} description={roMessages.message211}>
        {can('staff.create') && (
          <Button onClick={() => setModal({ kind: 'staff' })}>
            <Plus size={16} />
            {roMessages.message212}
          </Button>
        )}
      </PageTitle>
      <section className="panel">
        <WorkspaceToolbar
          count={shownUsers.length}
          label={roMessages.message213}
          query={query}
          setQuery={setQuery}
        />
        {loading ? (
          <Loading />
        ) : !shownUsers.length ? (
          <Empty
            title={roMessages.message214}
            description={query ? roMessages.message215 : roMessages.message216}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{roMessages.message217}</th>
                <th>{roMessages.message218}</th>
                <th>{roMessages.message200}</th>
                <th>{roMessages.message106}</th>
                <th aria-label={roMessages.message207} />
              </tr>
            </thead>
            <tbody>
              {shownUsers.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="table-person">
                      <ResourceImage
                        src={u.avatarUrl}
                        alt={u.displayName}
                        fallback={initials(u.displayName)}
                        className="avatar-photo"
                      />
                      <div>
                        <strong>{u.displayName}</strong>
                        <small>{u.login}</small>
                      </div>
                    </div>
                  </td>
                  <td data-label={roMessages.message218}>
                    {u.isPrimaryAdmin ? (
                      <Badge tone="accent">{roMessages.message194}</Badge>
                    ) : (
                      <span>
                        {u.managedByUserId
                          ? formatMessage(
                              roMessages.message219,
                              users.find((p) => p.id === u.managedByUserId)?.displayName ||
                                roMessages.message436,
                            )
                          : roMessages.message220}
                      </span>
                    )}
                  </td>
                  <td data-label={roMessages.message200}>
                    {u.isPrimaryAdmin
                      ? roMessages.message221
                      : (u.locationIds || u.locations?.map((l) => l.locationId || l.id) || [])
                          .map((id) => locationName(id))
                          .join(', ') || roMessages.message222}
                  </td>
                  <td data-label={roMessages.message106}>
                    <Badge
                      tone={
                        active(u.status)
                          ? 'success'
                          : u.status === 'PENDING'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {statusLabel(u.status)}
                    </Badge>
                    <Badge>
                      {u.authenticationMethod === 'PIN'
                        ? pinMessages.pinBadge
                        : pinMessages.passwordBadge}
                    </Badge>
                  </td>
                  <td className="actions-cell">
                    <Button variant="ghost" onClick={() => setModal({ kind: 'person', value: u })}>
                      {roMessages.message223}
                      <ArrowUpRight size={14} />
                    </Button>
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
