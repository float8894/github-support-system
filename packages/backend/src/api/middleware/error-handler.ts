import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../errors/index.js';
import { logger } from '../../lib/logger.js';

const log = logger.child({ service: 'api', middleware: 'error-handler' });

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    log.warn(
      { code: err.code, message: err.message, statusCode: err.statusCode },
      'App error',
    );
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }

  log.error({ err }, 'Unexpected error');
  res
    .status(500)
    .json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
}
