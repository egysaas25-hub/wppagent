import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import config from '../config/environment';
import logger from '../config/logger';

/**
 * General API rate limiter
 */
export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    success: false,
    error: {
      message: 'Too many requests from this IP, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userId: req.user?.id,
    });
    
    res.status(429).json({
      success: false,
      error: {
        message: 'Too many requests, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
      },
    });
  },
});

/**
 * Message sending rate limiter
 */
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  keyGenerator: (req: Request) => {
    return req.user?.id || req.ip || 'anonymous';
  },
  handler: (req: Request, res: Response) => {
    logger.warn('Message rate limit exceeded', {
      userId: req.user?.id,
      sessionName: req.params.sessionName,
    });
    
    res.status(429).json({
      success: false,
      error: {
        message: 'Too many messages sent. Maximum 20 messages per minute',
        code: 'MESSAGE_RATE_LIMIT_EXCEEDED',
        retryAfter: 60,
      },
    });
  },
});

/**
 * Auth rate limiter - prevent brute force
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: {
      message: 'Too many login attempts. Please try again later',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
    },
  },
});

/**
 * Session creation limiter
 */
export const sessionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: (req: Request) => req.user?.id || req.ip || 'anonymous',
  message: {
    success: false,
    error: {
      message: 'Too many sessions created. Maximum 10 per hour',
      code: 'SESSION_CREATION_RATE_LIMIT',
    },
  },
});