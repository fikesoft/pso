import type { RealtimeSubscription } from '@pos/contracts';
import type { TenantActorReference } from '../../../shared/lib/http';
import { authorizeCatalogSubscription } from './catalog-subscription';
import { authorizeOrderSubscription } from './order-subscription';
import { authorizeKitchenSubscription } from './kitchen-subscription';

export function authorizeLiveSubscription(
  actor: TenantActorReference,
  subscription?: RealtimeSubscription,
) {
  if (subscription?.topic === 'kitchen')
    return authorizeKitchenSubscription(actor, subscription.locationId);
  return subscription?.topic === 'orders'
    ? authorizeOrderSubscription(actor, subscription.locationId)
    : authorizeCatalogSubscription(actor, subscription?.locationId);
}
