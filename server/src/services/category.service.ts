import { AppError } from '../utils/errorHandler';
import { logger } from '../lib/logger';
import { db as prisma } from './_db';

/**
 * CategoryService - Handles category operations
 */
export class CategoryService {
  /**
   * Get categories by store
   */
  async getCategories(storeId: string, page: number = 1, limit: number = 20, activeOnly = false) {
    const skip = (page - 1) * limit;
    const where = { storeId, ...(activeOnly ? { isActive: true } : {}) };
    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nameAr: 'asc' },
      }),
      prisma.category.count({ where }),
    ]);
    return { categories, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Get category by ID
   */
  async getCategoryById(categoryId: string) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new AppError('Category not found', 404);
    return category;
  }

  /**
   * Create category
   */
  async createCategory(storeId: string, { nameAr, nameEn, parentId }: {
    nameAr: string;
    nameEn?: string;
    parentId?: string;
  }) {
    const slug = nameEn?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) throw new AppError('An English name is required to create a category slug', 400);

    if (parentId) {
      const parent = await prisma.category.findFirst({
        where: { id: parentId, storeId },
        select: { id: true },
      });
      if (!parent) throw new AppError('Parent category not found in this store', 404);
    }

    const category = await prisma.category.create({
      data: {
        storeId,
        nameAr,
        nameEn,
        slug,
        parentId,
        isActive: true,
      },
    });

    logger.info(`Category created: ${category.id}`);
    return category;
  }

  /**
   * Update category
   */
  async updateCategory(categoryId: string, updateData: {
    nameAr?: string;
    nameEn?: string | null;
    parentId?: string | null;
    isActive?: boolean;
  }) {
    const existingCategory = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!existingCategory) throw new AppError('Category not found', 404);

    if (updateData.parentId !== undefined && updateData.parentId !== null) {
      if (updateData.parentId === categoryId) {
        throw new AppError('A category cannot be its own parent', 400);
      }
      const parent = await prisma.category.findFirst({
        where: { id: updateData.parentId, storeId: existingCategory.storeId },
        select: { id: true },
      });
      if (!parent) throw new AppError('Parent category not found in this store', 404);
    }

    const data: {
      nameAr?: string;
      nameEn?: string | null;
      slug?: string;
      parentId?: string | null;
      isActive?: boolean;
    } = { ...updateData };
    if (updateData.nameEn !== undefined && updateData.nameEn !== null) {
      const slug = updateData.nameEn.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!slug) throw new AppError('An English name is required to create a category slug', 400);
      data.slug = slug;
    }

    const updated = await prisma.category.update({
      where: { id: categoryId },
      data,
    });

    logger.info(`Category updated: ${categoryId}`);
    return updated;
  }

  /**
   * Delete category
   */
  async deleteCategory(categoryId: string) {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) throw new AppError('Category not found', 404);

    await prisma.category.update({
      where: { id: categoryId },
      data: { isActive: false },
    });

    logger.info(`Category deleted: ${categoryId}`);
    return { success: true };
  }
}

export const categoryService = new CategoryService();