import { Router } from 'express';
import { config } from '../lib/config';
import { responseHandler } from '../utils/response';

const router = Router();

/**
 * Health check endpoint
 * Usage: GET /health
 */
router.get('/', (req, res) => {
  const status = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
    version: config.appVersion,
    services: {
      database: 'connected', // Will be updated when DB check is implemented
    },
  };

  responseHandler(res, status, 200);
});

/**
 * Health check with detailed info
 * Usage: GET /health/detailed
 */
router.get('/detailed', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    cycle: 'PHASE 1 - API Infrastructure',
    database: {
      configured: !!process.env.DATABASE_URL,
      connection: 'Configured', // Will be implemented in PHASE 2
    },
    config: {
      port: config.port,
      environment: config.nodeEnv,
      corsOrigin: config.corsOrigin,
      jwtSecret: 'Configured',
    },
  };

  responseHandler(res, health, 200);
});

export default router;