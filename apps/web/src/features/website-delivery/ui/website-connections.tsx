import { Button, Empty, Loading, Notice } from '@pos/ui';
import { websiteDeliveryMessages as text } from '@pos/ui/locales';
import type { WebsiteConnectionsProps } from '../model/website-delivery.types';
import { useWebsiteConnections } from '../model/use-website-connections';
import { WebsiteConnectionCard } from './website-connection-card';
import { WebsiteConnectionForm } from './website-connection-form';
import { WebsiteKeyDialog } from './website-key-dialog';
export function WebsiteConnections(props: WebsiteConnectionsProps) {
  const model = useWebsiteConnections(props);
  return (
    <section className="panel">
      <div className="panel-head website-panel-heading">
        <div>
          <h2>{text.connections}</h2>
          <p>{text.connectionsHint}</p>
        </div>
        <div className="website-delivery-actions">
          <Button
            variant="secondary"
            busy={model.connections.loading}
            disabled={model.busy}
            onClick={() => void model.connections.refresh()}
          >
            {text.reloadConnections}
          </Button>
          <Button
            disabled={model.busy || !props.locations.length}
            onClick={() => model.open({ kind: 'create' })}
          >
            {text.newConnection}
          </Button>
        </div>
      </div>
      <div className="panel-body">
        {(model.error || model.connections.error) && (
          <Notice>{model.error || model.connections.error}</Notice>
        )}
        {model.notice && <Notice tone="info">{model.notice}</Notice>}
        {model.connections.loading ? (
          <Loading />
        ) : model.connections.data?.connections.length ? (
          <div className="website-delivery-grid">
            {model.connections.data.connections.map((connection) => (
              <WebsiteConnectionCard key={connection.id} connection={connection} model={model} />
            ))}
          </div>
        ) : (
          <Empty title={text.noConnections} description={text.noConnectionsHint} />
        )}
      </div>
      {model.dialog?.kind === 'create' && <WebsiteConnectionForm model={model} {...props} />}
      <WebsiteKeyDialog model={model} />
    </section>
  );
}
