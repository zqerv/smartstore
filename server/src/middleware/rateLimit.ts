import rateLimit from 'express-rate-limit';
import { config } from '../lib/config';

const body = { success: false, error: 'Too many requests, please try again later' };

export const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: Math.max(config.rateLimitMaxRequests, 1000),
  standardHeaders: true,
  legacyHeaders: false,
  message: body,
});

// Counts failed attempts only, so normal sign-ins are never throttled.
export const authLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: body,
});
