import { Router } from 'express';
import { addAvatarRoutes } from './avatar.routes';
import { addProductImageRoutes } from './product-image.routes';

export function mediaRouter() {
  const router = Router();
  addAvatarRoutes(router);
  addProductImageRoutes(router);
  return router;
}
