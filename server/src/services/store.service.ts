import bcrypt from 'bcryptjs';
import { Prisma, UserRole } from '@prisma/client';
import { AppError } from '../utils/errorHandler';
import { logger } from '../lib/logger';
import { db } from './_db';

const SALT_ROUNDS = 12;

const publicStoreSelect = {
  id: true,
  name: true,
  slug: true,
  logo: true,
  favicon: true,
  primaryColor: true,
  secondaryColor: true,
  phone: true,
  whatsapp: true,
  email: true,
  address: true,
  city: true,
  latitude: true,
  longitude: true,
  mapUrl: true,
  openingHours: true,
  defaultCurrency: true,
  locale: true,
  dir: true,
  description: true,
  status: true,
} satisfies Prisma.StoreSelect;

export type StoreSettingsInput = {
  name?: string;
  description?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  mapUrl?: string | null;
  openingHours?: Record<string, { closed: boolean; open: string; close: string }> | null;
  defaultCurrency?: string;
  locale?: string;
  dir?: 'rtl' | 'ltr';
};

export type StoreBrandingInput = {
  logo?: string | null;
  favicon?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
};

export type CreateStoreInput = {
  name: string;
  slug: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  description?: string;
  defaultCurrency?: string;
  owner: {
    email?: string;
    phone: string;
    password: string;
    firstName?: string;
    lastName?: string;
  };
};

const emptyToNull = (value: string | null | undefined) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

function pagination(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

export const storeService = {
  async listActiveStores() {
    return db.store.findMany({
      where: { status: 'ACTIVE' },
      select: publicStoreSelect,
      orderBy: { name: 'asc' },
    });
  },

  async getPublicStore(idOrSlug: string) {
    const store = await db.store.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], status: 'ACTIVE' },
      select: publicStoreSelect,
    });
    if (!store) throw new AppError('Store not found', 404);
    return store;
  },

  async getStoreById(storeId: string) {
    const store = await db.store.findUnique({ where: { id: storeId } });
    if (!store) throw new AppError('Store not found', 404);
    return store;
  },

  async listStores(params: { search?: string; status?: string; page?: number; limit?: number }) {
    const { search, status, page = 1, limit = 20 } = params;
    const where: Prisma.StoreWhereInput = {
      ...(status ? { status } : {}),
      ...(search
        ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
        : {}),
    };
    const [stores, total] = await Promise.all([
      db.store.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { products: true, orders: true, customerStores: true } },
        },
      }),
      db.store.count({ where }),
    ]);
    return { stores, pagination: pagination(page, limit, total) };
  },

  async createStore(input: CreateStoreInput) {
    const email = input.owner.email?.trim().toLowerCase() || undefined;
    const phone = input.owner.phone.trim();
    const password = await bcrypt.hash(input.owner.password, SALT_ROUNDS);

    try {
      const result = await db.$transaction(async (tx) => {
        const store = await tx.store.create({
          data: {
            name: input.name.trim(),
            slug: input.slug,
            phone: emptyToNull(input.phone) ?? undefined,
            whatsapp: emptyToNull(input.whatsapp) ?? undefined,
            email: emptyToNull(input.email?.toLowerCase()) ?? undefined,
            address: emptyToNull(input.address) ?? undefined,
            description: emptyToNull(input.description) ?? undefined,
            defaultCurrency: input.defaultCurrency,
          },
        });
        const owner = await tx.user.create({
          data: {
            email,
            phone,
            password,
            firstName: input.owner.firstName?.trim(),
            lastName: input.owner.lastName?.trim(),
            role: UserRole.STORE_OWNER,
            storeId: store.id,
          },
          select: { id: true, email: true, phone: true, firstName: true, lastName: true, role: true, storeId: true },
        });
        await tx.storeAdmin.create({
          data: { userId: owner.id, storeId: store.id, permissionLevel: 'OWNER' },
        });
        return { store, owner };
      });
      logger.info(`Store created: ${result.store.id}`);
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('A store or user with this slug, email, or phone already exists', 409);
      }
      throw error;
    }
  },

  async updateSettings(storeId: string, input: StoreSettingsInput) {
    await this.getStoreById(storeId);
    const data: Prisma.StoreUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = emptyToNull(input.description);
    if (input.phone !== undefined) data.phone = emptyToNull(input.phone);
    if (input.whatsapp !== undefined) data.whatsapp = emptyToNull(input.whatsapp);
    if (input.email !== undefined) data.email = emptyToNull(input.email?.toLowerCase());
    if (input.address !== undefined) data.address = emptyToNull(input.address);
    if (input.city !== undefined) data.city = emptyToNull(input.city);
    if (input.latitude !== undefined) data.latitude = input.latitude;
    if (input.longitude !== undefined) data.longitude = input.longitude;
    if (input.mapUrl !== undefined) data.mapUrl = emptyToNull(input.mapUrl);
    if (input.openingHours !== undefined) data.openingHours = input.openingHours === null ? Prisma.DbNull : input.openingHours;
    if (input.defaultCurrency !== undefined) data.defaultCurrency = input.defaultCurrency;
    if (input.locale !== undefined) data.locale = input.locale;
    if (input.dir !== undefined) data.dir = input.dir;

    try {
      return await db.store.update({ where: { id: storeId }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('Another store already uses this email', 409);
      }
      throw error;
    }
  },

  async updateBranding(storeId: string, input: StoreBrandingInput) {
    await this.getStoreById(storeId);
    const data: Prisma.StoreUpdateInput = {};
    if (input.logo !== undefined) data.logo = emptyToNull(input.logo);
    if (input.favicon !== undefined) data.favicon = emptyToNull(input.favicon);
    if (input.primaryColor !== undefined) data.primaryColor = input.primaryColor;
    if (input.secondaryColor !== undefined) data.secondaryColor = input.secondaryColor;
    return db.store.update({ where: { id: storeId }, data });
  },

  async setStatus(storeId: string, status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE') {
    await this.getStoreById(storeId);
    return db.store.update({ where: { id: storeId }, data: { status } });
  },

  async getStoreStats(storeId: string) {
    const [
      products,
      activeProducts,
      categories,
      customers,
      orders,
      pendingOrders,
      lowStock,
      revenue,
      byStatus,
      recentOrders,
    ] = await Promise.all([
      db.product.count({ where: { storeId } }),
      db.product.count({ where: { storeId, status: 'ACTIVE' } }),
      db.category.count({ where: { storeId, isActive: true } }),
      db.customerStore.count({ where: { storeId } }),
      db.order.count({ where: { storeId } }),
      db.order.count({ where: { storeId, status: 'PENDING' } }),
      db.product.count({ where: { storeId, status: 'ACTIVE', stock: { lte: 5 } } }),
      db.order.aggregate({
        where: { storeId, status: { notIn: ['CANCELLED', 'REFUNDED'] } },
        _sum: { total: true },
      }),
      db.order.groupBy({ by: ['status'], where: { storeId }, _count: true }),
      db.order.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, orderNumber: true, status: true, total: true, customerName: true, createdAt: true },
      }),
    ]);

    return {
      products,
      activeProducts,
      categories,
      customers,
      orders,
      pendingOrders,
      lowStock,
      revenue: Number(revenue._sum.total ?? 0),
      ordersByStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count])),
      recentOrders,
    };
  },

  async getPlatformStats() {
    const [stores, activeStores, usersByRole, orders, revenue, recentStores] = await Promise.all([
      db.store.count(),
      db.store.count({ where: { status: 'ACTIVE' } }),
      db.user.groupBy({ by: ['role'], _count: true }),
      db.order.count(),
      db.order.aggregate({
        where: { status: { notIn: ['CANCELLED', 'REFUNDED'] } },
        _sum: { total: true },
      }),
      db.store.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, slug: true, status: true, createdAt: true },
      }),
    ]);
    return {
      stores,
      activeStores,
      users: Object.fromEntries(usersByRole.map((row) => [row.role, row._count])),
      orders,
      revenue: Number(revenue._sum.total ?? 0),
      recentStores,
    };
  },

  async listStaff(storeId: string) {
    return db.user.findMany({
      where: { storeId, role: { in: [UserRole.STORE_OWNER, UserRole.STORE_ADMIN, UserRole.STAFF] } },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  async setStaffStatus(storeId: string, userId: string, isActive: boolean) {
    const staff = await db.user.findFirst({
      where: {
        id: userId,
        storeId,
        role: { in: [UserRole.STORE_ADMIN, UserRole.STAFF] },
      },
      select: { id: true },
    });
    if (!staff) throw new AppError('Store staff member not found', 404);
    return db.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, email: true, phone: true, role: true, isActive: true },
    });
  },

  // The users table is unique on (role, storeId), so a store has at most one user per role.
  async createStaff(storeId: string, input: {
    role: 'STORE_ADMIN' | 'STAFF';
    email?: string;
    phone: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) {
    await this.getStoreById(storeId);
    const existingRole = await db.user.findFirst({ where: { storeId, role: input.role }, select: { id: true } });
    if (existingRole) {
      throw new AppError(`This store already has a ${input.role} account`, 409);
    }

    const password = await bcrypt.hash(input.password, SALT_ROUNDS);
    try {
      return await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email?.trim().toLowerCase() || undefined,
            phone: input.phone.trim(),
            password,
            firstName: input.firstName?.trim(),
            lastName: input.lastName?.trim(),
            role: input.role,
            storeId,
          },
          select: { id: true, email: true, phone: true, firstName: true, lastName: true, role: true, isActive: true },
        });
        await tx.storeAdmin.create({
          data: {
            userId: user.id,
            storeId,
            permissionLevel: input.role === 'STORE_ADMIN' ? 'ADMIN' : 'STAFF',
          },
        });
        return user;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('A user with this email or phone already exists', 409);
      }
      throw error;
    }
  },

  async joinStore(userId: string, storeId: string) {
    const store = await db.store.findFirst({ where: { id: storeId, status: 'ACTIVE' }, select: { id: true } });
    if (!store) throw new AppError('Store not found or inactive', 404);
    const existing = await db.customerStore.findFirst({ where: { userId, storeId }, select: { id: true } });
    if (!existing) await db.customerStore.create({ data: { userId, storeId } });
    return { joined: true };
  },
};
