import { Router } from 'express';
import { addRegisterReadRoutes } from './read.routes';
import { addRegisterMutationRoutes } from './mutation.routes';
import { addRegisterResolutionRoute } from './resolution.routes';
export function cashRegistersRouter() {
  const router = Router();
  addRegisterResolutionRoute(router);
  addRegisterReadRoutes(router);
  addRegisterMutationRoutes(router);
  return router;
}
