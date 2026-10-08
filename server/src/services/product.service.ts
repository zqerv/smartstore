import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errorHandler';
import { logger } from '../lib/logger';
import { db as prisma } from './_db';

export interface ProductQuery {
  storeId?: string;
  categoryId?: string;
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export class ProductService {
  async getProducts(query: ProductQuery) {
    const { storeId, categoryId, search, status = 'ACTIVE', page = 1, limit = 20 } = query;
    if (!storeId) throw new AppError('Store ID is required to list products', 400);
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = { storeId };
    if (status !== 'ALL') where.status = status;
    if (search) {
      where.OR = [
        { nameAr: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (categoryId) {
      where.categoryId = categoryId;
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        include: {
          category: true,
          productImages: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.count({ where }),
    ]);

    return { products, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getProductById(productId: string) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: true,
        productImages: true,
        variants: { where: { isActive: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!product) throw new AppError('Product not found', 404);
    return product;
  }

  async createProduct(storeId: string, {
    categoryId,
    nameAr,
    nameEn,
    descriptionAr,
    descriptionEn,
    slug,
    type,
    price,
    compareAtPrice,
    stock,
    quantity,
    sku,
  }: {
    categoryId: string;
    nameAr: string;
    nameEn?: string;
    descriptionAr?: string | null;
    descriptionEn?: string | null;
    slug?: string;
    type?: 'SIMPLE' | 'VARIABLE';
    price: number | string;
    compareAtPrice?: number | string | null;
    stock?: number | string;
    quantity?: number | string;
    sku?: string;
  }) {
    const slugSource = slug || nameEn;
    const slugValue = slugSource
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const priceValue = Number(price);
    const stockValue = Number(stock ?? quantity ?? 0);
    if (!slugValue) throw new AppError('An English name or slug is required', 400);
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      throw new AppError('Product price must be a non-negative number', 400);
    }
    if (!Number.isInteger(stockValue) || stockValue < 0) {
      throw new AppError('Product stock must be a non-negative integer', 400);
    }

    const category = await prisma.category.findFirst({
      where: { id: categoryId, storeId },
      select: { id: true },
    });
    if (!category) throw new AppError('Category not found in this store', 404);

    const existingWithSlug = await prisma.product.findFirst({
      where: { storeId, slug: slugValue },
    });

    if (existingWithSlug) {
      throw new AppError('Product slug already exists', 409);
    }

    const product = await prisma.product.create({
      data: {
        storeId,
        categoryId,
        nameAr,
        nameEn,
        descriptionAr,
        descriptionEn,
        slug: slugValue,
        type,
        price: priceValue,
        compareAtPrice: compareAtPrice == null ? undefined : Number(compareAtPrice),
        stock: stockValue,
        sku,
        status: 'ACTIVE',
      },
    });

    logger.info(`Product created: ${product.id}`);
    return product;
  }

  async updateProduct(productId: string, updateData: any) {
    const { updatedAt, ...update } = updateData;

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) throw new AppError('Product not found', 404);

    const data = {
      ...update,
      updatedAt: new Date(),
    };

    const updated = await prisma.product.update({
      where: { id: productId },
      data,
    });

    logger.info(`Product updated: ${productId}`);
    return updated;
  }

  async deleteProduct(productId: string) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) throw new AppError('Product not found', 404);

    const data = {
      status: 'INACTIVE',
    };

    await prisma.product.update({
      where: { id: productId },
      data,
    });

    logger.info(`Product deleted: ${productId}`);
    return { success: true };
  }

  async getFeaturedProducts(storeId: string, limit: number = 8) {
    return prisma.product.findMany({
      where: { storeId, status: 'ACTIVE' },
      include: {
        category: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

export const productService = new ProductService();