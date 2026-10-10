import { Badge, Button, Loading, Notice, formatMessage } from '@pos/ui';
import { attendanceMessages as text } from '@pos/ui/locales';
import {
  attendanceDuration,
  attendanceMoment,
  attendanceStatus,
  AttendanceHistory,
} from '../../../entities/attendance';
import type { AttendanceClockProps } from '../model/attendance.types';
import { useAttendanceClock } from '../model/use-attendance-clock';
import { AttendanceControls } from './attendance-controls';

export function AttendanceClock(props: AttendanceClockProps) {
  const model = useAttendanceClock(props);
  const { current, history, saved, action, reload, more } = model;
  const shift = current.data?.shift;
  return (
    <div className="stack">
      <section className="panel" aria-label={text.myShift}>
        <div className="panel-head">
          <h2>{text.myShift}</h2>
          <Button variant="secondary" disabled={action.locked || current.loading} onClick={reload}>
            {text.reload}
          </Button>
        </div>
        <div className="panel-body form-stack">
          {saved && <Notice tone="success">{text.saved}</Notice>}
          {current.error && <Notice>{current.error}</Notice>}
          {current.loading && !current.data ? (
            <Loading />
          ) : (
            !current.error && (
              <>
                {shift ? (
                  <>
                    {shift.locationId !== props.locationId && (
                      <Notice tone="info">
                        {formatMessage(text.elsewhere, props.locationName(shift.locationId))}
                      </Notice>
                    )}
                    <Badge tone={shift.status === 'ON_BREAK' ? 'warning' : 'success'}>
                      {attendanceStatus(shift.status)}
                    </Badge>
                    <p>
                      {text.started}: {attendanceMoment(shift.startedAt, props.timezone)}
                    </p>
                    <dl className="attendance-metrics">
                      <div>
                        <dt>{text.worked}</dt>
                        <dd>{attendanceDuration(shift.workedSeconds)}</dd>
                      </div>
                      <div>
                        <dt>{text.breakTime}</dt>
                        <dd>{attendanceDuration(shift.breakSeconds)}</dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <p>{text.noActive}</p>
                )}
                {current.data && (
                  <small className="muted">
                    {text.updated}: {attendanceMoment(current.data.serverTime, props.timezone)}
                  </small>
                )}
              </>
            )
          )}
          {current.data && <AttendanceControls model={model} />}
        </div>
      </section>
      <section className="panel" aria-label={text.history}>
        <div className="panel-head">
          <h2>{text.history}</h2>
        </div>
        {history.error && <Notice>{history.error}</Notice>}
        {history.loading ? (
          <Loading />
        ) : (
          !history.error && (
            <AttendanceHistory shifts={history.data?.shifts ?? []} timezone={props.timezone} />
          )
        )}
        {history.data?.nextCursor && !history.error && (
          <div className="panel-body">
            <Button variant="secondary" busy={history.loadingMore} onClick={() => void more()}>
              {text.more}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
