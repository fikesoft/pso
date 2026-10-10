import { addVisitMutationRoutes } from './visit-mutation.routes';
import { addVisitReadRoutes } from './visit-read.routes';
import { addVisitOrderRoute } from './visit-orders.routes';
import { addMapRoute } from './map.routes';
import { Router } from 'express';
import { addTableReadRoutes } from './read.routes';
import { addTableMutationRoutes } from './mutation.routes';
import { addTableResolutionRoute } from './resolution.routes';
export function diningTablesRouter() {
  const router = Router();
  addTableResolutionRoute(router);
  addTableReadRoutes(router);
  addTableMutationRoutes(router);
  addVisitMutationRoutes(router);
  addVisitReadRoutes(router);
  addVisitOrderRoute(router);
  addMapRoute(router);
  return router;
}
