import { Router } from 'express';
import authRouter from './api/auth';
import platformRouter from './api/platform';
import storesRouter from './api/stores';
import productsRouter from './api/products';
import categoriesRouter from './api/categories';
import cartRouter from './api/cart';
import guestCartRouter from './api/guest-cart';
import ordersRouter from './api/orders';
import couponsRouter from './api/coupons';
import deliveryRouter from './api/delivery';
import customersRouter from './api/customers';
import tablesRouter from './api/tables';
import reportsRouter from './api/reports';
import uploadsRouter from './api/uploads';
import publicCatalogRouter from './api/public-catalog';

const router = Router();

// Health check (already mounted at root)
// router.use('/health', healthRouter);

// API routes
router.use('/auth', authRouter);
router.use('/platform', platformRouter);
router.use('/stores', storesRouter);
router.use('/', publicCatalogRouter);

// Domain routers declare their own absolute paths (e.g. /stores/:storeId/products).
router.use('/', productsRouter);
router.use('/', categoriesRouter);
router.use('/', cartRouter);
router.use('/guest-cart', guestCartRouter);
router.use('/', ordersRouter);
router.use('/', couponsRouter);
router.use('/', deliveryRouter);
// Optional, non-core module (restaurant-style table ordering); disabled by default.
if (process.env.ENABLE_TABLE_ORDERING === 'true') router.use('/', tablesRouter);
router.use('/', reportsRouter);
router.use('/', uploadsRouter);
router.use('/customers', customersRouter);

// API info
router.get('/info', (req, res) => {
  res.json({
    name: 'SmartStore API',
    version: '1.0.0',
    status: 'Operational',
    endpoints: {
      auth: '/api/auth/*',
      platform: '/api/platform/*',
      stores: '/api/stores/*',
      products: '/api/stores/:storeId/products',
      categories: '/api/stores/:storeId/categories',
      cart: '/api/customers/:customerId/cart',
      orders: '/api/stores/:storeId/orders',
      coupons: '/api/stores/:storeId/coupons',
      delivery: '/api/stores/:storeId/zones',
      ...(process.env.ENABLE_TABLE_ORDERING === 'true' ? { tables: '/api/stores/:storeId/tables' } : {}),
    },
  });
});

export default router;