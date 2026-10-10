import { Notice } from '@pos/ui';
import { realtimeMessages, orderRealtimeMessages, kitchenRealtimeMessages } from '@pos/ui/locales';
import {
  useCatalogRealtime,
  useOrderRealtime,
  useKitchenRealtime,
} from '../../../features/realtime-sync';
import { InvalidationProvider } from '../../../shared/lib';
import { useWorkspace } from '../model/use-workspace';
import type { WorkspaceInput } from '../model/workspace-input.types';
import { Credential } from '../../../entities/workspace';
import { WorkspaceSidebar } from './workspace-sidebar';
import { WorkspaceHeader } from './workspace-header';
import { WorkspaceContent } from './workspace-content';
import { WorkspaceModal } from './workspace-modal';
export function Workspace(props: WorkspaceInput) {
  const model = useWorkspace(props);
  const { error, notice, credential, setCredential, online } = model;
  const live = useCatalogRealtime(
    model.api,
    model.locationId,
    ['catalog.read', 'catalog.manage', 'orders.create'].some(model.can),
  );
  const orderLive = useOrderRealtime(model.api, model.locationId, model.can('orders.read'));
  const kitchenLive = useKitchenRealtime(model.api, model.locationId, model.can('kitchen.read'));
  return (
    <InvalidationProvider value={{ ...live.signals, ...orderLive.signals, ...kitchenLive.signals }}>
      <div className="app-shell">
        <WorkspaceSidebar model={model} />
        <div className="main-area" ref={model.mainAreaRef}>
          <WorkspaceHeader model={model} />
          <main className="main-content">
            {live.status !== 'disabled' && (
              <p className="scope-hint" role="status">
                {realtimeMessages[live.status]}
              </p>
            )}
            {orderLive.status !== 'disabled' && (
              <p className="scope-hint" role="status">
                {orderRealtimeMessages[orderLive.status]}
              </p>
            )}
            {kitchenLive.status !== 'disabled' && (
              <p className="scope-hint" role="status">
                {kitchenRealtimeMessages[kitchenLive.status]}
              </p>
            )}
            {error && <Notice>{error}</Notice>}
            {notice && <Notice tone="success">{notice}</Notice>}
            {credential && (
              <Credential credential={credential} onDismiss={() => setCredential(null)} />
            )}
            <fieldset disabled={!online} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <WorkspaceContent model={model} />
            </fieldset>
          </main>
        </div>
        <WorkspaceModal model={model} />
      </div>
    </InvalidationProvider>
  );
}
