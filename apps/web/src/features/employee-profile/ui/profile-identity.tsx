import { employeeMessages as text } from '@pos/ui/locales';
import type { ProfileDetailsProps } from '../model/employee-profile.types';

export function ProfileIdentity({ profile }: ProfileDetailsProps) {
  const { user } = profile;
  return (
    <div className="form-stack">
      <dl className="attendance-metrics">
        <div>
          <dt>{text.firstName}</dt>
          <dd>{user.firstName ?? text.noValue}</dd>
        </div>
        <div>
          <dt>{text.lastName}</dt>
          <dd>{user.lastName ?? text.noValue}</dd>
        </div>
        <div>
          <dt>{text.phone}</dt>
          <dd>{user.phone ?? text.noValue}</dd>
        </div>
        <div>
          <dt>{text.email}</dt>
          <dd>{user.email ?? text.noValue}</dd>
        </div>
        <div>
          <dt>{text.employeeCode}</dt>
          <dd>{user.employeeCode ?? text.noValue}</dd>
        </div>
        <div>
          <dt>{text.hireDate}</dt>
          <dd>{user.hireDate?.slice(0, 10) ?? text.noValue}</dd>
        </div>
      </dl>
      <div>
        <h3>{text.roles}</h3>
        {!profile.roles.length ? (
          <p>{text.noRoles}</p>
        ) : (
          <ul>
            {profile.roles.map((role) => (
              <li key={role.assignmentId}>
                {role.roleName} · {text.version} {role.roleVersion} ·{' '}
                {role.locationId
                  ? profile.locations.find((location) => location.id === role.locationId)?.name
                  : text.organizationScope}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
