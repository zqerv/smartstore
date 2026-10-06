import { AppError } from '../utils/errorHandler';
import { logger } from '../lib/logger';
import { db as prisma } from './_db';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

/**
 * CustomerService - Handles customer operations
 */
export class CustomerService {
  /**
   * Get customer by ID
   */
  async getCustomerById(customerId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    if (!customer) {
      throw new AppError('Customer not found', 404);
    }

    return customer;
  }

  /**
   * Get customers for a store
   */
  async getCustomersByStore(
    storeId: string,
    page: number = 1,
    limit: number = 20
  ) {
    const skip = (page - 1) * limit;

    const where = {
      user: {
        is: {
          customerStores: {
            some: { storeId },
          },
        },
      },
    };

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              avatar: true,
            },
          },
        },
        skip,
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);

    return {
      customers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Create customer from user
   */
  async createCustomerFromUser(
    userId: string,
    storeId: string
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.phone) {
      throw new AppError(
        'A phone number is required for a customer account',
        400
      );
    }

    const customer = await prisma.customer.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        phone: user.phone,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });

    const storeMembership =
      await prisma.customerStore.findFirst({
        where: {
          userId,
          storeId,
        },
        select: {
          id: true,
        },
      });

    if (!storeMembership) {
      await prisma.customerStore.create({
        data: {
          userId,
          storeId,
        },
      });
    }

    return customer;
  }

  /**
   * Update customer profile
   */
  async updateCustomerProfile(
    customerId: string,
    updateData: {
      firstName?: string | null;
      lastName?: string | null;
      phone?: string;
      email?: string | null;
      avatar?: string | null;
    }
  ) {
    const existing =
      await prisma.customer.findUnique({
        where: {
          id: customerId,
        },
      });

    if (!existing) {
      throw new AppError(
        'Customer not found',
        404
      );
    }

    const updated = await prisma.$transaction(
      async (tx) => {
        const profileFields = {
          ...(updateData.firstName !== undefined
            ? { firstName: updateData.firstName }
            : {}),
          ...(updateData.lastName !== undefined
            ? { lastName: updateData.lastName }
            : {}),
          ...(updateData.phone !== undefined
            ? { phone: updateData.phone }
            : {}),
          ...(updateData.email !== undefined
            ? { email: updateData.email }
            : {}),
          ...(updateData.avatar !== undefined
            ? { avatar: updateData.avatar }
            : {}),
        };

        await tx.user.update({
          where: {
            id: customerId,
          },
          data: profileFields,
        });

        return tx.customer.update({
          where: {
            id: customerId,
          },
          data: profileFields,
        });
      }
    );

    logger.info(
      `Customer profile updated: ${customerId}`
    );

    return updated;
  }

  /**
   * Add address
   */
  async updateAddress(
    customerId: string,
    storeId: string,
    addressData: {
      id?: string;
      customerName: string;
      phone: string;
      addressLine1: string;
      addressLine2?: string;
      city: string;
      district?: string;
      building?: string;
      floor?: string;
      apartment?: string;
      postalCode?: string;
      isDefault?: boolean;
    }
  ) {
    const data = {
      customerName: addressData.customerName,
      phone: addressData.phone,
      addressLine1: addressData.addressLine1,
      addressLine2: addressData.addressLine2,
      city: addressData.city,
      district: addressData.district,
      building: addressData.building,
      floor: addressData.floor,
      apartment: addressData.apartment,
      postalCode: addressData.postalCode,
      isDefault: addressData.isDefault,
    };

    return prisma.$transaction(async (tx) => {
      if (addressData.isDefault) {
        await tx.customerAddress.updateMany({
          where: {
            customerId,
            storeId,
          },
          data: {
            isDefault: false,
          },
        });
      }

      if (addressData.id) {
        const existing =
          await tx.customerAddress.findFirst({
            where: {
              id: addressData.id,
              customerId,
              storeId,
            },
            select: {
              id: true,
            },
          });

        if (!existing) {
          throw new AppError(
            'Customer address not found',
            404
          );
        }

        return tx.customerAddress.update({
          where: {
            id: existing.id,
          },
          data,
        });
      }

      return tx.customerAddress.create({
        data: {
          ...data,
          customerId,
          storeId,
        },
      });
    });
  }

  /**
   * Get addresses
   */
  async getAddresses(
    customerId: string,
    storeId: string
  ) {
    return prisma.customerAddress.findMany({
      where: {
        customerId,
        storeId,
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async deleteAddress(
    customerId: string,
    storeId: string,
    addressId: string
  ) {
    const existing =
      await prisma.customerAddress.findFirst({
        where: {
          id: addressId,
          customerId,
          storeId,
        },
        select: {
          id: true,
        },
      });

    if (!existing) {
      throw new AppError(
        'Customer address not found',
        404
      );
    }

    await prisma.customerAddress.delete({
      where: {
        id: addressId,
      },
    });
  }

  /**
   * Create a guest customer for checkout
   */
  async createGuestCustomer(storeId: string) {
    const guestPhone = `GUEST_${Date.now()}_${randomBytes(8).toString('hex')}`;
    const guestPassword = await bcrypt.hash(randomBytes(32).toString('hex'), 12);

    const guestUser = await prisma.user.create({
      data: {
        email: null,
        phone: guestPhone,
        password: guestPassword,
        firstName: 'Guest',
        lastName: 'Customer',
        role: 'CUSTOMER',
        isActive: false,
      },
    });

    const customer =
      await prisma.customer.upsert({
        where: {
          id: guestUser.id,
        },
        update: {},
        create: {
          id: guestUser.id,
          phone: guestPhone,
        },
      });

    const membership =
      await prisma.customerStore.findFirst({
        where: {
          userId: guestUser.id,
          storeId,
        },
        select: {
          id: true,
        },
      });

    if (!membership) {
      await prisma.customerStore.create({
        data: {
          userId: guestUser.id,
          storeId,
        },
      });
    }

    return customer;
  }
}

export const customerService =
  new CustomerService();