import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { success, created } from '../../utils/response';
import { storeService } from '../../services/store.service';
import { customerService } from '../../services/customer.service';
import { authenticate, requireRole, verifyStoreOwnership } from '../../middleware/auth';
import { realtime } from '../../lib/realtime';

const router = Router();

const merchantRoles = ['STORE_OWNER', 'STORE_ADMIN', 'STAFF'] as const;
const adminRoles = ['STORE_OWNER', 'STORE_ADMIN'] as const;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB color');
const optionalEmail = z.string().email().optional().or(z.literal('').transform(() => undefined));

const createStoreSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug may contain lowercase letters, digits and dashes').max(60),
  phone: z.string().trim().max(30).optional(),
  whatsapp: z.string().trim().max(30).optional(),
  email: optionalEmail,
  address: z.string().trim().max(300).optional(),
  description: z.string().trim().max(1000).optional(),
  defaultCurrency: z.string().trim().length(3).toUpperCase().optional(),
  owner: z.object({
    email: optionalEmail,
    phone: z.string().trim().min(5).max(30),
    password: z.string().min(8).max(128),
    firstName: z.string().trim().max(80).optional(),
    lastName: z.string().trim().max(80).optional(),
  }),
});

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const daySchema = z.object({ closed: z.boolean(), open: timeSchema, close: timeSchema });
const openingHoursSchema = z.object({
  mon: daySchema, tue: daySchema, wed: daySchema, thu: daySchema, fri: daySchema, sat: daySchema, sun: daySchema,
}).strict();

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: optionalText(1000),
  phone: optionalText(30),
  whatsapp: optionalText(30),
  email: z.string().email().nullable().optional().or(z.literal('')),
  address: optionalText(300),
  city: optionalText(100),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  mapUrl: z.string().trim().url().max(1000).refine((value) => /^https?:\/\//i.test(value), 'Use an http(s) link').nullable().optional().or(z.literal('')),
  openingHours: openingHoursSchema.nullable().optional(),
  defaultCurrency: z.string().trim().length(3).toUpperCase().optional(),
  locale: z.string().trim().min(2).max(10).optional(),
  dir: z.enum(['rtl', 'ltr']).optional(),
}).strict();

const brandingSchema = z.object({
  logo: z.string().trim().url().max(2000).nullable().optional().or(z.literal('')),
  favicon: z.string().trim().url().max(2000).nullable().optional().or(z.literal('')),
  primaryColor: colorSchema.optional(),
  secondaryColor: colorSchema.optional(),
}).strict();

const staffSchema = z.object({
  role: z.enum(['STORE_ADMIN', 'STAFF']),
  email: optionalEmail,
  phone: z.string().trim().min(5).max(30),
  password: z.string().min(8).max(128),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
});

const listQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE']).optional(),
});

// Public: active stores a customer can register with.
router.get('/public', asyncHandler(async (_req: Request, res: Response) => {
  return success(res, await storeService.listActiveStores());
}));

// Public: storefront profile (branding, contact, location).
router.get('/:idOrSlug/info', asyncHandler(async (req: Request, res: Response) => {
  return success(res, await storeService.getPublicStore(req.params.idOrSlug));
}));

router.get('/',
  authenticate,
  requireRole('PLATFORM_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    return success(res, await storeService.listStores(listQuery.parse(req.query)));
  })
);

router.post('/',
  authenticate,
  requireRole('PLATFORM_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await storeService.createStore(createStoreSchema.parse(req.body));
    realtime.toPlatform('store:created', { id: result.store.id, name: result.store.name });
    return created(res, result);
  })
);

router.get('/:storeId',
  authenticate,
  requireRole('PLATFORM_ADMIN', ...merchantRoles),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    return success(res, await storeService.getStoreById(req.params.storeId));
  })
);

router.patch('/:storeId/status',
  authenticate,
  requireRole('PLATFORM_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { status } = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE']) }).parse(req.body);
    const store = await storeService.setStatus(req.params.storeId, status);
    realtime.toPlatform('store:updated', { id: store.id, status: store.status });
    realtime.toStore(store.id, 'store:status', { id: store.id, status: store.status });
    return success(res, store);
  })
);

router.put('/:storeId/settings',
  authenticate,
  requireRole('PLATFORM_ADMIN', ...adminRoles),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const { storeId } = req.params;
    const store = await storeService.updateSettings(storeId, settingsSchema.parse(req.body));
    realtime.toStoreAndStorefront(storeId, 'store:updated', { id: storeId, section: 'settings' });
    return success(res, store);
  })
);

router.put('/:storeId/branding',
  authenticate,
  requireRole('PLATFORM_ADMIN', ...adminRoles),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const { storeId } = req.params;
    const store = await storeService.updateBranding(storeId, brandingSchema.parse(req.body));
    realtime.toStoreAndStorefront(storeId, 'store:updated', { id: storeId, section: 'branding' });
    return success(res, store);
  })
);

router.get('/:storeId/stats',
  authenticate,
  requireRole('PLATFORM_ADMIN', ...merchantRoles),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    return success(res, await storeService.getStoreStats(req.params.storeId));
  })
);

router.get('/:storeId/staff',
  authenticate,
  requireRole('PLATFORM_ADMIN', ...adminRoles),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    return success(res, { staff: await storeService.listStaff(req.params.storeId) });
  })
);

router.post('/:storeId/staff',
  authenticate,
  requireRole('PLATFORM_ADMIN', ...adminRoles),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await storeService.createStaff(req.params.storeId, staffSchema.parse(req.body));
    return created(res, user);
  })
);

router.patch('/:storeId/staff/:userId/status',
  authenticate,
  requireRole('PLATFORM_ADMIN', ...adminRoles),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    return success(res, await storeService.setStaffStatus(req.params.storeId, req.params.userId, isActive));
  })
);

router.get('/:storeId/customers',
  authenticate,
  requireRole('PLATFORM_ADMIN', ...merchantRoles),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const query = listQuery.parse(req.query);
    return success(res, await customerService.getCustomersByStore(req.params.storeId, query.page, query.limit));
  })
);

router.post('/:storeId/join',
  authenticate,
  requireRole('CUSTOMER'),
  asyncHandler(async (req: Request, res: Response) => {
    return success(res, await storeService.joinStore(req.user!.userId, req.params.storeId));
  })
);

export default router;