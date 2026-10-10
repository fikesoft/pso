import { Router } from 'express';
import { addWebsiteManagementRoutes } from './management.routes';
import { addWebsiteInboxRoutes } from './inbox.routes';
export function websiteTenantRouter() {
  const router = Router();
  addWebsiteManagementRoutes(router);
  addWebsiteInboxRoutes(router);
  return router;
}
