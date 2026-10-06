import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './lib/config';
import { errorHandler } from './utils/errorHandler';
import { success, error } from './utils/response';
import apiRoutes from './routes';
import { createServer } from 'http';
import { initRealtime } from './lib/realtime';
import { ensureDemoData } from './lib/bootstrap';
import { apiLimiter } from './middleware/rateLimit';
import { UPLOAD_ROOT } from './lib/providers/storage';

const app: Application = express();

// =====================
// Middlewares
// =====================

// Security headers
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: config.corsOrigin.split(',').map(o => o.trim()),
  credentials: true,
}));

// Request logging
if (config.nodeEnv !== 'test') {
  app.use(morgan('combined'));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =====================
// Routes
// =====================

app.use('/api', apiLimiter, apiRoutes);
app.use('/uploads', express.static(UPLOAD_ROOT, { index: false, dotfiles: 'deny', setHeaders: (res) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); } }));

// =====================
// Health Check
// =====================

app.get('/health', (req: Request, res: Response) => {
  success(res, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
  });
});

app.get('/', (req: Request, res: Response) => {
  success(res, {
    message: 'SmartStore API Server',
    version: '1.0.0',
    documentation: '/api/docs',
  });
});

// =====================
// 404 Handler
// =====================

app.use((req: Request, res: Response) => {
  error(res, 'Route not found', 404, 'NOT_FOUND');
});

// =====================
// Error Handling
// =====================

app.use(errorHandler);

// =====================
// Start Server
// =====================

const PORT = config.port || 5000;

const httpServer = createServer(app);
initRealtime(httpServer);

const startServer = () => {
  httpServer.listen(PORT, () => {
    console.log(`🚀 SmartStore API Server running on port ${PORT}`);
    console.log(`📦 Environment: ${config.nodeEnv}`);
    console.log(`🔗 API URL: http://localhost:${PORT}/api`);
  });
};

void (config.demoMode ? ensureDemoData() : Promise.resolve())
  .then(startServer)
  .catch((startupError) => {
    console.error('Failed to initialise SmartStore demo data:', startupError);
    process.exit(1);
  });

export default app;