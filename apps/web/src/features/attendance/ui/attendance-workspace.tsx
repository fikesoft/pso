import { Notice, PageTitle } from '@pos/ui';
import { attendanceMessages as text } from '@pos/ui/locales';
import type { AttendanceWorkspaceProps } from '../model/attendance.types';
import { AttendanceClock } from './attendance-clock';
import { AttendanceReport } from './attendance-report';

export function AttendanceWorkspace(props: AttendanceWorkspaceProps) {
  return (
    <div className="stack">
      <PageTitle title={text.title} description={text.description} />
      {!props.locationId ? (
        <Notice tone="info">{text.chooseLocation}</Notice>
      ) : (
        <>
          {props.canClock ? (
            <AttendanceClock {...props} />
          ) : (
            <Notice tone="info">{text.readOnly}</Notice>
          )}
          {props.canRead && (
            <AttendanceReport
              api={props.api}
              locationId={props.locationId}
              timezone={props.timezone}
            />
          )}
        </>
      )}
    </div>
  );
}
