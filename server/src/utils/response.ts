import { Response } from 'express';
import { ApiResponse } from '@smartstore/shared';

/**
 * Standard API Response Handler
 */
export function responseHandler<T = any>(
  res: Response,
  data?: T,
  statusCode: number = 200
) {
  const response: ApiResponse<T> = {
    success: true,
    data,
  };

  res.status(statusCode).json(response);
}

/**
 * Success response with data
 */
export function success<T>(res: Response, data?: T) {
  responseHandler(res, data, 200);
}

/**
 * Created response
 */
export function created<T>(res: Response, data?: T) {
  responseHandler(res, data, 201);
}

/**
 * Accepted response
 */
export function accepted<T>(res: Response, data?: T) {
  responseHandler(res, data, 202);
}

/**
 * No content response
 */
export function noContent(res: Response) {
  res.status(204).send();
}

/**
 * Error response
 */
export function error<T = any>(
  res: Response,
  message: string,
  statusCode: number = 500,
  code?: string
) {
  const response: ApiResponse<T> = {
    success: false,
    error: message,
    code,
  };

  res.status(statusCode).json(response);
}

/**
 * Bad request error
 */
export function badRequest(res: Response, message: string, code?: string) {
  error(res, message, 400, code);
}

/**
 * Unauthorized error
 */
export function unauthorized(res: Response, message: string = 'Unauthorized', code?: string) {
  error(res, message, 401, code);
}

/**
 * Forbidden error
 */
export function forbidden(res: Response, message: string = 'Forbidden', code?: string) {
  error(res, message, 403, code);
}

/**
 * Not found error
 */
export function notFound(res: Response, message: string = 'Resource not found', code?: string) {
  error(res, message, 404, code);
}

/**
 * Conflict error
 */
export function conflict(res: Response, message: string = 'Conflict', code?: string) {
  error(res, message, 409, code);
}

/**
 * Method not allowed error
 */
export function methodNotAllowed(res: Response, message: string = 'Method not allowed', code?: string) {
  error(res, message, 405, code);
}

/**
 * Unprocessable entity error
 */
export function unprocessableEntity(res: Response, message: string = 'Unprocessable entity', code?: string) {
  error(res, message, 422, code);
}

/**
 * Internal server error
 */
export function internalError(res: Response, message: string = 'Internal server error', code?: string) {
  error(res, message, 500, code);
}

/**
 * Service unavailable error
 */
export function serviceUnavailable(res: Response, message: string = 'Service temporarily unavailable', code?: string) {
  error(res, message, 503, code);
}