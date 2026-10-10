import { Button, Empty, Loading, Notice, Select } from '@pos/ui';
import { websiteDeliveryMessages as text } from '@pos/ui/locales';
import { WEBSITE_STATUS_LABELS } from '../config/website-delivery.constants';
import type { WebsiteInboxProps, WebsiteStatusFilter } from '../model/website-delivery.types';
import { useWebsiteInbox } from '../model/use-website-inbox';
import { WebsiteInboxList } from './website-inbox-list';
import { WebsiteOrderDialog } from './website-order-dialog';
export function WebsiteInbox(props: WebsiteInboxProps) {
  const model = useWebsiteInbox(props);
  return (
    <section className="panel">
      <div className="panel-head website-panel-heading">
        <h2>{text.inbox}</h2>
        <Button
          variant="secondary"
          busy={model.orders.loading}
          onClick={() => void model.orders.refresh()}
        >
          {text.reloadInbox}
        </Button>
      </div>
      <div className="panel-body">
        <Select
          label={text.filter}
          value={model.status}
          disabled={model.orders.loadingMore}
          onChange={(event) => model.setStatus(event.target.value as WebsiteStatusFilter)}
        >
          <option value="">{text.allStatuses}</option>
          {Object.entries(WEBSITE_STATUS_LABELS).map(([status, label]) => (
            <option key={status} value={status}>
              {label}
            </option>
          ))}
        </Select>
        {model.orders.error && <Notice>{model.orders.error}</Notice>}
        {model.orders.loading ? (
          <Loading />
        ) : model.orders.data?.orders.length ? (
          <WebsiteInboxList orders={model.orders.data.orders} onOpen={model.setSelectedId} />
        ) : (
          <Empty title={text.emptyInbox} description={text.emptyInboxHint} />
        )}
        {model.orders.data?.nextCursor && (
          <div className="form-footer">
            <Button
              variant="secondary"
              busy={model.orders.loadingMore}
              disabled={model.orders.loading}
              onClick={() => void model.more()}
            >
              {text.more}
            </Button>
          </div>
        )}
      </div>
      {model.selectedId && (
        <WebsiteOrderDialog
          key={model.selectedId}
          {...props}
          id={model.selectedId}
          onClose={() => model.setSelectedId(null)}
          onUpdated={() => void model.orders.refresh()}
        />
      )}
    </section>
  );
}
