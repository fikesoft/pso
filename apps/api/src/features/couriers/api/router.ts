import { Router } from 'express';
import { addCourierReadRoutes } from './read.routes';
import { addCourierCommandRoutes } from './command.routes';
export function couriersRouter() {
  const router = Router();
  addCourierReadRoutes(router);
  addCourierCommandRoutes(router);
  return router;
}
