import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult, ValidationChain } from 'express-validator';
import { ValidationError } from '../utils/errors';

/**
 * Validation middleware to check for errors
 */
export const validate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }
  
  next();
};

/**
 * Common validators
 */
export const validators = {
  sessionName: param('sessionName')
    .isString()
    .trim()
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Session name must contain only letters, numbers, hyphens and underscores')
    .isLength({ min: 3, max: 50 })
    .withMessage('Session name must be between 3 and 50 characters'),

  phoneNumber: body('to')
    .isString()
    .trim()
    .matches(/^\d{10,15}@c\.us$/)
    .withMessage('Invalid phone number format. Expected: digits@c.us'),

  messageContent: body('message')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Message cannot be empty')
    .isLength({ max: 4096 })
    .withMessage('Message cannot exceed 4096 characters'),

  email: body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address'),

  password: body('password')
    .isString()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),

  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
      .toInt(),
  ],
};

/**
 * Specific route validators
 */
export const authValidators = {
  register: [
    validators.email,
    validators.password,
    body('name')
      .isString()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('role')
      .optional()
      .isIn(['admin', 'agent', 'viewer'])
      .withMessage('Invalid role'),
    validate,
  ],

  login: [
    validators.email,
    body('password').isString().notEmpty().withMessage('Password is required'),
    validate,
  ],
};

export const sessionValidators = {
  create: [
    body('sessionName')
      .isString()
      .trim()
      .matches(/^[a-zA-Z0-9_-]+$/)
      .isLength({ min: 3, max: 50 }),
    body('autoReconnect')
      .optional()
      .isBoolean()
      .withMessage('autoReconnect must be boolean'),
    validate,
  ],

  update: [
    validators.sessionName,
    body('autoReconnect')
      .optional()
      .isBoolean(),
    validate,
  ],
};

export const messageValidators = {
  sendText: [
    validators.sessionName,
    validators.phoneNumber,
    validators.messageContent,
    validate,
  ],

  list: [
    validators.sessionName,
    ...validators.pagination,
    query('chatId').optional().isString(),
    validate,
  ],
};