import { Prisma, UserRole } from '@prisma/client';
import { AppError } from '../utils/errorHandler';
import { db } from './_db';

export type SystemSettings = {
  platformName: string;
  supportEmail: string;
  supportPhone: string;
  defaultLocale: 'ar-SA' | 'en-US';
  defaultCurrency: string;
  allowCustomerRegistration: boolean;
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  platformName: 'SmartStore',
  supportEmail: '',
  supportPhone: '',
  defaultLocale: 'ar-SA',
  defaultCurrency: 'IQD',
  allowCustomerRegistration: true,
};

const SETTINGS_KEY = 'system';

const userSelect = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  role: true,
  storeId: true,
  isActive: true,
  isEmailVerified: true,
  isPhoneVerified: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export const platformService = {
  async getSettings(): Promise<SystemSettings> {
    const row = await db.platformSetting.findUnique({ where: { key: SETTINGS_KEY } });
    return { ...DEFAULT_SYSTEM_SETTINGS, ...((row?.value as Partial<SystemSettings> | null) ?? {}) };
  },

  async updateSettings(input: Partial<SystemSettings>, updatedBy: string) {
    const next = { ...(await this.getSettings()), ...input };
    await db.platformSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value: next, updatedBy },
      update: { value: next, updatedBy },
    });
    return next;
  },

  async listUsers(params: { search?: string; role?: string; status?: string; storeId?: string; page: number; limit: number }) {
    const { search, role, status, storeId, page, limit } = params;
    const where: Prisma.UserWhereInput = {
      ...(role ? { role: role as UserRole } : {}),
      ...(status ? { isActive: status === 'ACTIVE' } : {}),
      ...(storeId ? { storeId } : {}),
      ...(search ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const [users, total] = await Promise.all([
      db.user.findMany({ where, select: userSelect, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      db.user.count({ where }),
    ]);
    const storeIds = [...new Set(users.map((user) => user.storeId).filter((id): id is string => !!id))];
    const stores = storeIds.length ? await db.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } }) : [];
    const storeNames = new Map(stores.map((store) => [store.id, store.name]));
    return {
      users: users.map((user) => ({ ...user, storeName: user.storeId ? storeNames.get(user.storeId) ?? null : null })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async getUser(userId: string) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { ...userSelect, lastSeenAt: true } });
    if (!user) throw new AppError('User not found', 404);
    const [store, orders, memberships] = await Promise.all([
      user.storeId ? db.store.findUnique({ where: { id: user.storeId }, select: { id: true, name: true, slug: true, status: true } }) : null,
      db.order.count({ where: { customerId: user.id } }),
      db.customerStore.findMany({ where: { userId: user.id }, select: { store: { select: { id: true, name: true } } } }),
    ]);
    return { ...user, store, orderCount: orders, joinedStores: memberships.map((membership) => membership.store) };
  },

  async setUserActive(actorId: string, userId: string, isActive: boolean) {
    const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!target) throw new AppError('User not found', 404);
    if (target.id === actorId) throw new AppError('You cannot change your own account status', 409);
    if (target.role === UserRole.PLATFORM_ADMIN) throw new AppError('Platform administrator accounts cannot be changed here', 403);
    return db.user.update({
      where: { id: userId },
      data: { isActive, ...(isActive ? {} : { tokenVersion: { increment: 1 } }) },
      select: userSelect,
    });
  },

  async revokeSessions(actorId: string, userId: string) {
    const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!target) throw new AppError('User not found', 404);
    if (target.role === UserRole.PLATFORM_ADMIN && target.id !== actorId) {
      throw new AppError('Platform administrator accounts cannot be changed here', 403);
    }
    await db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  },
};
