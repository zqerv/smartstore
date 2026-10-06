import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { platformService } from '../../services/platform.service';
import { asyncHandler } from '../../utils/errorHandler';
import { success } from '../../utils/response';
import { authenticate, requireRole } from '../../middleware/auth';
import { storeService } from '../../services/store.service';
import platformAuthRouter from './platform/auth';
import storesRouter from './stores';

const router = Router();

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  return success(res, { message: 'Platform API is working' });
}));

router.use('/auth', platformAuthRouter);

const userQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().max(100).optional(),
  role: z.enum(['PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN', 'STAFF', 'CUSTOMER']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  storeId: z.string().max(40).optional(),
});

const settingsSchema = z.object({
  platformName: z.string().trim().min(2).max(80),
  supportEmail: z.string().trim().email().max(120).or(z.literal('')),
  supportPhone: z.string().trim().max(30),
  defaultLocale: z.enum(['ar-SA', 'en-US']),
  defaultCurrency: z.string().trim().length(3).toUpperCase(),
  allowCustomerRegistration: z.boolean(),
}).strict();

// Public: the subset of settings the login and support screens need.
router.get('/settings/public', asyncHandler(async (_req: Request, res: Response) => {
  const settings = await platformService.getSettings();
  return success(res, {
    platformName: settings.platformName,
    supportEmail: settings.supportEmail,
    supportPhone: settings.supportPhone,
    allowCustomerRegistration: settings.allowCustomerRegistration,
  });
}));

router.get('/settings', authenticate, requireRole('PLATFORM_ADMIN'), asyncHandler(async (_req: Request, res: Response) => {
  return success(res, await platformService.getSettings());
}));

router.put('/settings', authenticate, requireRole('PLATFORM_ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  return success(res, await platformService.updateSettings(settingsSchema.parse(req.body), req.user!.userId));
}));

router.get('/users', authenticate, requireRole('PLATFORM_ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  return success(res, await platformService.listUsers(userQuery.parse(req.query)));
}));

router.get('/users/:userId', authenticate, requireRole('PLATFORM_ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  return success(res, await platformService.getUser(req.params.userId));
}));

router.patch('/users/:userId/status', authenticate, requireRole('PLATFORM_ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
  return success(res, await platformService.setUserActive(req.user!.userId, req.params.userId, isActive));
}));

router.post('/users/:userId/revoke-sessions', authenticate, requireRole('PLATFORM_ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  await platformService.revokeSessions(req.user!.userId, req.params.userId);
  return success(res, { message: 'All sessions for this user were revoked' });
}));

router.use('/stores', storesRouter);

router.get('/stats',
  authenticate,
  requireRole('PLATFORM_ADMIN'),
  asyncHandler(async (_req: Request, res: Response) => {
    return success(res, await storeService.getPlatformStats());
  })
);

export default router;