import { Request, Response, NextFunction } from 'express';
import { TenantModel } from '../models/tenant.model';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import logger from '../config/logger';

/**
 * Extend Express Request to include tenant
 */
declare global {
  namespace Express {
    interface Request {
      tenant?: {
        id: string;
        name: string;
        slug: string;
        plan: string;
        status: string;
      };
    }
  }
}

/**
 * Middleware to extract and validate tenant from request
 * Supports multiple tenant identification methods:
 * 1. Subdomain: tenant.example.com
 * 2. Header: X-Tenant-ID or X-Tenant-Slug
 * 3. User's tenant_id (if authenticated)
 */
export function tenantContext(req: Request, res: Response, next: NextFunction): void {
  try {
    let tenant = null;

    // Method 1: Check for tenant in headers
    const tenantIdHeader = req.headers['x-tenant-id'] as string;
    const tenantSlugHeader = req.headers['x-tenant-slug'] as string;

    if (tenantIdHeader) {
      tenant = TenantModel.findById(tenantIdHeader);
    } else if (tenantSlugHeader) {
      tenant = TenantModel.findBySlug(tenantSlugHeader);
    }

    // Method 2: Extract from subdomain
    if (!tenant) {
      const host = req.headers.host || '';
      const parts = host.split('.');

      // Check if subdomain exists (e.g., tenant.example.com has 3+ parts)
      if (parts.length >= 3) {
        const subdomain = parts[0];
        if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
          tenant = TenantModel.findBySlug(subdomain);
        }
      }
    }

    // Method 3: Use authenticated user's tenant
    if (!tenant && (req as any).user?.tenant_id) {
      tenant = TenantModel.findById((req as any).user.tenant_id);
    }

    if (tenant) {
      // Check if tenant is active
      if (tenant.status !== 'active') {
        throw new AuthorizationError('Tenant is not active');
      }

      req.tenant = {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
        status: tenant.status,
      };

      logger.debug('Tenant context set', {
        tenantId: tenant.id,
        slug: tenant.slug,
      });
    }

    next();
  } catch (error: any) {
    next(error);
  }
}

/**
 * Middleware to require tenant context
 * Must be used after tenantContext middleware
 */
export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenant) {
    logger.warn('Tenant context missing', { url: req.originalUrl, userId: (req as any).user?.id });
    throw new AuthenticationError('Tenant context required');
  }
  next();
}

/**
 * Middleware to check tenant plan
 */
export function requirePlan(...allowedPlans: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenant) {
      throw new AuthenticationError('Tenant context required');
    }

    if (!allowedPlans.includes(req.tenant.plan)) {
      throw new AuthorizationError(
        `This feature requires one of the following plans: ${allowedPlans.join(', ')}`
      );
    }

    next();
  };
}

/**
 * Middleware to check if tenant has reached session limit
 */
export function checkSessionLimit(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenant) {
    throw new AuthenticationError('Tenant context required');
  }

  if (TenantModel.hasReachedSessionLimit(req.tenant.id)) {
    throw new AuthorizationError('Session limit reached for your plan. Please upgrade.');
  }

  next();
}

/**
 * Middleware to check if tenant has reached user limit
 */
export function checkUserLimit(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenant) {
    throw new AuthenticationError('Tenant context required');
  }

  if (TenantModel.hasReachedUserLimit(req.tenant.id)) {
    throw new AuthorizationError('User limit reached for your plan. Please upgrade.');
  }

  next();
}

/**
 * Middleware to filter data by tenant
 * Adds tenant_id to query/body automatically
 */
export function filterByTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenant) {
    throw new AuthenticationError('Tenant context required');
  }

  // Add tenant_id to body for create/update operations
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    req.body.tenant_id = req.tenant.id;
  }

  // Add tenant_id to query for filtering
  req.query.tenant_id = req.tenant.id;

  next();
}