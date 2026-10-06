import { AppError } from '../utils/errorHandler';
import { CASH_ON_DELIVERY, isPaymentMethodAvailable } from '../lib/providers/payment';
import { logger } from '../lib/logger';
import { db as prisma } from './_db';
import { createHash } from 'crypto';

type OrderStatusValue =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

type CheckoutItem = {
  productId: string;
  variantId?: string;
  quantity: number;
};

export class OrderService {
  async getOrders({
    storeId,
    customerId,
    status,
    page = 1,
    limit = 20,
  }: {
    storeId?: string;
    customerId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const skip = (page - 1) * limit;
    const where = {
      ...(storeId ? { storeId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(status ? { status } : {}),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: { customer: true, items: true, statusHistory: true, couponUsages: true, table: { select: { id: true, number: true, label: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ]);

    return {
      orders,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getOrderById(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, items: true, statusHistory: true, couponUsages: true, store: true, table: { select: { id: true, number: true, label: true } } },
    });
    if (!order) throw new AppError('Order not found', 404);
    return order;
  }

  async getOrderByNumber(orderNumber: string) {
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: { customer: true, items: true, statusHistory: true },
    });
    if (!order) throw new AppError('Order not found', 404);
    return order;
  }

  async createOrder(input: {
    storeId: string;
    customerId: string;
    items: CheckoutItem[];
    paymentMethod: string;
    deliveryZoneId?: string;
    deliveryAddress?: string;
    deliveryNotes?: string;
    customerName?: string;
    customerPhone?: string;
    couponCode?: string;
    tableId?: string;
    accessToken?: string;
    requestedAt?: Date;
  }) {
    if (!isPaymentMethodAvailable(input.paymentMethod)) {
      throw new AppError('This payment method is unavailable: PROVIDER CONFIGURATION REQUIRED', 501);
    }
    if (input.paymentMethod !== CASH_ON_DELIVERY) {
      throw new AppError('Online payment is not implemented for this provider', 501);
    }
    if (input.items.length === 0) throw new AppError('Order must contain at least one item', 400);
    if (input.items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) {
      throw new AppError('Item quantities must be positive integers', 400);
    }

    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 11).toUpperCase()}`;

    const order = await prisma.$transaction(async (tx) => {
      const membership = await tx.customerStore.findFirst({
        where: { userId: input.customerId, storeId: input.storeId },
        select: { id: true },
      });
      if (!membership) throw new AppError('Customer does not belong to this store', 403);

      const customer = await tx.customer.findUnique({
        where: { id: input.customerId },
      });
      if (!customer) throw new AppError('Customer not found', 404);

      const productIds = [...new Set(input.items.map((item) => item.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, storeId: input.storeId, status: 'ACTIVE' },
        include: { productImages: true },
      });
      if (products.length !== productIds.length) {
        throw new AppError('One or more products are unavailable in this store', 404);
      }

      const productsById = new Map(products.map((product) => [product.id, product]));
      const preparedItems = input.items.map((item) => {
        const product = productsById.get(item.productId);
        if (!product) throw new AppError('Product not found', 404);
        return {
          item,
          product,
          unitPrice: Number(product.price),
          productNameEn: product.nameEn,
          variantName: null as string | null,
        };
      });

      let subtotal = 0;
      for (const entry of preparedItems) {
        if (entry.item.variantId) {
          const variant = await tx.productVariant.findFirst({
            where: {
              id: entry.item.variantId,
              productId: entry.product.id,
              isActive: true,
            },
          });
          if (!variant) throw new AppError('Product variant is unavailable', 404);
          entry.unitPrice = Number(variant.price);
          entry.variantName = variant.name;
          const updated = await tx.productVariant.updateMany({
            where: { id: variant.id, stock: { gte: entry.item.quantity } },
            data: { stock: { decrement: entry.item.quantity } },
          });
          if (updated.count !== 1) throw new AppError('Insufficient stock for a product variant', 409);
        } else {
          const updated = await tx.product.updateMany({
            where: {
              id: entry.product.id,
              storeId: input.storeId,
              stock: { gte: entry.item.quantity },
            },
            data: { stock: { decrement: entry.item.quantity } },
          });
          if (updated.count !== 1) throw new AppError('Insufficient product stock', 409);
        }
        subtotal += entry.unitPrice * entry.item.quantity;
      }

      if (input.tableId) {
        const table = await tx.storeTable.findFirst({
          where: { id: input.tableId, storeId: input.storeId, isActive: true },
          select: { id: true },
        });
        if (!table) throw new AppError('Table not found in this store', 404);
      }

      let deliveryFee = 0;
      if (input.deliveryZoneId) {
        const zone = await tx.deliveryZone.findFirst({
          where: { id: input.deliveryZoneId, storeId: input.storeId, isActive: true },
        });
        if (!zone) throw new AppError('Delivery zone not found', 404);
        if (subtotal < Number(zone.minimumOrder)) {
          throw new AppError('Order does not meet the delivery zone minimum', 422);
        }
        deliveryFee = Number(zone.deliveryFee);
      }

      let discount = 0;
      let promoCode: string | undefined;
      if (input.couponCode) {
        promoCode = input.couponCode.trim().toUpperCase();
        const now = new Date();
        const coupon = await tx.coupon.findFirst({
          where: {
            storeId: input.storeId,
            code: promoCode,
            status: 'ACTIVE',
          },
        });
        if (!coupon) throw new AppError('Coupon is invalid or inactive', 404);
        if ((coupon.startDate && coupon.startDate > now) || (coupon.endDate && coupon.endDate < now)) {
          throw new AppError('Coupon is not currently valid', 422);
        }
        if (subtotal < Number(coupon.minValue)) {
          throw new AppError('Order does not meet the coupon minimum', 422);
        }
        if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
          throw new AppError('Coupon usage limit has been reached', 422);
        }
        discount = coupon.type === 'PERCENTAGE'
          ? Math.min(
            subtotal * Number(coupon.discount) / 100,
            coupon.maxDiscount === null ? Number.POSITIVE_INFINITY : Number(coupon.maxDiscount)
          )
          : Math.min(subtotal, Number(coupon.discount));

        const claim = await tx.coupon.updateMany({
          where: {
            id: coupon.id,
            status: 'ACTIVE',
            ...(coupon.usageLimit !== null ? { usedCount: { lt: coupon.usageLimit } } : {}),
          },
          data: { usedCount: { increment: 1 } },
        });
        if (claim.count !== 1) throw new AppError('Coupon usage limit has been reached', 409);
      }

      const createdOrder = await tx.order.create({
        data: {
          storeId: input.storeId,
          customerId: input.customerId,
          orderNumber,
          subtotal,
          discount,
          tax: 0,
          deliveryFee,
          total: subtotal - discount + deliveryFee,
          paymentMethod: input.paymentMethod,
          customerName: input.customerName || [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.phone,
          customerPhone: input.customerPhone || customer.phone,
          customerEmail: customer.email,
          deliveryZone: input.deliveryZoneId,
          deliveryAddress: input.deliveryAddress,
          deliveryNotes: input.deliveryNotes,
          tableId: input.tableId,
          isGuest: Boolean(input.accessToken),
          userId: input.accessToken ? null : input.customerId,
          promoCode,
          promoDiscount: discount || undefined,
          ...(input.accessToken ? { accessTokenHash: createHash('sha256').update(input.accessToken).digest('hex') } : {}),
          ...(input.requestedAt && { requestedAt: input.requestedAt }),
        },
      });

      await tx.orderItem.createMany({
        data: preparedItems.map(({ item, product, unitPrice, productNameEn, variantName }) => ({
          orderId: createdOrder.id,
          orderNumber,
          productId: product.id,
          productSlug: product.slug,
          productNameAr: product.nameAr,
          productNameEn,
          mainImage: product.productImages?.url,
          variantId: item.variantId,
          variantName,
          quantity: item.quantity,
          unitPrice,
          discount: 0,
          total: unitPrice * item.quantity,
        })),
      });

      await tx.orderStatusHistory.create({
        data: { orderId: createdOrder.id, status: 'PENDING', notes: 'Order placed' },
      });

      if (promoCode) {
        const coupon = await tx.coupon.findFirstOrThrow({
          where: { storeId: input.storeId, code: promoCode },
          select: { id: true },
        });
        await tx.couponUsage.create({
          data: {
            couponId: coupon.id,
            code: promoCode,
            userId: input.customerId,
            orderId: createdOrder.id,
          },
        });
      }

      await tx.cartItem.deleteMany({
        where: { customerId: input.customerId, storeId: input.storeId },
      });

      return createdOrder;
    });

    logger.info(`Order created: ${orderNumber}`);
    return order;
  }

  async updateOrderStatus(orderId: string, status: OrderStatusValue, notes?: string) {
    const order = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({ where: { id: orderId } });
      if (!existing) throw new AppError('Order not found', 404);
      if (existing.status === 'CANCELLED' || existing.status === 'DELIVERED') {
        throw new AppError(`Cannot change status from ${existing.status}`, 409);
      }
      const allowedTransitions: Record<string, OrderStatusValue[]> = {
        PENDING: ['CONFIRMED'],
        CONFIRMED: ['PREPARING'],
        PREPARING: ['READY'],
        READY: ['OUT_FOR_DELIVERY'],
        OUT_FOR_DELIVERY: ['DELIVERED'],
      };
      if (!allowedTransitions[existing.status]?.includes(status)) {
        throw new AppError(`Cannot change order status from ${existing.status} to ${status}`, 409);
      }

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status,
          ...(status === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
        },
      });
      await tx.orderStatusHistory.create({
        data: { orderId, status, notes },
      });
      return updatedOrder;
    });
    return order;
  }

  async cancelOrder(orderId: string, reason?: string) {
    const order = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!existing) throw new AppError('Order not found', 404);
      if (existing.status === 'DELIVERED' || existing.status === 'CANCELLED') {
        throw new AppError(`Cannot cancel an order with status ${existing.status}`, 409);
      }

      for (const item of existing.items) {
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        } else {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }

      const cancelled = await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      });
      await tx.orderStatusHistory.create({
        data: { orderId, status: 'CANCELLED', notes: reason },
      });
      const usage = await tx.couponUsage.findFirst({
        where: { orderId },
        select: { id: true, couponId: true },
      });
      if (usage) {
        const released = await tx.coupon.updateMany({
          where: { id: usage.couponId, usedCount: { gt: 0 } },
          data: { usedCount: { decrement: 1 } },
        });
        if (released.count !== 1) {
          throw new AppError('Coupon usage count is inconsistent', 409);
        }
        await tx.couponUsage.update({
          where: { id: usage.id },
          data: { orderId: null },
        });
      }
      return cancelled;
    });

    logger.info(`Order cancelled: ${orderId}`);
    return order;
  }
}

export const orderService = new OrderService();
