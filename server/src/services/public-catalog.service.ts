import { Prisma } from '@prisma/client';
import { db } from './_db';
import { storeService } from './store.service';
import { AppError } from '../utils/errorHandler';

const publicProductSelect = {
  id: true, storeId: true, categoryId: true, slug: true,
  nameAr: true, nameEn: true, descriptionAr: true, descriptionEn: true,
  price: true, compareAtPrice: true, stock: true, status: true, sku: true,
  isFeatured: true, category: true, productImages: true,
  variants: { where: { isActive: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ProductSelect;

export const publicCatalogService = {
  async getProducts(idOrSlug: string, query: {
    page?: number; limit?: number; search?: string; categoryId?: string;
  }) {
    const store = await storeService.getPublicStore(idOrSlug);
    const { page = 1, limit = 30, search, categoryId } = query;
    const where: Prisma.ProductWhereInput = {
      storeId: store.id,
      status: 'ACTIVE',
      category: { storeId: store.id, isActive: true },
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { OR: [
        { nameAr: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    };
    const [products, total] = await Promise.all([
      db.product.findMany({
        where, select: publicProductSelect, skip: (page - 1) * limit, take: limit,
        orderBy: [{ isFeatured: 'desc' }, { slug: 'asc' }],
      }),
      db.product.count({ where }),
    ]);
    return { products, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  },

  async getProduct(idOrSlug: string, productId: string) {
    const store = await storeService.getPublicStore(idOrSlug);
    const product = await db.product.findFirst({
      where: {
        id: productId, storeId: store.id, status: 'ACTIVE',
        category: { storeId: store.id, isActive: true },
      },
      select: publicProductSelect,
    });
    if (!product) throw new AppError('Product not found in this store', 404);
    return product;
  },

  async getCategories(idOrSlug: string) {
    const store = await storeService.getPublicStore(idOrSlug);
    const categories = await db.category.findMany({
      where: { storeId: store.id, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
    });
    return { categories };
  },
};
