import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';
import config from '../config/environment';
import { ApiResponse } from '../utils/response';
import { AppError } from '../utils/errors';

/**
 * Global error handler
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log error
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    userId: req.user?.id,
    requestId: req.id,
  });

  // Handle operational errors
  if (err instanceof AppError && err.isOperational) {
    res.status(err.statusCode).json(
      ApiResponse.error(err.message, err.code, err.details)
    );
    return;
  }

  // Handle specific error types
  if (err.name === 'ValidationError') {
    res.status(400).json(
      ApiResponse.error('Validation failed', 'VALIDATION_ERROR', (err as any).details)
    );
    return;
  }

  if (err.name === 'JsonWebTokenError') {
    res.status(401).json(
      ApiResponse.error('Invalid token', 'INVALID_TOKEN')
    );
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json(
      ApiResponse.error('Token expired', 'TOKEN_EXPIRED')
    );
    return;
  }

  // Unknown errors - don't leak details in production
  if (config.env === 'production') {
    res.status(500).json(
      ApiResponse.error('An unexpected error occurred', 'INTERNAL_SERVER_ERROR')
    );
    return;
  }

  // In development, show full error
  res.status(500).json(
    ApiResponse.error(
      err.message || 'Internal server error',
      'INTERNAL_SERVER_ERROR',
      { stack: err.stack, name: err.name }
    )
  );
};

/**
 * Handle 404 - Not Found
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json(
    ApiResponse.error(
      `Route ${req.method} ${req.url} not found`,
      'ROUTE_NOT_FOUND'
    )
  );
};

/**
 * Async error wrapper
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};