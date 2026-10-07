import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { publicCatalogService } from '../../services/public-catalog.service';
import { asyncHandler } from '../../utils/errorHandler';
import { success } from '../../utils/response';

const router = Router();
const querySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(200).optional(),
  categoryId: z.string().cuid().optional(),
});

// Public reads intentionally ignore bearer sessions. Merchant mutations retain their RBAC routes.
router.get('/stores/:idOrSlug/catalog/products', asyncHandler(async (req: Request, res: Response) => {
  return success(res, await publicCatalogService.getProducts(req.params.idOrSlug, querySchema.parse(req.query)));
}));

router.get('/stores/:idOrSlug/catalog/products/:productId', asyncHandler(async (req: Request, res: Response) => {
  return success(res, await publicCatalogService.getProduct(req.params.idOrSlug, req.params.productId));
}));

router.get('/stores/:idOrSlug/catalog/categories', asyncHandler(async (req: Request, res: Response) => {
  return success(res, await publicCatalogService.getCategories(req.params.idOrSlug));
}));

export default router;
