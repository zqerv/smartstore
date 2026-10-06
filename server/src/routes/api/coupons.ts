import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { success, created, notFound, error } from '../../utils/response';
import { couponService } from '../../services/coupon.service';
import { authenticate, requireRole, TenantIsolation, verifyStoreOwnership } from '../../middleware/auth';
import { db } from '../../services/_db';

const router = Router();

// =====================
// Input Schemas
// =====================

const couponSchema = z.object({
  code: z.string().length(8).transform((value) => value.toUpperCase()),
  type: z.enum(['PERCENTAGE', 'FIXED']),
  value: z.number().positive(),
  minOrderValue: z.number().nonnegative().default(0),
  maxUses: z.number().int().positive().optional(),
  description: z.string().optional(),
});

// =====================
// Get Coupons
// =====================
router.get('/stores/:storeId/coupons',
  TenantIsolation,
  authenticate,
  requireRole('STORE_OWNER', 'STORE_ADMIN', 'STAFF', 'PLATFORM_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const coupons = await couponService.getCoupons(
      req.params.storeId,
      parseInt(req.query.page as string) || 1,
      parseInt(req.query.limit as string) || 20
    );
    return success(res, coupons);
  })
);

// =====================
// Get Coupon by Code
// =====================
router.get('/coupons/code/:code',
  TenantIsolation,
  asyncHandler(async (req: Request, res: Response) => {
    const coupon = await couponService.getCouponByCode(req.params.code.toUpperCase());
    if (!coupon) return notFound(res, 'Coupon not found');
    
    return success(res, coupon);
  })
);

// =====================
// Create Coupon
// =====================
router.post('/stores/:storeId/coupons',
  TenantIsolation,
  authenticate,
  requireRole('PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN', 'STAFF'),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const { storeId } = req.params;
    const coupon = await couponService.createCoupon(storeId, couponSchema.parse(req.body));
    return created(res, coupon);
  })
);

// =====================
// Update Coupon
// =====================
router.put('/coupons/:couponId',
  TenantIsolation,
  authenticate,
  requireRole('PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN'),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const updateSchema = couponSchema.partial().extend({
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    });
    const coupon = await couponService.updateCoupon(
      req.params.couponId,
      updateSchema.parse(req.body)
    );
    return success(res, coupon);
  })
);

// =====================
// Validate Coupon
// =====================
router.post('/coupons/validate',
  TenantIsolation,
  asyncHandler(async (req: Request, res: Response) => {
    const validationData = z.object({
      couponCode: z.string().length(8).transform((value) => value.toUpperCase()),
      storeId: z.string().cuid().optional(),
      orderId: z.string().cuid().optional(),
      orderTotal: z.number().positive().optional(),
    }).parse(req.body);
    
    const coupon = await couponService.validateCoupon(
      validationData.couponCode.toUpperCase(),
      validationData.storeId,
      validationData.orderTotal
    );
    
    return success(res, coupon);
  })
);

// =====================
// Apply Coupon to Order
// =====================
router.post('/coupons/apply',
  TenantIsolation,
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const input = z.object({
      couponCode: z.string().trim().length(8),
      storeId: z.string().cuid(),
      orderTotal: z.coerce.number().positive(),
    }).parse(req.body);
    const user = req.user;
    if (!user) return error(res, 'Authentication required', 401);

    if (user.role === 'CUSTOMER') {
      const membership = await db.customerStore.findFirst({
        where: { userId: user.userId, storeId: input.storeId },
        select: { id: true },
      });
      if (!membership) return error(res, 'Store access denied', 403);
    } else if (user.role !== 'PLATFORM_ADMIN' && user.storeId !== input.storeId) {
      const membership = await db.storeAdmin.findFirst({
        where: { userId: user.userId, storeId: input.storeId },
        select: { id: true },
      });
      if (!membership) return error(res, 'Store access denied', 403);
    }
    return success(res, await couponService.validateCoupon(input.couponCode, input.storeId, input.orderTotal));
  })
);

// =====================
// Delete Coupon
// =====================
router.delete('/coupons/:couponId',
  TenantIsolation,
  authenticate,
  requireRole('PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN'),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    await couponService.getCouponById(req.params.couponId);
    await couponService.updateCoupon(req.params.couponId, { status: 'INACTIVE' });
    return success(res, { message: 'Coupon removed' });
  })
);

// =====================
// Get Coupon Usage Stats
// =====================
router.get('/coupons/:couponId/usage',
  TenantIsolation,
  authenticate,
  requireRole('STORE_OWNER', 'STORE_ADMIN', 'STAFF', 'PLATFORM_ADMIN'),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const coupon = await couponService.getCouponById(req.params.couponId);
    
    return success(res, {
      totalUsed: coupon.usedCount || 0,
      maxUses: coupon.usageLimit,
      percentageUsed: coupon.usageLimit && coupon.usedCount
        ? Math.round((coupon.usedCount / coupon.usageLimit) * 100)
        : 0,
    });
  })
);

export default router;