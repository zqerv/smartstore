import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { success, created, notFound, error } from '../../utils/response';
import { deliveryService } from '../../services/delivery.service';
import { db } from '../../services/_db';
import { authenticate, requireRole, TenantIsolation } from '../../middleware/auth';

const router = Router();

const zoneSchema = z.object({
  country: z.string().optional(),
  city: z.string().min(2),
  area: z.string().min(1),
  district: z.string().optional(),
  postalCode: z.string().optional(),
  deliveryFee: z.coerce.number().nonnegative(),
  minimumOrder: z.coerce.number().nonnegative(),
  deliveryDays: z.string().optional(),
  estDeliveryDays: z.number().int().min(1).max(7).nullable().optional(),
  estDaysString: z.string().optional(),
  note: z.string().optional(),
  specialInstructions: z.string().optional(),
  isActive: z.boolean().optional(),
});

function getStoreId(
  req: Request,
  res: Response,
  allowCustomer = false
): string | null {
  const user = req.user;
  const requestedStoreId =
    req.params.storeId ??
    (user?.role === 'PLATFORM_ADMIN'
      ? req.query.storeId ?? req.body?.storeId
      : user?.storeId);

  if (typeof requestedStoreId !== 'string' || !requestedStoreId) {
    error(res, 'Store context is required', 400);
    return null;
  }

  if (
    user?.role === 'CUSTOMER'
      ? !allowCustomer || !req.params.storeId
      : user?.role !== 'PLATFORM_ADMIN' &&
        user?.storeId !== requestedStoreId
  ) {
    error(res, 'Access denied', 403);
    return null;
  }

  return requestedStoreId;
}

router.get(
  '/stores/:storeId/zones',
  TenantIsolation,
  asyncHandler(async (req: Request, res: Response) => {
    const storeId = z.string().cuid().parse(req.params.storeId);
    const store = await db.store.findFirst({
      where: { id: storeId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!store) return notFound(res, 'Store not found');

    const zones = await deliveryService.getDeliveryZones(storeId);

    const visibleZones =
      !req.user || req.user.role === 'CUSTOMER'
        ? zones.filter((zone) => zone.isActive)
        : zones;

    const page = Number(req.query.page);

    if (Number.isInteger(page) && page > 0) {
      const limit = Math.min(
        Math.max(Number(req.query.limit) || 10, 1),
        100
      );

      const total = visibleZones.length;

      return success(res, {
        zones: visibleZones.slice(
          (page - 1) * limit,
          page * limit
        ),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }

    return success(res, visibleZones);
  })
);

router.get(
  '/orders/:orderId/estimate',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const order = await db.order.findUnique({
      where: { id: req.params.orderId },
    });

    if (!order) {
      return notFound(res, 'Order not found');
    }

    const user = req.user;

    if (!user) {
      return error(res, 'Authentication required', 401);
    }

    if (
      user.role !== 'PLATFORM_ADMIN' &&
      (user.role === 'CUSTOMER'
        ? order.customerId !== user.userId
        : order.storeId !== user.storeId)
    ) {
      return error(res, 'Access denied', 403);
    }

    if (!order.deliveryZone) {
      return notFound(
        res,
        'Order has no delivery zone'
      );
    }

    if (!order.customerId) {
      return error(
        res,
        'Order has no customer information for delivery estimate',
        400
      );
    }

    const estimate = await deliveryService.getZoneEstimate(
      order.customerId,
      order.storeId,
      order.deliveryZone,
      0,
      Number(order.total)
    );

    return success(res, estimate);
  })
);

router.post(
  '/stores/:storeId/zones',
  authenticate,
  requireRole('STORE_OWNER', 'STORE_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const storeId = getStoreId(req, res);

    if (!storeId) return;

    const input = zoneSchema.parse(req.body);

    const zone = await deliveryService.createDeliveryZone(
      storeId,
      input
    );

    return created(res, zone);
  })
);

router.put(
  '/zones/:zoneId',
  authenticate,
  requireRole(
    'STORE_OWNER',
    'STORE_ADMIN',
    'PLATFORM_ADMIN'
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const storeId = getStoreId(req, res);

    if (!storeId) return;

    const input = zoneSchema.partial().parse(req.body);

    if (Object.keys(input).length === 0) {
      return error(
        res,
        'At least one zone field is required',
        400
      );
    }

    const updated =
      await deliveryService.updateDeliveryZone(
        req.params.zoneId,
        storeId,
        input
      );

    return success(res, updated);
  })
);

router.delete(
  '/zones/:zoneId',
  authenticate,
  requireRole(
    'STORE_OWNER',
    'STORE_ADMIN',
    'PLATFORM_ADMIN'
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const storeId = getStoreId(req, res);

    if (!storeId) return;

    await deliveryService.deleteDeliveryZone(
      req.params.zoneId,
      storeId
    );

    return success(res, {
      message: 'Delivery zone removed',
    });
  })
);

router.post(
  '/stores/:storeId/calculate-fee',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const storeId = getStoreId(req, res, true);

    if (!storeId) return;

    const user = req.user;

    if (!user) {
      return error(res, 'Authentication required', 401);
    }

    const input = z
      .object({
        weight: z.number().min(0),
        amount: z.number().nonnegative(),
        city: z.string().min(1),
        area: z.string().optional(),
        state: z.string().optional(),
      })
      .parse(req.body);

    const customerStore =
      await db.customerStore.findFirst({
        where: {
          userId: user.userId,
          storeId,
        },
      });

    if (
      !customerStore &&
      user.role !== 'PLATFORM_ADMIN'
    ) {
      return error(
        res,
        'You can only calculate delivery for a store you belong to',
        403
      );
    }

    const requestedArea =
      input.area ?? input.state;

    const zones =
      await deliveryService.getDeliveryZones(
        storeId
      );

    const matchingZones = zones
      .filter(
        (zone) =>
          zone.isActive &&
          zone.city.toLocaleLowerCase() ===
            input.city.toLocaleLowerCase() &&
          (!requestedArea ||
            zone.area.toLocaleLowerCase() ===
              requestedArea.toLocaleLowerCase()) &&
          input.amount >=
            Number(zone.minimumOrder)
      )
      .sort(
        (left, right) =>
          Number(left.deliveryFee) -
          Number(right.deliveryFee)
      );

    const zone = matchingZones[0];

    if (!zone) {
      return notFound(
        res,
        'No delivery zone covers this order and address'
      );
    }

    const estimate =
      await deliveryService.getZoneEstimate(
        user.userId,
        storeId,
        zone.id,
        input.weight,
        input.amount
      );

    return success(res, {
      ...estimate,
      zones: matchingZones,
    });
  })
);

export default router;