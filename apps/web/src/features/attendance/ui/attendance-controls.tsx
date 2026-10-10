import { Button, Modal, Notice } from '@pos/ui';
import { attendanceMessages as text } from '@pos/ui/locales';
import type { AttendanceControlsProps } from '../model/attendance.types';

export function AttendanceControls({ model }: AttendanceControlsProps) {
  const { current, action, confirmEnd, setConfirmEnd, start, change } = model;
  const shift = current.data?.shift;
  const elsewhere = !!shift && shift.locationId !== model.locationId;
  const locked = action.locked || current.loading || !!current.error || elsewhere;
  return (
    <>
      {action.error && <Notice>{action.error}</Notice>}
      {action.uncertain && (
        <Notice tone="info">
          {text.unknown}
          <Button busy={action.busy} onClick={() => void action.submit()}>
            {text.retry}
          </Button>
        </Notice>
      )}
      <div className="attendance-controls">
        {!shift && (
          <Button disabled={locked} onClick={start}>
            {text.start}
          </Button>
        )}
        {shift?.status === 'ACTIVE' && (
          <Button disabled={locked} onClick={() => change('START_BREAK')}>
            {text.startBreak}
          </Button>
        )}
        {shift?.status === 'ON_BREAK' && (
          <Button disabled={locked} onClick={() => change('END_BREAK')}>
            {text.endBreak}
          </Button>
        )}
        {shift && (
          <Button variant="secondary" disabled={locked} onClick={() => setConfirmEnd(true)}>
            {text.end}
          </Button>
        )}
      </div>
      <Modal
        open={confirmEnd}
        onOpenChange={(open) => {
          if (!action.locked) setConfirmEnd(open);
        }}
        title={text.endTitle}
      >
        <div className="form-stack">
          <p>{text.endHint}</p>
          {action.error && <Notice>{action.error}</Notice>}
          {action.uncertain && <Notice tone="info">{text.unknown}</Notice>}
          <div className="form-footer">
            <Button
              variant="secondary"
              disabled={action.locked}
              onClick={() => setConfirmEnd(false)}
            >
              {text.cancel}
            </Button>
            <Button
              busy={action.busy}
              onClick={() => (action.uncertain ? void action.submit() : change('END_SHIFT'))}
            >
              {action.uncertain ? text.retry : text.end}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
