import { Button, Empty, Loading, Notice, PageTitle, RefreshCw } from '@pos/ui';
import { operationalMessages as text, kitchenCourseMessages as courseText } from '@pos/ui/locales';
import { useCourseOperation } from '../../../entities/kitchen';
import { KITCHEN_STATUS_LABELS } from '../../../shared/config/operations.constants';
import { KITCHEN_COLUMNS } from '../config/kitchen.constants';
import { useKitchenBoard } from '../model/use-kitchen-board';
import type { KitchenBoardProps } from '../model/kitchen-board.types';
import { KitchenCard } from './kitchen-card';
import { KitchenStationFilter } from './kitchen-station-filter';
import { KitchenSound } from './kitchen-sound';
import { useKitchenClock } from '../model/use-kitchen-clock';
import { KitchenCourseRecovery } from './kitchen-course-recovery';
export function KitchenBoard(props: KitchenBoardProps) {
  const model = useKitchenBoard(props);
  const courses = useCourseOperation({
    ...props,
    canFire: props.can('kitchen.courses.fire') && !model.busy && !model.uncertain && !model.stale,
    onSaved: async () => {
      if (!(await model.refresh())) throw new Error(courseText.refreshRequired);
    },
  });
  const locked = courses.locked || model.busy || model.uncertain || model.stale;
  async function refresh() {
    if (await model.refresh()) courses.refreshed();
  }
  const { data, loading, error } = model.board;
  const now = useKitchenClock(data);
  const empty = !data || KITCHEN_COLUMNS.every((status) => !data[status].tickets.length);
  return (
    <section>
      <PageTitle
        title={text.kitchen}
        eyebrow={props.locationName}
        description={text.kitchenDescription}
      >
        <Button
          variant="secondary"
          busy={loading || model.busy || courses.busy}
          disabled={model.uncertain || courses.recovering}
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} />
          {text.refresh}
        </Button>
      </PageTitle>
      <KitchenStationFilter
        api={props.api}
        locationId={props.locationId}
        value={model.stationId}
        onChange={model.selectStation}
        disabled={locked || loading}
      />
      <KitchenSound
        key={`${props.locationId}:${model.stationId ?? ''}`}
        api={props.api}
        locationId={props.locationId}
        stationId={model.stationId}
      />
      <p className="section-note">
        {text.actor}: {props.actorName} · {text.noKitchenDevice}
      </p>
      {(error || model.error) && <Notice>{error || model.error}</Notice>}
      <KitchenCourseRecovery operation={courses} />
      {model.uncertain && <Notice tone="info">{text.retryUnknown}</Notice>}
      {model.stale && <Notice tone="info">{text.stale}</Notice>}
      {model.uncertain && (
        <Button busy={model.busy} onClick={() => void model.retry()}>
          {text.retry}
        </Button>
      )}
      {model.notice && <Notice tone="success">{model.notice}</Notice>}
      {loading ? (
        <Loading />
      ) : empty ? (
        <Empty title={text.noTickets} description={text.noTicketsHint} />
      ) : (
        <div className="operation-kitchen-board">
          {KITCHEN_COLUMNS.map((status) => (
            <section
              className="operation-kitchen-column"
              key={status}
              aria-label={KITCHEN_STATUS_LABELS[status]}
            >
              <h2>
                {KITCHEN_STATUS_LABELS[status]} <span>{data?.[status].tickets.length ?? 0}</span>
              </h2>
              {data?.[status].tickets.map((ticket) => (
                <KitchenCard
                  api={props.api}
                  key={ticket.id}
                  ticket={ticket}
                  now={now}
                  stationId={model.stationId}
                  canUpdate={
                    props.can('kitchen.update') &&
                    !model.uncertain &&
                    !model.stale &&
                    courses.ready &&
                    !courses.recovering &&
                    !courses.stale
                  }
                  canFire={props.can('kitchen.courses.fire')}
                  onFire={(ticket, course) => {
                    if (!locked)
                      void courses.send({
                        ticketId: ticket.id,
                        version: ticket.version,
                        requestKey: crypto.randomUUID(),
                        course,
                      });
                  }}
                  busy={locked}
                  onUpdate={(ticket, next, batchId) => {
                    if (!locked) void model.update(ticket, next, batchId);
                  }}
                />
              ))}
              {data?.[status].nextCursor && (
                <Button
                  variant="secondary"
                  busy={model.busy || courses.busy}
                  disabled={courses.locked || model.uncertain}
                  onClick={() => void model.more(status)}
                >
                  {text.more}
                </Button>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
