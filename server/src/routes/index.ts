import { Router } from 'express';
import healthRouter from './health';
import apiRouter from './api';

const router = Router();

// Health check endpoint
router.use('/', healthRouter);

// The application mounts this router at /api.
router.use('/', apiRouter);

// 404 for unknown routes
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    code: 'NOT_FOUND',
  });
});

export default router;