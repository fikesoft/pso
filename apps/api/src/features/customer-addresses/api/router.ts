import { addAddressManagementReadRoute } from './management-read.routes';
import { addAddressManagementCommandRoutes } from './management-command.routes';
import { Router } from 'express';
import { addAddressReadRoute } from './read.routes';
import { addAddressCreateRoute } from './create.routes';
import { addAddressArchiveRoute } from './archive.routes';
import { addAddressResolutionRoute } from './resolution.routes';
export function customerAddressesRouter() {
  const router = Router();
  addAddressManagementReadRoute(router);
  addAddressManagementCommandRoutes(router);
  addAddressReadRoute(router);
  addAddressCreateRoute(router);
  addAddressResolutionRoute(router);
  addAddressArchiveRoute(router);
  return router;
}
