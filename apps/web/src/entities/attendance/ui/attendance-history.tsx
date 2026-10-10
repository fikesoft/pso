import { Badge } from '@pos/ui';
import { attendanceMessages as text } from '@pos/ui/locales';
import { attendanceDuration, attendanceMoment, attendanceStatus } from '../lib/presentation';
import type { AttendanceHistoryProps } from '../model/attendance.types';

export function AttendanceHistory({ shifts, timezone }: AttendanceHistoryProps) {
  if (!shifts.length) return <p className="panel-body muted">{text.noHistory}</p>;
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>{text.started}</th>
          <th>{text.finished}</th>
          <th>{text.worked}</th>
          <th>{text.breakTime}</th>
        </tr>
      </thead>
      <tbody>
        {shifts.map((shift) => (
          <tr key={shift.id}>
            <td data-label={text.started}>
              {attendanceMoment(shift.startedAt, timezone)}
              <div>
                <Badge tone={shift.status === 'ENDED' ? 'neutral' : 'success'}>
                  {attendanceStatus(shift.status)}
                </Badge>
              </div>
            </td>
            <td data-label={text.finished}>{attendanceMoment(shift.endedAt, timezone)}</td>
            <td data-label={text.worked}>{attendanceDuration(shift.workedSeconds)}</td>
            <td data-label={text.breakTime}>
              {attendanceDuration(shift.breakSeconds)}
              {!!shift.breaks.length && (
                <details>
                  <summary>
                    {text.breakTime} ({shift.breaks.length})
                  </summary>
                  <ul>
                    {shift.breaks.map((pause) => (
                      <li key={pause.id}>
                        {attendanceMoment(pause.startedAt, timezone)} →{' '}
                        {attendanceMoment(pause.endedAt, timezone)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
