import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { customerService } from '../../services/customer.service';
import { db } from '../../services/_db';
import { asyncHandler } from '../../utils/errorHandler';
import { created, error, success } from '../../utils/response';

const router = Router();

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).nullable().optional(),
  lastName: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().min(5).max(30).optional(),
  email: z.string().email().nullable().optional(),
  avatar: z.string().url().nullable().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, 'At least one profile field is required');

const addressSchema = z.object({
  storeId: z.string().cuid(),
  customerName: z.string().trim().min(1).max(160),
  phone: z.string().trim().min(5).max(30),
  addressLine1: z.string().trim().min(3).max(250),
  addressLine2: z.string().trim().max(250).optional(),
  city: z.string().trim().min(1).max(100),
  district: z.string().trim().max(100).optional(),
  building: z.string().trim().max(60).optional(),
  floor: z.string().trim().max(30).optional(),
  apartment: z.string().trim().max(30).optional(),
  postalCode: z.string().trim().max(30).optional(),
  isDefault: z.boolean().optional(),
}).strict();

async function authorizeCustomer(
  req: Request,
  res: Response,
  customerId: string,
  storeId?: string,
): Promise<boolean> {
  const user = req.user;
  if (!user) {
    error(res, 'Authentication required', 401);
    return false;
  }
  if (user.role === 'PLATFORM_ADMIN') return true;
  if (user.role !== 'CUSTOMER' || user.customerId !== customerId) {
    error(res, 'You can only manage your own customer account', 403);
    return false;
  }
  if (storeId) {
    const membership = await db.customerStore.findFirst({
      where: { userId: customerId, storeId },
      select: { id: true },
    });
    if (!membership) {
      error(res, 'Store access denied', 403);
      return false;
    }
  }
  return true;
}

router.get('/:customerId/profile',
  authenticate,
  requireRole('CUSTOMER', 'PLATFORM_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!await authorizeCustomer(req, res, req.params.customerId)) return;
    return success(res, await customerService.getCustomerById(req.params.customerId));
  })
);

router.patch('/:customerId/profile',
  authenticate,
  requireRole('CUSTOMER', 'PLATFORM_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!await authorizeCustomer(req, res, req.params.customerId)) return;
    return success(res, await customerService.updateCustomerProfile(
      req.params.customerId,
      profileSchema.parse(req.body),
    ));
  })
);

router.get('/:customerId/addresses',
  authenticate,
  requireRole('CUSTOMER', 'PLATFORM_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const storeId = z.string().cuid().parse(req.query.storeId);
    if (!await authorizeCustomer(req, res, req.params.customerId, storeId)) return;
    return success(res, await customerService.getAddresses(req.params.customerId, storeId));
  })
);

router.post('/:customerId/addresses',
  authenticate,
  requireRole('CUSTOMER', 'PLATFORM_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const input = addressSchema.parse(req.body);
    if (!await authorizeCustomer(req, res, req.params.customerId, input.storeId)) return;
    return created(res, await customerService.updateAddress(req.params.customerId, input.storeId, input));
  })
);

router.put('/:customerId/addresses/:addressId',
  authenticate,
  requireRole('CUSTOMER', 'PLATFORM_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const input = addressSchema.parse(req.body);
    if (!await authorizeCustomer(req, res, req.params.customerId, input.storeId)) return;
    return success(res, await customerService.updateAddress(
      req.params.customerId,
      input.storeId,
      { ...input, id: req.params.addressId },
    ));
  })
);

router.delete('/:customerId/addresses/:addressId',
  authenticate,
  requireRole('CUSTOMER', 'PLATFORM_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const storeId = z.string().cuid().parse(req.query.storeId);
    if (!await authorizeCustomer(req, res, req.params.customerId, storeId)) return;
    await customerService.deleteAddress(req.params.customerId, storeId, req.params.addressId);
    return success(res, { deleted: true });
  })
);

export default router;
