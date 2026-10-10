import { useCallback, useState } from 'react';
import { Button, Field, Loading, Notice } from '@pos/ui';
import { attendanceMessages as text } from '@pos/ui/locales';
import { attendanceDuration, defaultAttendancePeriod } from '../../../entities/attendance';
import { formText, useRemoteData } from '../../../shared/lib';
import { readReport } from '../api/attendance.api';
import type { AttendanceClockProps } from '../model/attendance.types';

export function AttendanceReport({
  api,
  locationId,
  timezone,
}: Pick<AttendanceClockProps, 'api' | 'locationId' | 'timezone'>) {
  const [period, setPeriod] = useState(() => defaultAttendancePeriod(timezone));
  const report = useRemoteData(
    useCallback(() => readReport(api, locationId, period), [api, locationId, period]),
  );
  return (
    <section className="panel" aria-label={text.report}>
      <div className="panel-head">
        <div>
          <h2>{text.report}</h2>
          <p>{text.reportHint}</p>
        </div>
      </div>
      <div className="panel-body">
        <form
          className="attendance-filters"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setPeriod({ from: formText(form, 'from'), to: formText(form, 'to') });
          }}
        >
          <Field label={text.from} type="date" name="from" defaultValue={period.from} required />
          <Field label={text.to} type="date" name="to" defaultValue={period.to} required />
          <Button type="submit" busy={report.loading}>
            {text.apply}
          </Button>
        </form>
        {report.error && (
          <Notice>
            {report.error}
            <Button variant="secondary" onClick={() => void report.refresh()}>
              {text.reload}
            </Button>
          </Notice>
        )}
      </div>
      {report.loading ? (
        <Loading />
      ) : (
        !report.error &&
        report.data && (
          <>
            <p className="panel-body muted">
              {report.data.from} – {report.data.to} · {report.data.timezone}
            </p>
            {!report.data.rows.length ? (
              <p className="panel-body">{text.noReport}</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{text.employee}</th>
                    <th>{text.days}</th>
                    <th>{text.shifts}</th>
                    <th>{text.worked}</th>
                    <th>{text.breakTime}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.rows.map((row) => (
                    <tr key={row.userId}>
                      <td>
                        <strong>{row.displayName}</strong>
                      </td>
                      <td data-label={text.days}>{row.daysWorked}</td>
                      <td data-label={text.shifts}>{row.shiftCount}</td>
                      <td data-label={text.worked}>{attendanceDuration(row.workedSeconds)}</td>
                      <td data-label={text.breakTime}>{attendanceDuration(row.breakSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )
      )}
    </section>
  );
}
