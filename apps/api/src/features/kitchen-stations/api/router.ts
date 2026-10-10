import { Router } from 'express';
import { addStationMutationRoutes } from './mutation.routes';
import { addStationReadRoutes } from './read.routes';
import { addStationResolutionRoute } from './resolution.routes';
import { addRoutingRoutes } from './routing.routes';
import { addRoutingProductRoutes } from './routing-products.routes';
export function kitchenStationsRouter() {
  const router = Router();
  addStationReadRoutes(router);
  addStationMutationRoutes(router);
  addStationResolutionRoute(router);
  addRoutingRoutes(router);
  addRoutingProductRoutes(router);
  return router;
}
