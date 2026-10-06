import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { success, created, notFound, error } from '../../utils/response';
import { categoryService } from '../../services/category.service';
import { productService } from '../../services/product.service';
import { db } from '../../services/_db';
import { 
  authenticate, 
  hasStoreAccess,
  requireRole, 
  verifyStoreOwnership, 
  TenantIsolation 
} from '../../middleware/auth';

const router = Router();

// =====================
// Queries
// =====================

const categoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  activeOnly: z.coerce.boolean().optional(),
});

const categorySchema = z.object({
  nameAr: z.string().trim().min(2).max(200),
  nameEn: z.string().trim().min(2).max(200),
  parentId: z.string().cuid().optional(),
}).strict();

const categoryUpdateSchema = z.object({
  nameAr: z.string().trim().min(2).max(200).optional(),
  nameEn: z.string().trim().min(2).max(200).nullable().optional(),
  parentId: z.string().cuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

// =====================
// Get Categories
// =====================
router.get('/stores/:storeId/categories',
  TenantIsolation,
  asyncHandler(async (req: Request, res: Response) => {
    const { storeId } = req.params;
    const query = categoryQuerySchema.parse(req.query);
    
    const categories = await categoryService.getCategories(
      storeId, 
      (query.page || 1), 
      (query.limit || 20),
      query.activeOnly ?? (!req.user || req.user.role === 'CUSTOMER')
    );
    
    return success(res, categories);
  })
);

// =====================
// Get Single Category
// =====================
router.get('/categories/:categoryId',
  TenantIsolation,
  asyncHandler(async (req: Request, res: Response) => {
    const { categoryId } = req.params;
    const category = await categoryService.getCategoryById(categoryId);
    
    if (!category) return notFound(res, 'Category not found');
    
    // Verify belongs to authorized store
    const isMerchant = Boolean(req.user && ['PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN', 'STAFF'].includes(req.user.role));
    if (!isMerchant && !category.isActive) {
      return notFound(res, 'Category not found');
    }
    if (req.user && !(await hasStoreAccess(req.user, category.storeId))) {
      return error(res, 'Category not found', 403);
    }
    
    return success(res, category);
  })
);

// =====================
// Get Category Products
// =====================
router.get('/categories/:categoryId/products',
  TenantIsolation,
  asyncHandler(async (req: Request, res: Response) => {
    const { categoryId } = req.params;
    const category = await categoryService.getCategoryById(categoryId);
    const isMerchant = Boolean(req.user && ['PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN', 'STAFF'].includes(req.user.role));
    if (!isMerchant && !category.isActive) {
      return notFound(res, 'Category not found');
    }
    if (req.user && !(await hasStoreAccess(req.user, category.storeId))) {
      return error(res, 'Category not found', 403);
    }
    
    const query = {
      storeId: category.storeId,
      categoryId,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      status: isMerchant ? undefined : 'ACTIVE'
    };
    
    const products = await productService.getProducts(query);
    return success(res, products);
  })
);

// =====================
// Create Category
// =====================
router.post('/stores/:storeId/categories',
  TenantIsolation,
  authenticate,
  requireRole('PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN', 'STAFF'),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const { storeId } = req.params;
    const category = await categoryService.createCategory(storeId, categorySchema.parse(req.body));
    return created(res, category);
  })
);

// =====================
// Update Category
// =====================
router.put('/categories/:categoryId',
  TenantIsolation,
  authenticate,
  requireRole('PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN'),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const { categoryId } = req.params;
    const category = await categoryService.updateCategory(categoryId, categoryUpdateSchema.parse(req.body));
    return success(res, category);
  })
);

// =====================
// Delete Category
// =====================
router.delete('/categories/:categoryId',
  TenantIsolation,
  authenticate,
  requireRole('PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN'),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const { categoryId } = req.params;
    await categoryService.deleteCategory(categoryId);
    return success(res, { message: 'Category removed successfully' });
  })
);

// =====================
// Get Category Hierarchy
// =====================
router.get('/stores/:storeId/categories/tree',
  TenantIsolation,
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { storeId } = req.params;
    
    const categories = await categoryService.getCategories(storeId, 1000, 1000);
    
    // Build parent-child relationships
    type CategoryNode = (typeof categories.categories)[number] & { children: CategoryNode[] };
    const categoryMap = new Map<string, CategoryNode>();
    const rootCategories: CategoryNode[] = [];
    
    categories.categories.forEach(cat => {
      categoryMap.set(cat.id, { ...cat, children: [] });
    });
    
    categories.categories.forEach(cat => {
      const category = categoryMap.get(cat.id);
      const parent = cat.parentId ? categoryMap.get(cat.parentId) : undefined;
      if (category && parent) {
        parent.children.push(category);
      } else {
        if (category) rootCategories.push(category);
      }
    });
    
    return success(res, rootCategories);
  })
);

export default router;