import { addDeliveryFeePreviewRoute } from './fee-preview.routes';
import { Router } from 'express';
import { addDeliveryZoneReadRoutes } from './read.routes';
import { addDeliveryZoneCommandRoutes } from './command.routes';
export function deliveryZonesRouter() {
  const router = Router();
  addDeliveryZoneReadRoutes(router);
  addDeliveryFeePreviewRoute(router);
  addDeliveryZoneCommandRoutes(router);
  return router;
}
