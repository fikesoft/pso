import { Router } from 'express';
import { addShiftReadRoutes } from './read.routes';
import { addShiftMutationRoutes } from './mutation.routes';
export function cashShiftsRouter() {
  const router = Router();
  addShiftMutationRoutes(router);
  addShiftReadRoutes(router);
  return router;
}
