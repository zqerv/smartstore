import { Router, Request, Response } from 'express';

import { z } from 'zod';

import { asyncHandler, AppError } from '../../utils/errorHandler';

import { success, created, notFound, error } from '../../utils/response';

import { orderService } from '../../services/order.service';

import { couponService } from '../../services/coupon.service';

import { deliveryService } from '../../services/delivery.service';

import { customerService } from '../../services/customer.service';

import { authenticate, requireRole, TenantIsolation } from '../../middleware/auth';

import { db } from '../../services/_db';

import { realtime } from '../../lib/realtime';

const router = Router();

// =====================
// Input Schemas
// =====================

const checkoutSchema = z.object({
  customerId: z.string().cuid(),
  storeId: z.string().cuid(),
  deliveryZoneId: z.string().cuid().optional(),
  deliveryAddress: z.string().optional(),
  deliveryNotes: z.string().optional(),
  tableId: z.string().cuid().optional(),
  couponCode: z.string().trim().length(8).optional(),
  items: z.array(z.object({
    productId: z.string().cuid(),
    variantId: z.string().cuid().optional(),
    quantity: z.number().int().min(1),
  })),
  paymentMethod: z.enum(['CASH_ON_DELIVERY', 'ONLINE_PAYMENT', 'POS']),
});

const statusSchema = z.object({
  status: z.enum([
    'PENDING',
    'CONFIRMED',
    'PREPARING',
    'READY',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED',
    'REFUNDED'
  ]),
  notes: z.string().optional(),
});

// =====================
// Get Orders
// =====================

router.get(
  '/stores/:storeId/orders',
  TenantIsolation,
  authenticate,
  requireRole('STORE_OWNER', 'STORE_ADMIN', 'STAFF', 'PLATFORM_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const orders = await orderService.getOrders({
      storeId: req.params.storeId,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
    });

    return success(res, orders);
  })
);

router.get(
  '/customers/:customerId/orders',
  authenticate,
  requireRole('CUSTOMER', 'PLATFORM_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    const customerId = req.params.customerId;

    if (!user) {
      return error(res, 'Authentication required', 401);
    }

    if (user.role === 'CUSTOMER' && user.customerId !== customerId) {
      return error(res, 'You can only view your own orders', 403);
    }

    const storeId =
      typeof req.query.storeId === 'string'
        ? req.query.storeId
        : undefined;

    const orders = await orderService.getOrders({
      customerId,
      storeId,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
    });

    return success(res, orders);
  })
);

// =====================
// Get Order by ID
// =====================

router.get(
  '/orders/:orderId',
  TenantIsolation,
  authenticate,
  requireRole(
    'CUSTOMER',
    'STORE_OWNER',
    'STORE_ADMIN',
    'STAFF',
    'PLATFORM_ADMIN'
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const order = await orderService.getOrderById(req.params.orderId);
    const user = req.user;

    if (!user) {
      return error(res, 'Authentication required', 401);
    }

    if (user.role === 'CUSTOMER' && order.customerId !== user.customerId) {
      return error(res, 'Access denied', 403);
    }

    if (
      user.role !== 'CUSTOMER' &&
      user.role !== 'PLATFORM_ADMIN' &&
      user.storeId !== order.storeId
    ) {
      const membership = await db.storeAdmin.findFirst({
        where: {
          userId: user.userId,
          storeId: order.storeId,
        },
        select: { id: true },
      });

      if (!membership) {
        return error(res, 'Access denied', 403);
      }
    }

    return success(res, order);
  })
);

// =====================
// Checkout (Place Order)
// =====================

router.post(
  '/orders/checkout',
  TenantIsolation,
  authenticate,
  requireRole('CUSTOMER'),
  asyncHandler(async (req: Request, res: Response) => {
    const orderData = checkoutSchema.parse(req.body);
    const user = req.user;

    if (!user) {
      return error(res, 'Authentication required', 401);
    }

    const { customerId, storeId, items } = orderData;

    if (customerId !== user.customerId) {
      return error(
        res,
        'You can only place orders for your own account',
        403
      );
    }

    await customerService.getCustomerById(customerId);

    const membership = await db.customerStore.findFirst({
      where: {
        userId: customerId,
        storeId,
      },
      select: { id: true },
    });

    if (!membership) {
      return error(res, 'Store access denied', 403);
    }

    const order = await orderService.createOrder({
      storeId,
      customerId,
      items,
      paymentMethod: orderData.paymentMethod,
      deliveryZoneId: orderData.deliveryZoneId,
      deliveryAddress: orderData.deliveryAddress,
      deliveryNotes: orderData.deliveryNotes,
      couponCode: orderData.couponCode,
      tableId:
        process.env.ENABLE_TABLE_ORDERING === 'true'
          ? orderData.tableId
          : undefined,
    });

    const orderSummary = {
      id: order.id,
      orderNumber: order.orderNumber,
      storeId,
      customerId,
      status: order.status,
      customerName: order.customerName,
      total: Number(order.total),
      itemCount: orderData.items.reduce((count, item) => count + item.quantity, 0),
    };

    realtime.toStoreAndStorefront(
      storeId,
      'order:created',
      orderSummary
    );

    if (customerId) {
      realtime.toCustomer(
        customerId,
        'order:created',
        orderSummary
      );
    }

    return created(res, order);
  })
);

// =====================
// Guest Checkout
// =====================

const guestCheckoutSchema = z.object({
  guestToken: z.string().regex(/^[a-f0-9]{64}$/i),
  deliveryZoneId: z.string().cuid().optional(),
  deliveryAddress: z.string().trim().min(5).max(500),
  deliveryNotes: z.string().trim().max(1000).optional(),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(5).max(30),
  requestedAt: z.string().datetime().optional(),
  couponCode: z.string().trim().length(8).optional(),
  paymentMethod: z.enum([
    'CASH_ON_DELIVERY',
    'ONLINE_PAYMENT',
    'POS'
  ]),
});

router.post(
  '/guest/checkout',
  TenantIsolation,
  asyncHandler(async (req: Request, res: Response) => {
    const {
      guestToken,
      deliveryZoneId,
      deliveryAddress,
      deliveryNotes,
      customerName,
      customerPhone,
      requestedAt,
      couponCode,
      paymentMethod,
    } = guestCheckoutSchema.parse(req.body);

    const crypto = require('crypto');

    const tokenHash = crypto
      .createHash('sha256')
      .update(guestToken)
      .digest('hex');

    const cart = await db.guestCart.findFirst({
      where: {
        tokenHash,
        checkedOutAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        items: true,
        store: true,
      },
    });

    if (!cart) {
      throw new AppError(
        'Guest cart not found or expired',
        404
      );
    }

    if (cart.items.length === 0) {
      throw new AppError('Cart is empty', 400);
    }

    if (!cart.items.every((item) => Number.isInteger(item.quantity) && item.quantity > 0)) {
      throw new AppError('Cart contains an invalid quantity', 400);
    }

    const customer = await customerService.createGuestCustomer(cart.storeId);
    const trackingToken = crypto.randomBytes(32).toString('hex');
    const orderItems = cart.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? undefined,
      quantity: item.quantity,
    }));

    const order = await orderService.createOrder({
      storeId: cart.storeId,
      customerId: customer.id,
      items: orderItems,
      paymentMethod,
      deliveryZoneId,
      deliveryAddress,
      deliveryNotes,
      customerName,
      customerPhone,
      couponCode,
      accessToken: trackingToken,
      requestedAt: requestedAt ? new Date(requestedAt) : undefined,
    });

    await db.$transaction([
      db.guestCartItem.deleteMany({
        where: {
          cartId: cart.id,
        },
      }),

      db.guestCart.update({
        where: {
          id: cart.id,
        },
        data: {
          checkedOutAt: new Date(),
        },
      }),
    ]);

    // IMPORTANT: Do NOT delete the internal guest User/Customer after creating
    // the order.
    // Order.customer uses onDelete: Cascade, so deleting the Customer can
    // cascade-delete the Order and its related OrderItems/status history.
    // Guest User/Customer records are therefore intentionally retained as
    // internal records so the guest order remains permanently valid.
    // These records do not require customer registration or login.

    const orderSummary = {
      id: order.id,
      orderNumber: order.orderNumber,
      storeId: cart.storeId,
      status: order.status,
      customerName: order.customerName,
      total: Number(order.total),
      itemCount: orderItems.reduce((count, item) => count + item.quantity, 0),
    };

    realtime.toStoreAndStorefront(
      cart.storeId,
      'order:created',
      orderSummary
    );

    return created(res, { orderNumber: order.orderNumber, trackingToken });
  })
);

// =====================
// Guest Order Tracking
// =====================

router.get(
  '/orders/track/:token',
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;

    if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
      return error(res, 'Invalid tracking token', 400);
    }

    const crypto = require('crypto');
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const order = await db.order.findFirst({
      where: {
        accessTokenHash: tokenHash,
        isGuest: true,
      },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        items: {
          include: {
            orderProduct: {
              select: {
                id: true,
                nameEn: true,
                nameAr: true,
                slug: true,
              },
            },
          },
        },
        statusHistory: true,
      },
    });

    if (!order) {
      return error(res, 'Order not found', 404);
    }

    const orderResponse = {
      orderNumber: order.orderNumber,
      storeName: order.store.name,
      storeSlug: order.store.slug,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      items: order.items.map((item) => ({
        productSlug: item.productSlug,
        productNameAr: item.productNameAr,
        productNameEn: item.productNameEn,
        mainImage: item.mainImage,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        total: Number(item.total),
      })),
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      tax: Number(order.tax),
      deliveryFee: Number(order.deliveryFee),
      total: Number(order.total),
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryAddress: order.deliveryAddress,
      deliveryNotes: order.deliveryNotes,
      requestedAt: order.requestedAt,
      createdAt: order.createdAt,
      deliveredAt: order.deliveredAt,
      statusHistory: order.statusHistory.map((entry) => ({
        status: entry.status,
        createdAt: entry.createdAt,
      })),
    };

    return success(res, orderResponse);
  })
);

// =====================
// Update Status
// =====================

router.patch(
  '/orders/:orderId/status',
  TenantIsolation,
  authenticate,
  requireRole(
    'STORE_OWNER',
    'STORE_ADMIN',
    'STAFF',
    'PLATFORM_ADMIN'
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const statusData = statusSchema.parse(req.body);

    const currentOrder =
      await orderService.getOrderById(orderId);

    const user = req.user;

    if (!user) {
      return error(res, 'Authentication required', 401);
    }

    if (
      user.role !== 'PLATFORM_ADMIN' &&
      user.storeId !== currentOrder.storeId
    ) {
      const membership = await db.storeAdmin.findFirst({
        where: {
          userId: user.userId,
          storeId: currentOrder.storeId,
        },
        select: { id: true },
      });

      if (!membership) {
        return error(res, 'Access denied', 403);
      }
    }

    const order =
      statusData.status === 'CANCELLED'
        ? await orderService.cancelOrder(
            orderId,
            statusData.notes
          )
        : await orderService.updateOrderStatus(
            orderId,
            statusData.status,
            statusData.notes
          );

    const update = {
      id: order.id,
      orderNumber: order.orderNumber,
      storeId: order.storeId,
      customerId: order.customerId,
      status: order.status,
    };

    realtime.toStore(
      order.storeId,
      'order:updated',
      update
    );

    if (order.customerId) {
      realtime.toCustomer(
        order.customerId,
        'order:updated',
        update
      );
    }

    return success(res, order);
  })
);

// =====================
// Cancel Order
// =====================

router.patch(
  '/orders/:orderId/cancel',
  TenantIsolation,
  authenticate,
  requireRole(
    'CUSTOMER',
    'STORE_OWNER',
    'STORE_ADMIN',
    'PLATFORM_ADMIN'
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.params;

    const order =
      await orderService.getOrderById(orderId);

    if (!order) {
      return notFound(res, 'Order not found');
    }

    const user = req.user;

    if (!user) {
      return error(res, 'Authentication required', 401);
    }

    if (
      user.role === 'CUSTOMER' &&
      order.customerId !== user.customerId
    ) {
      return error(
        res,
        "Cannot cancel others' order",
        403
      );
    }

    if (
      user.role !== 'CUSTOMER' &&
      user.role !== 'PLATFORM_ADMIN' &&
      user.storeId !== order.storeId
    ) {
      const membership = await db.storeAdmin.findFirst({
        where: {
          userId: user.userId,
          storeId: order.storeId,
        },
        select: { id: true },
      });

      if (!membership) {
        return error(res, 'Access denied', 403);
      }
    }

    if (order.status === 'DELIVERED') {
      return error(
        res,
        'Cannot cancel delivered orders',
        400
      );
    }

    const cancelled =
      await orderService.cancelOrder(orderId);

    const update = {
      id: cancelled.id,
      orderNumber: cancelled.orderNumber,
      storeId: cancelled.storeId,
      customerId: cancelled.customerId,
      status: cancelled.status,
    };

    realtime.toStore(
      cancelled.storeId,
      'order:updated',
      update
    );

    if (cancelled.customerId) {
      realtime.toCustomer(
        cancelled.customerId,
        'order:updated',
        update
      );
    }

    return success(res, {
      message: 'Order cancelled',
    });
  })
);

export default router;