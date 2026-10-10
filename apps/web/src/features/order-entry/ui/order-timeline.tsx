import { defaultTimezone } from '../../../shared/config';
import { Button, Loading, Notice } from '@pos/ui';
import { orderTimelineMessages as text } from '@pos/ui/locales';
import type { OrderTimelineProps } from '../model/order-timeline.types';
import { useOrderTimeline } from '../model/use-order-timeline';
import { OrderTimelineEvent } from './order-timeline-event';
export function OrderTimeline(props: OrderTimelineProps) {
  const model = useOrderTimeline(props);
  return (
    <details data-testid="order-timeline">
      <summary>{text.title}</summary>
      <section className="form-stack" aria-label={text.title}>
        <p className="scope-hint">
          {text.newestFirst} {text.timezone}: {defaultTimezone}.
        </p>
        <Button variant="secondary" busy={model.loading} onClick={() => void model.refresh()}>
          {text.refresh}
        </Button>
        {model.loading && <Loading />}
        {model.error && <Notice>{model.error}</Notice>}
        {!model.loading && model.data && !model.data.events.length && <p>{text.empty}</p>}
        <ol className="form-stack">
          {model.data?.events.map((event) => (
            <OrderTimelineEvent key={event.id} event={event} />
          ))}
        </ol>
        {model.data?.nextCursor && (
          <Button
            variant="secondary"
            busy={model.loadingMore}
            disabled={model.loading || model.liveBusy}
            onClick={() => void model.more()}
          >
            {text.more}
          </Button>
        )}
      </section>
    </details>
  );
}
