import { employeeMessages as text } from '@pos/ui/locales';
import { attendanceDuration, attendanceMoment } from '../../../entities/attendance';
import type { ProfileDetailsProps } from '../model/employee-profile.types';

export function ProfileMetrics({ profile }: ProfileDetailsProps) {
  const { performance, attendance, sessions, scope } = profile;
  function money(value: string | null) {
    return value === null ? text.noPermission : `${value} ${performance.currency ?? ''}`.trim();
  }
  return (
    <div className="form-stack">
      <h3>{text.performance}</h3>
      <dl className="attendance-metrics">
        <div>
          <dt>{text.daysWorked}</dt>
          <dd>{attendance?.daysWorked ?? text.noPermission}</dd>
        </div>
        <div>
          <dt>{text.worked}</dt>
          <dd>{attendance ? attendanceDuration(attendance.workedSeconds) : text.noPermission}</dd>
        </div>
        <div>
          <dt>{text.breaks}</dt>
          <dd>{attendance ? attendanceDuration(attendance.breakSeconds) : text.noPermission}</dd>
        </div>
        <div>
          <dt>{text.ordersCreated}</dt>
          <dd>{performance.ordersCreated ?? text.noPermission}</dd>
        </div>
        <div>
          <dt>{text.ordersCancelled}</dt>
          <dd>{performance.ordersCancelled ?? text.noPermission}</dd>
        </div>
        <div>
          <dt>{text.paymentsHandled}</dt>
          <dd>{performance.paymentsHandled ?? text.noPermission}</dd>
        </div>
        <div>
          <dt>{text.revenueHandled}</dt>
          <dd>{money(performance.revenueHandled)}</dd>
        </div>
        <div>
          <dt>{text.averageOrder}</dt>
          <dd>{money(performance.averageOrder)}</dd>
        </div>
        <div>
          <dt>{text.activeSessions}</dt>
          <dd>{sessions?.count ?? text.noPermission}</dd>
        </div>
        <div>
          <dt>{text.lastLogin}</dt>
          <dd>
            {sessions ? attendanceMoment(sessions.lastLoginAt, scope.timezone) : text.noPermission}
          </dd>
        </div>
      </dl>
      <p className="muted text-small">{text.financialHint}</p>
      <p className="muted text-small">{text.unsupported}</p>
    </div>
  );
}
