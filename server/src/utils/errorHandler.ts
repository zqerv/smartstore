import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';
import {
  badRequest,
  internalError,
  notFound,
  unauthorized,
  conflict,
  unprocessableEntity,
} from './response';
import { ApiResponse } from '@smartstore/shared';

// Development-only error payload: the stack is never sent in production.
type ErrorApiResponse = ApiResponse & { stack?: string };

// Custom App Errors
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access forbidden') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super('Too many requests, please try again later', 429, 'RATE_LIMIT_EXCEEDED');
  }
}

// Centralized error handling middleware
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log the error
  logger.error('Error caught:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Handle known AppErrors
  if (err instanceof AppError) {
    return sendErrorResponse(res, err);
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: 'Invalid request',
      code: 'VALIDATION_ERROR',
      errors: err.issues.map(({ path, message }) => ({ path, message })),
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      message: 'A record with these values already exists',
      code: 'CONFLICT',
    });
  }

  // Unknown errors
  const errorResponse: ErrorApiResponse = {
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error',
    code: 'INTERNAL_ERROR',
  };

  // In development, show full stack trace
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }

  res.status(err instanceof AppError ? err.statusCode : 500).json(errorResponse);
}

function sendErrorResponse(res: Response, err: AppError) {
  const response: ErrorApiResponse = {
    success: false,
    message: err.message,
    code: err.code,
  };

  // In development, show stack for operational errors
  if (process.env.NODE_ENV === 'development' && err.isOperational) {
    response.stack = err.stack;
  }

  const statusCode = err.statusCode;
  
  res.status(statusCode).json(response);

  return;
}

// Async handler wrapper
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// 404 handler
export function notFoundHandler(req: Request, res: Response) {
  notFound(
    res,
    `Route ${req.method} ${req.path} not found`,
    'NOT_FOUND'
  );
}