import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { success, created, notFound, error } from '../../utils/response';
import { productService } from '../../services/product.service';
import { 
  authenticate, 
  hasStoreAccess,
  requireRole, 
  verifyStoreOwnership, 
  TenantIsolation 
} from '../../middleware/auth';
import { db } from '../../services/_db';
import { getStorageProvider } from '../../lib/providers/storage';

const router = Router();

// =====================
// Queries
// =====================

const productQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DRAFT', 'ALL']).optional(),
  categoryId: z.string().optional(),
});

const productUpdateSchema = z.object({
  categoryId: z.string().cuid().optional(),
  nameAr: z.string().trim().min(1).max(200).optional(),
  nameEn: z.string().trim().max(200).nullable().optional(),
  descriptionAr: z.string().max(5000).nullable().optional(),
  descriptionEn: z.string().max(5000).nullable().optional(),
  price: z.coerce.number().nonnegative().optional(),
  compareAtPrice: z.coerce.number().nonnegative().nullable().optional(),
  sku: z.string().trim().max(100).nullable().optional(),
  stock: z.coerce.number().int().nonnegative().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DRAFT']).optional(),
  isFeatured: z.boolean().optional(),
}).strict();

const productCreateSchema = z.object({
  categoryId: z.string().cuid(),
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).optional(),
  descriptionAr: z.string().max(5000).nullable().optional(),
  descriptionEn: z.string().max(5000).nullable().optional(),
  slug: z.string().trim().max(200).optional(),
  type: z.enum(['SIMPLE', 'VARIABLE']).optional(),
  price: z.coerce.number().nonnegative(),
  compareAtPrice: z.coerce.number().nonnegative().nullable().optional(),
  stock: z.coerce.number().int().nonnegative().optional(),
  quantity: z.coerce.number().int().nonnegative().optional(),
  sku: z.string().trim().max(100).optional(),
}).strict();

const variantCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().min(1).max(100),
  price: z.coerce.number().nonnegative(),
  compareAtPrice: z.coerce.number().nonnegative().nullable().optional(),
  stock: z.coerce.number().int().nonnegative(),
  options: z.string().trim().min(1).max(2000),
  zoneId: z.string().trim().min(1).max(100),
  order: z.coerce.number().int().min(0).optional(),
}).strict();

const variantUpdateSchema = variantCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one variant field is required');

const MERCHANT_ROLES = ['PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN', 'STAFF'];

// Internal cost data is for merchants only.
function omitCost<T extends { costPrice?: unknown }>(product: T): Omit<T, 'costPrice'> {
  const { costPrice: _costPrice, ...rest } = product;
  return rest;
}

function publicProducts<T>(result: T, isMerchant: boolean): T {
  if (isMerchant) return result;
  if (Array.isArray(result)) return result.map((item) => omitCost(item)) as unknown as T;
  const withList = result as unknown as { products?: Array<{ costPrice?: unknown }> };
  if (withList && Array.isArray(withList.products)) {
    return { ...withList, products: withList.products.map((item) => omitCost(item)) } as unknown as T;
  }
  return result;
}

// =====================
// Product List
// =====================
router.get('/stores/:storeId/products', 
  TenantIsolation,
  asyncHandler(async (req: Request, res: Response) => {
    const { storeId } = req.params;
    const query = productQuerySchema.parse(req.query);
    const isMerchant = Boolean(req.user && MERCHANT_ROLES.includes(req.user.role));
    
    const products = await productService.getProducts({
      storeId,
      ...query,
      status: isMerchant ? query.status : 'ACTIVE',
    });
    
    return success(res, publicProducts(products, isMerchant));
  })
);

// =====================
// Product Search
// =====================
router.get('/products/search', 
  TenantIsolation,
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { search } = productQuerySchema.parse(req.query);
    const storeId = req.user?.role === 'PLATFORM_ADMIN'
      ? req.query.storeId
      : req.user?.storeId;
    if (typeof storeId !== 'string' || !storeId) {
      return error(res, 'Store ID is required for platform product search', 400);
    }
    
    const products = await productService.getProducts({
      storeId,
      search,
      status: 'ACTIVE',
    });
    
    return success(res, publicProducts(products, Boolean(req.user && MERCHANT_ROLES.includes(req.user.role))));
  })
);

// =====================
// Product Details
// =====================
router.get('/products/:productId', 
  TenantIsolation,
  asyncHandler(async (req: Request, res: Response) => {
    const { productId } = req.params;
    const product = await productService.getProductById(productId);
    if (!product) return notFound(res, 'Product not found');
    
    // Verify belongs to authorized store
    const isMerchant = Boolean(req.user && MERCHANT_ROLES.includes(req.user.role));
    if (!isMerchant && product.status !== 'ACTIVE') {
      return notFound(res, 'Product not found');
    }
    if (req.user && !(await hasStoreAccess(req.user, product.storeId))) {
      return error(res, 'Product not found', 403);
    }
    
    return success(res, isMerchant ? product : omitCost(product));
  })
);
// =====================
router.post('/stores/:storeId/products',
  TenantIsolation,
  authenticate,
  requireRole('PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN'),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const { storeId } = req.params;
    const product = await productService.createProduct(storeId, productCreateSchema.parse(req.body));
    return created(res, product);
  })
);

// =====================
// Update Product
// =====================
router.put('/products/:productId',
  TenantIsolation,
  authenticate,
  requireRole('PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN'),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const { productId } = req.params;
    const product = await productService.updateProduct(productId, productUpdateSchema.parse(req.body));
    return success(res, product);
  })
);

// =====================
// Delete Product
// =====================
router.delete('/products/:productId',
  TenantIsolation,
  authenticate,
  requireRole('PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN'),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const { productId } = req.params;
    await productService.deleteProduct(productId);
    return success(res, { message: 'Product removed successfully' });
  })
);

// =====================
// Product Image (one image per product)
// =====================
const imageSchema = z.object({
  url: z.string().trim().max(500).regex(/^\/uploads\/[A-Za-z0-9_\-./]+$/, 'Image must come from the upload endpoint'),
  alt: z.string().trim().max(200).nullable().optional(),
});

router.put('/products/:productId/image',
  TenantIsolation,
  authenticate,
  requireRole('PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN'),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const product = await db.product.findUnique({ where: { id: req.params.productId }, select: { id: true, storeId: true } });
    if (!product) return notFound(res, 'Product not found');
    const input = imageSchema.parse(req.body);
    if (!input.url.startsWith(`/uploads/stores${product.storeId}`) || input.url.includes('..')) {
      return error(res, 'Image does not belong to this store', 403);
    }
    const previous = await db.productImage.findUnique({ where: { productId: product.id } });
    const image = await db.productImage.upsert({
      where: { productId: product.id },
      create: { productId: product.id, url: input.url, alt: input.alt ?? null, isPrimary: true },
      update: { url: input.url, alt: input.alt ?? null },
    });
    if (previous && previous.url !== input.url) await removeStoredFile(previous.url);
    return success(res, image);
  })
);

router.delete('/products/:productId/image',
  TenantIsolation,
  authenticate,
  requireRole('PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN'),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await db.productImage.findUnique({ where: { productId: req.params.productId } });
    if (!existing) return notFound(res, 'Product has no image');
    await db.productImage.delete({ where: { productId: req.params.productId } });
    await removeStoredFile(existing.url);
    return success(res, { message: 'Product image removed' });
  })
);

async function removeStoredFile(url: string) {
  if (url.startsWith('/uploads/')) await getStorageProvider().delete(url.slice('/uploads/'.length)).catch(() => undefined);
}

// =====================
// Featured Products
// =====================
router.get('/stores/:storeId/products/featured',
  TenantIsolation,
  asyncHandler(async (req: Request, res: Response) => {
    const { storeId } = req.params;
    const limit = parseInt(req.query.limit as string) || 8;
    const products = await productService.getFeaturedProducts(storeId, limit);
    return success(res, publicProducts(products, Boolean(req.user && MERCHANT_ROLES.includes(req.user.role))));
  })
);

// =====================
router.get('/products/:productId/variants',
  TenantIsolation,
  asyncHandler(async (req: Request, res: Response) => {
    const { productId } = req.params;
    const product = await productService.getProductById(productId);
    if (!product) return notFound(res, 'Product not found');
    
    const isMerchant = Boolean(req.user && MERCHANT_ROLES.includes(req.user.role));
    if (!isMerchant && product.status !== 'ACTIVE') {
      return notFound(res, 'Product variants not found');
    }
    if (req.user && !(await hasStoreAccess(req.user, product.storeId))) {
      return error(res, 'Product not found', 403);
    }
    const variants = await db.productVariant.findMany({
      where: {
        productId,
        ...(req.user && MERCHANT_ROLES.includes(req.user.role) ? {} : { isActive: true }),
      },
      orderBy: { order: 'asc' },
    });
    return success(res, { variants });
  })
);

router.post('/products/:productId/variants',
  authenticate,
  requireRole('PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const product = await db.product.findUnique({
      where: { id: req.params.productId },
      select: { id: true, storeId: true, type: true },
    });
    if (!product) return notFound(res, 'Product not found');
    if (!req.user || !(await hasStoreAccess(req.user, product.storeId))) {
      return error(res, 'Product not found', 403);
    }
    const input = variantCreateSchema.parse(req.body);
    const duplicateSku = await db.productVariant.findFirst({
      where: { productId: product.id, sku: input.sku },
      select: { id: true },
    });
    if (duplicateSku) return error(res, 'Variant SKU already exists for this product', 409);
    const variant = await db.$transaction(async (tx) => {
      const createdVariant = await tx.productVariant.create({
        data: { ...input, order: input.order ?? 0, productId: product.id },
      });
      if (product.type !== 'VARIABLE') {
        await tx.product.update({ where: { id: product.id }, data: { type: 'VARIABLE' } });
      }
      return createdVariant;
    });
    return created(res, variant);
  })
);

router.put('/products/:productId/variants/:variantId',
  authenticate,
  requireRole('PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN'),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const variant = await db.productVariant.findFirst({
      where: { id: req.params.variantId, productId: req.params.productId },
      select: { id: true },
    });
    if (!variant) return notFound(res, 'Product variant not found');
    const input = variantUpdateSchema.parse(req.body);
    const updated = await db.productVariant.update({ where: { id: variant.id }, data: input });
    return success(res, updated);
  })
);

router.delete('/products/:productId/variants/:variantId',
  authenticate,
  requireRole('PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN'),
  verifyStoreOwnership,
  asyncHandler(async (req: Request, res: Response) => {
    const variant = await db.productVariant.findFirst({
      where: { id: req.params.variantId, productId: req.params.productId },
      select: { id: true },
    });
    if (!variant) return notFound(res, 'Product variant not found');
    const updated = await db.productVariant.update({
      where: { id: variant.id },
      data: { isActive: false },
    });
    return success(res, updated);
  })
);

export default router;