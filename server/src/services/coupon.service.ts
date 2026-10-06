import { AppError } from '../utils/errorHandler';
import { logger } from '../lib/logger';
import { db } from './_db';

type CouponInput = {
  code: string;
  type: 'PERCENTAGE' | 'FIXED';
  value: number;
  minOrderValue?: number;
  maxUses?: number;
  description?: string;
};

export const couponService = {
  async getCoupons(storeId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { storeId };
    const [coupons, total] = await Promise.all([
      db.coupon.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.coupon.count({ where }),
    ]);
    return {
      coupons,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async getCouponByCode(code: string, storeId?: string) {
    return db.coupon.findFirst({
      where: { code: code.trim().toUpperCase(), ...(storeId ? { storeId } : {}) },
    });
  },

  async getCouponById(couponId: string) {
    const coupon = await db.coupon.findUnique({ where: { id: couponId } });
    if (!coupon) throw new AppError('Coupon not found', 404);
    return coupon;
  },

  async createCoupon(storeId: string, input: CouponInput) {
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(code)) {
      throw new AppError('Coupon code must be exactly 8 letters or digits', 400);
    }
    if (!Number.isFinite(input.value) || input.value <= 0) {
      throw new AppError('Coupon value must be positive', 400);
    }
    if (input.type === 'PERCENTAGE' && input.value > 100) {
      throw new AppError('Percentage discount cannot exceed 100', 400);
    }

    const coupon = await db.coupon.create({
      data: {
        storeId,
        code,
        type: input.type,
        discount: input.value,
        minValue: input.minOrderValue ?? 0,
        usageLimit: input.maxUses,
        description: input.description,
        status: 'ACTIVE',
      },
    });
    logger.info(`Coupon created: ${coupon.id}`);
    return coupon;
  },

  async updateCoupon(couponId: string, input: Partial<CouponInput> & { status?: string }) {
    await this.getCouponById(couponId);
    const data: {
      code?: string;
      type?: string;
      discount?: number;
      minValue?: number;
      usageLimit?: number;
      description?: string;
      status?: string;
    } = {};

    if (input.code !== undefined) data.code = input.code.trim().toUpperCase();
    if (input.type !== undefined) data.type = input.type;
    if (input.value !== undefined) data.discount = input.value;
    if (input.minOrderValue !== undefined) data.minValue = input.minOrderValue;
    if (input.maxUses !== undefined) data.usageLimit = input.maxUses;
    if (input.description !== undefined) data.description = input.description;
    if (input.status !== undefined) data.status = input.status;

    const updated = await db.coupon.update({ where: { id: couponId }, data });
    logger.info(`Coupon updated: ${couponId}`);
    return updated;
  },

  async validateCoupon(code: string, storeId?: string, orderTotal?: number) {
    const coupon = await this.getCouponByCode(code, storeId);
    if (!coupon || coupon.status !== 'ACTIVE') {
      throw new AppError('Coupon is invalid or inactive', 404);
    }

    const now = new Date();
    if ((coupon.startDate && coupon.startDate > now) || (coupon.endDate && coupon.endDate < now)) {
      throw new AppError('Coupon is not currently valid', 422);
    }
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new AppError('Coupon usage limit has been reached', 422);
    }
    if (orderTotal !== undefined && orderTotal < Number(coupon.minValue)) {
      throw new AppError('Order does not meet the coupon minimum', 422);
    }

    const discountAmount = orderTotal === undefined
      ? undefined
      : coupon.type === 'PERCENTAGE'
        ? Math.min(
          orderTotal * Number(coupon.discount) / 100,
          coupon.maxDiscount === null ? Number.POSITIVE_INFINITY : Number(coupon.maxDiscount)
        )
        : Math.min(orderTotal, Number(coupon.discount));

    return { valid: true, coupon, discountAmount };
  },

  async applyCoupon() {
    throw new AppError(
      'Coupon application is unavailable until coupon usage can be recorded per order',
      501
    );
  },
};
