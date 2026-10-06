// store.model.ts - Store model for layer separation
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * StoreModel - Provides pure business logic for store operations
 * No direct HTTP request handling or response formatting
 */

export class StoreModel {
  /**
   * Get store by ID
   */
  static async getById(storeId: string) {
    return await prisma.store.findUnique({
      where: { id: storeId },
      select: {
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
        status: true,
        defaultCurrency: true,
        locale: true,
        dir: true,
        description: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * List stores with pagination
   */
  static async list(params: { page?: number; limit?: number; status?: string } = {}) {
    const page = Math.max(1, (params.page || 1));
    const limit = Math.min(100, Math.max(1, (params.limit || 20)));
    const skip = (page - 1) * limit;

    const where = params.status
      ? { status: params.status.toUpperCase() }
      : {};

    const [stores, total] = await Promise.all([
      prisma.store.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          defaultCurrency: true,
          locale: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.store.count({ where }),
    ]);

    return {
      stores,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get store statistics (platform admin only)
   */
  static async getStats(storeId: string) {
    const [
      productCount,
      categoryCount,
      orderCount,
      customerCount,
    ] = await Promise.all([
      prisma.product.count({ where: { storeId } }),
      prisma.category.count({ where: { storeId } }),
      prisma.order.count({ where: { storeId } }),
      prisma.customerStore.count({ where: { storeId } }),
    ]);

    return {
      productCount,
      categoryCount,
      orderCount,
      customerCount,
    };
  }

  /**
   * Toggle store status
   */
  static async toggleStatus(storeId: string) {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { status: true },
    });

    if (!store) {
      return null;
    }

    const newStatus = store.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await prisma.store.update({
      where: { id: storeId },
      data: { status: newStatus },
    });

    return { success: true, status: newStatus };
  }

  /**
   * Get all stores for platform admin
   */
  static async listAll(params: { page?: number; limit?: number; status?: string } = {}) {
    return this.list(params);
  }
}

export default StoreModel;