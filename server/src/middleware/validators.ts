import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodType } from 'zod';

/**
* Validators middleware
*/

export function validateBody<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Validate body failed',
        code: 'VALIDATE_BODY_FAILED',
        fields: error.errors,
      });
    }
  };
}

export function validateQuery<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.query = {
        ...req.query,
        ...schema.parse(req.query),
      };
      next();
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Validate query failed',
        code: 'VALIDATE_QUERY_FAILED',
        fields: error.errors,
      });
    }
  };
}

export function validate<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = schema.parse({
        params: req.params,
        body: req.body,
        query: req.query,
      });
      req.body = data.body;
      req.query = data.query;
      next();
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Validate failed',
        code: 'VALIDATE_FAILED',
        fields: error.errors,
      });
    }
  };
}

export function validateID(req: Request, res: Response, next: NextFunction): void {
  const ids = ['id'] as const;
  validateMultipleParams(ids.length, ids)(req, res, next);
}

export function validateMultipleParams(ids: number, keys: readonly string[]): any {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate all required IDs from params exist
      const result = keys.map((key) => {
        if (req.params[key] === undefined || req.params[key] === null) {
          const error: any = new Error(`Missing param: ${key}`);
          error.code = 'MISSING_PARAM';
          throw error;
        }
        return req.params[key];
      });

      next();
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message || 'Invalid or missing required IDs',
        code: error.code || 'MISSING_PARAMS',
      });
    }
  };
}

export function validateRequired(data: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const missing = fields.filter((field) => !data[field] && data[field] !== 0);
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  return data;
}

export function paginateQuery(req: Request): any {
  const page = Number.parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10);
  const limit = Number.parseInt(typeof req.query.limit === 'string' ? req.query.limit : '20', 10);

  if (isNaN(page) || page < 1) {
    return { page: 1, limit: Number.isNaN(limit) ? 20 : Math.min(Math.max(1, limit), 100) };
  }

  const boundedLimit = Math.min(Math.max(1, limit), 100);
  return { page, limit: boundedLimit };
}

export function searchQuery(req: Request, defaultField: string): any {
  const search = req.query.search as string | undefined;
  const field = (req.query.field as string) || defaultField;

  if (!search) {
    return {};
  }

  return { [field]: { contains: search } };
}

export function validateStoreOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const storeIdParam = req.params.storeId;
  if (!storeIdParam) {
    res.status(400).json({
      success: false,
      error: 'Store ID required',
      code: 'MISSING_STORE_ID',
    });
    return;
  }

  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTHENTICATION_REQUIRED',
    });
    return;
  }

  if (req.user.role !== 'PLATFORM_ADMIN' && req.user.storeId !== storeIdParam) {
    res.status(403).json({
      success: false,
      error: 'You do not have access to this store',
      code: 'STORE_ACCESS_DENIED',
    });
    return;
  }

  next();
}