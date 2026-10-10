import { Button, Empty, Loading, Notice, PageTitle } from '@pos/ui';
import { menuScheduleMessages as text, operationalMessages as common } from '@pos/ui/locales';
import { SCHEDULE_WEEKDAYS } from '../config/menu-schedules.constants';
import { timeLabel } from '../model/schedule-form';
import { useMenuSchedules } from '../model/use-menu-schedules';
import type { MenuScheduleManagementProps } from '../model/menu-schedules.types';
import { ScheduleDialog } from './schedule-dialog';

export function MenuScheduleManagement(props: MenuScheduleManagementProps) {
  const model = useMenuSchedules(props);
  const { schedules } = model;
  return (
    <section className="stack">
      <PageTitle title={text.title} eyebrow={props.locationName} description={text.description}>
        <Button
          variant="secondary"
          busy={schedules.loading}
          onClick={() => void schedules.refresh()}
        >
          {common.refresh}
        </Button>
        <Button onClick={() => model.edit(null)}>{text.newSchedule}</Button>
      </PageTitle>
      {schedules.data && (
        <p className="muted">
          {text.timezone}: {schedules.data.timezone}
        </p>
      )}
      {model.notice && <Notice tone="success">{model.notice}</Notice>}
      {schedules.error && <Notice>{schedules.error}</Notice>}
      {schedules.loading ? (
        <Loading />
      ) : schedules.error ? null : !schedules.data?.schedules.length ? (
        <Empty title={text.noSchedules} description={text.noSchedulesHint} />
      ) : (
        <div className="stack">
          {schedules.data.schedules.map((schedule) => (
            <article key={schedule.id} className="panel stack">
              <div className="attendance-controls">
                <strong>{schedule.name}</strong>
                <span>{schedule.status === 'ACTIVE' ? text.active : text.archive}</span>
              </div>
              {schedule.eventName && <p>{schedule.eventName}</p>}
              <p>
                {timeLabel(schedule.startMinute)}–{timeLabel(schedule.endMinute)} ·{' '}
                {SCHEDULE_WEEKDAYS.filter((day) => schedule.weekdays.includes(day.value))
                  .map((day) => day.label)
                  .join(', ')}
              </p>
              <p className="muted">
                {schedule.startsOn || schedule.endsOn
                  ? `${schedule.startsOn ?? '…'} — ${schedule.endsOn ?? '…'}`
                  : text.allDates}
              </p>
              <p>{schedule.products.map((product) => product.name).join(', ')}</p>
              <Button
                variant="secondary"
                onClick={() => model.edit(schedule)}
                aria-label={`${text.editSchedule}: ${schedule.name}`}
              >
                {common.edit}
              </Button>
            </article>
          ))}
        </div>
      )}
      {schedules.data?.nextCursor && (
        <Button variant="secondary" busy={schedules.loadingMore} onClick={() => void model.more()}>
          {common.more}
        </Button>
      )}
      <ScheduleDialog {...props} model={model} />
    </section>
  );
}
