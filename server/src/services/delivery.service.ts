import { DeliveryZone } from '@prisma/client';
import { AppError } from '../utils/errorHandler';
import { logger } from '../lib/logger';
import { db } from './_db';

type DeliveryZoneInput = {
  country?: string | null;
  city: string;
  area: string;
  district?: string | null;
  postalCode?: string | null;
  deliveryFee: number | string;
  minimumOrder: number | string;
  deliveryDays?: string | null;
  estDeliveryDays?: number | null;
  estDaysString?: string | null;
  note?: string | null;
  specialInstructions?: string | null;
  isActive?: boolean;
};

type DeliveryZoneUpdate = Partial<DeliveryZoneInput>;

function parseNonNegativeNumber(value: number | string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new AppError(`${field} must be a non-negative number`, 400);
  }
  return parsed;
}

function validateEstimatedDays(value: number | null | undefined) {
  if (
    value !== undefined &&
    value !== null &&
    (!Number.isInteger(value) || value < 1 || value > 7)
  ) {
    throw new AppError('Estimated delivery days must be an integer from 1 to 7', 400);
  }
  return value;
}

function getDeliveryDays(zone: DeliveryZone): number[] {
  const configuredDays = zone.deliveryDays
    ?.split(/[,\s]+/)
    .map(Number)
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);

  if (configuredDays?.length) return configuredDays;
  if (zone.estDeliveryDays && zone.estDeliveryDays >= 1 && zone.estDeliveryDays <= 7) {
    return [zone.estDeliveryDays];
  }
  return [1, 2, 3];
}

export class DeliveryService {
  async getDeliveryZones(storeId: string) {
    return db.deliveryZone.findMany({
      where: { storeId },
      orderBy: { deliveryFee: 'asc' },
    });
  }

  async getDeliveryZone(zoneId: string, storeId: string) {
    const zone = await db.deliveryZone.findFirst({
      where: { id: zoneId, storeId },
    });
    if (!zone) throw new AppError('Zone not found', 404);
    return zone;
  }

  async getZoneEstimate(
    _customerId: string,
    storeId: string,
    zoneId: string,
    _weight: number,
    amount: number
  ) {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new AppError('Amount must be a non-negative number', 400);
    }

    const zone = await this.getDeliveryZone(zoneId, storeId);
    if (!zone.isActive) throw new AppError('Delivery zone is not active', 404);
    if (amount < Number(zone.minimumOrder)) {
      throw new AppError('Order does not meet the delivery zone minimum', 422);
    }

    return {
      zone,
      fee: Number(zone.deliveryFee),
      deliveryDays: getDeliveryDays(zone),
    };
  }

  async createDeliveryZone(storeId: string, input: DeliveryZoneInput) {
    const city = typeof input.city === 'string' ? input.city.trim() : '';
    const area = typeof input.area === 'string' ? input.area.trim() : '';
    if (!city || !area) throw new AppError('City and area are required', 400);
    validateEstimatedDays(input.estDeliveryDays);

    const zone = await db.deliveryZone.create({
      data: {
        storeId,
        country: input.country,
        city,
        area,
        district: input.district,
        postalCode: input.postalCode,
        deliveryFee: parseNonNegativeNumber(input.deliveryFee, 'Delivery fee'),
        minimumOrder: parseNonNegativeNumber(input.minimumOrder, 'Minimum order'),
        deliveryDays: input.deliveryDays,
        estDeliveryDays: input.estDeliveryDays,
        estDaysString: input.estDaysString,
        note: input.note,
        specialInstructions: input.specialInstructions,
        isActive: input.isActive,
      },
    });

    logger.info(`Delivery zone created: ${zone.id}`);
    return zone;
  }

  async updateDeliveryZone(zoneId: string, storeId: string, input: DeliveryZoneUpdate) {
    await this.getDeliveryZone(zoneId, storeId);

    const data: DeliveryZoneUpdate = {};
    if (input.country !== undefined) data.country = input.country;
    if (input.city !== undefined) {
      data.city = input.city.trim();
      if (!data.city) throw new AppError('City cannot be empty', 400);
    }
    if (input.area !== undefined) {
      data.area = input.area.trim();
      if (!data.area) throw new AppError('Area cannot be empty', 400);
    }
    if (input.district !== undefined) data.district = input.district;
    if (input.postalCode !== undefined) data.postalCode = input.postalCode;
    if (input.deliveryFee !== undefined) {
      data.deliveryFee = parseNonNegativeNumber(input.deliveryFee, 'Delivery fee');
    }
    if (input.minimumOrder !== undefined) {
      data.minimumOrder = parseNonNegativeNumber(input.minimumOrder, 'Minimum order');
    }
    if (input.deliveryDays !== undefined) data.deliveryDays = input.deliveryDays;
    if (input.estDeliveryDays !== undefined) {
      data.estDeliveryDays = validateEstimatedDays(input.estDeliveryDays);
    }
    if (input.estDaysString !== undefined) data.estDaysString = input.estDaysString;
    if (input.note !== undefined) data.note = input.note;
    if (input.specialInstructions !== undefined) data.specialInstructions = input.specialInstructions;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const updated = await db.deliveryZone.update({
      where: { id: zoneId },
      data,
    });
    logger.info(`Delivery zone updated: ${zoneId}`);
    return updated;
  }

  async deleteDeliveryZone(zoneId: string, storeId: string) {
    await this.getDeliveryZone(zoneId, storeId);
    await db.deliveryZone.delete({ where: { id: zoneId } });
    logger.info(`Delivery zone deleted: ${zoneId}`);
  }
}

export const deliveryService = new DeliveryService();
