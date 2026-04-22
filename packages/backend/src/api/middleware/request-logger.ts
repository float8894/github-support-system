import type { NextFunction, Request, Response } from 'express';
import { logger } from '../../lib/logger.js';

const log = logger.child({ service: 'api', middleware: 'request-logger' });

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();
  res.on('finish', () => {
    log.info(
      {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
      },
      'Request completed',
    );
  });
  next();
}
