import { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';
import config from '../config/environment';

/**
 * Add request ID to every request
 */
export const addRequestId = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  
  // Add logger with context to request
  req.logger = logger.child({
    requestId: req.id,
    method: req.method,
    path: req.path,
    userId: req.user?.id,
  });
  
  next();
};

/**
 * HTTP request logger using Morgan
 */
export const httpLogger = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  {
    stream: {
      write: (message: string) => logger.http(message.trim()),
    },
    skip: (req: Request) => {
      return config.env === 'production' && 
             ['/health', '/live', '/ready'].includes(req.url);
    },
  }
);

/**
 * Log request details
 */
export const logRequestDetails = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();

  logger.info('Incoming request', {
    requestId: req.id,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
  });

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    const logData = {
      requestId: req.id,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id,
    };

    if (res.statusCode >= 500) {
      logger.error('Request completed with error', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('Request completed with client error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  next();
};