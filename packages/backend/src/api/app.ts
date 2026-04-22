import express, { type Express } from 'express';
import { env } from '../config/env.js';
import { casesRouter } from './cases.router.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';

export function createApp(): Express {
  const app = express();

  // ─── Body parsing ───────────────────────────────────────────────────────────
  app.use(express.json());

  // ─── CORS ───────────────────────────────────────────────────────────────────
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-key');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // ─── Request logging ────────────────────────────────────────────────────────
  app.use(requestLogger);

  // ─── Routes ─────────────────────────────────────────────────────────────────
  app.use('/api', casesRouter);

  // ─── Health check ───────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // ─── Error handler (must be last) ───────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
