import express from 'express';
import { authorizedCron } from '../model/cron-authorization';
import { runWorkerBatch } from '../model/run-batch';

export function createWorkerApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/internal/jobs', async (req, res) => {
    if (!authorizedCron(req.headers.authorization, process.env.CRON_SECRET)) {
      res.status(401).json({ error: 'Autentificare necesară' });
      return;
    }
    try {
      res.json(await runWorkerBatch());
    } catch {
      res.status(503).json({ error: 'Procesarea sarcinilor nu este disponibilă.' });
    }
  });
  app.use((_req, res) => {
    res.status(404).json({ error: 'Ruta nu există' });
  });
  return app;
}
