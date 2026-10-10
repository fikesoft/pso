import { addActiveOrdersRoute } from './active.routes';
import { addRepeatRoutes } from './repeat.routes';
import { addOrderSearchRoute } from './search.routes';
import { addOrderCreatorsRoute } from './creators.routes';
import { Router } from 'express';
import { addDraftRoutes } from './draft.routes';
import { addOrderReadRoutes } from './read.routes';
import { addSendRoutes } from './send.routes';
import { addLifecycleRoutes } from './lifecycle.routes';
import { addCompletionRoute } from './completion.routes';
import { addTimelineRoute } from './timeline.routes';
import { addCreationResolutionRoute } from './creation-resolution.routes';
import { addOrderDeliveryFeeRoutes } from './delivery-fee.routes';

export function ordersRouter() {
  const router = Router();
  addActiveOrdersRoute(router);
  addOrderSearchRoute(router);
  addRepeatRoutes(router);
  addOrderCreatorsRoute(router);
  addOrderReadRoutes(router);
  addCreationResolutionRoute(router);
  addTimelineRoute(router);
  addDraftRoutes(router);
  addOrderDeliveryFeeRoutes(router);
  addSendRoutes(router);
  addLifecycleRoutes(router);
  addCompletionRoute(router);
  return router;
}
