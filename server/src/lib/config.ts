import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { getCorsOrigins } from './cors-origins';

// Load environment variables
const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
const envPath = join(process.cwd(), envFile);

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config(); // Fallback
}

export const config = {
  // Server
  nodeEnv: (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test',
  port: parseInt(process.env.PORT || '5000', 10),

  // Environment
  isDevelopment: process.env.NODE_ENV !== 'production',
  isTest: process.env.NODE_ENV === 'test',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/smartstore',

  // JWT
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookieSecret: process.env.COOKIE_SECRET || 'cookie-secret-here',

  // CORS
  corsOrigin: getCorsOrigins(process.env.CORS_ORIGIN, process.env.NODE_ENV).join(','),

  // Rate Limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  adminRateLimitMaxRequests: parseInt(process.env.ADMIN_RATE_LIMIT_MAX_REQUESTS || '1000', 10),

  // Storage
  storageType: process.env.STORAGE_TYPE || 'local',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10), // 5MB
  uploadDir: process.env.UPLOAD_DIR || './uploads',

  // Providers
  whatsappApiKey: process.env.WHATSAPP_API_KEY || '',
  whatsappPhone: process.env.WHATSAPP_PHONE || '',
  defaultPaymentMethod: (process.env.DEFAULT_PAYMENT_METHOD as any) || 'cash',

  // Features
  enableEmail: process.env.ENABLE_EMAIL === 'true',
  enableWhatsApp: process.env.ENABLE_WHATSAPP === 'true',
  demoMode: process.env.DEMO_MODE === 'true',
  enablePlatformAdmin: process.env.ENABLE_PLATFORM_ADMIN !== 'false',

  // Debug
  debug: process.env.DEBUG === '*' || process.env.DEBUG === 'true',

  // App Info
  appName: 'SmartStore',
  appVersion: '1.0.0',
  apiPrefix: '/api',
};

// Validate required environment variables
export function validateEnv() {
  const required = ['JWT_SECRET', 'DATABASE_URL'];
  const missing: string[] = [];

  for (const envVar of required) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    console.warn('⚠️ Missing required environment variables:', missing.join(', '));
  }

  if (config.nodeEnv === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'secret-key-change-in-production') {
      throw new Error('JWT_SECRET must be set in production');
    }
  }

  return missing.length === 0;
}