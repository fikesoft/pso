import { Button, Modal, Notice } from '@pos/ui';
import { menuScheduleMessages as text, operationalMessages as common } from '@pos/ui/locales';
import type { ScheduleDialogProps } from '../model/menu-schedules.types';
import { ScheduleFields } from './schedule-fields';
import { ScheduleProducts } from './schedule-products';

export function ScheduleDialog({ model, ...props }: ScheduleDialogProps) {
  const { editing, busy, uncertain, error } = model;
  const locked = busy || uncertain;
  return (
    <Modal
      open={editing !== undefined}
      title={editing ? text.editSchedule : text.newSchedule}
      description={`${text.timezone}: ${model.schedules.data?.timezone ?? ''}`}
      onOpenChange={(open) => {
        if (!open && !locked) model.edit(undefined);
      }}
    >
      {editing !== undefined && (
        <form
          key={`${editing?.id ?? 'new'}:${editing?.version ?? 0}`}
          className="form-stack"
          onSubmit={(event) => void model.save(event)}
        >
          {error && (
            <Notice>
              {error}
              {editing && (
                <Button
                  type="button"
                  variant="secondary"
                  busy={busy}
                  onClick={() => void model.reload()}
                >
                  {common.refresh}
                </Button>
              )}
            </Notice>
          )}
          {uncertain && <Notice>{text.uncertain}</Notice>}
          <fieldset className="operation-fields" disabled={locked}>
            <ScheduleFields schedule={editing} />
            <ScheduleProducts {...props} schedule={editing} />
          </fieldset>
          <div className="form-footer">
            <Button
              type="button"
              variant="secondary"
              disabled={locked}
              onClick={() => model.edit(undefined)}
            >
              {common.cancel}
            </Button>
            <Button type="submit" busy={busy}>
              {uncertain ? text.retry : text.save}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
