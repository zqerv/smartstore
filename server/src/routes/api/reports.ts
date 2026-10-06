import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { success, error } from '../../utils/response';
import { authenticate, hasStoreAccess, requireRole } from '../../middleware/auth';
import { reportsService } from '../../services/reports.service';

const router = Router();
const querySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

router.get('/stores/:storeId/reports',
  authenticate,
  requireRole('PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN', 'STAFF'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user || !(await hasStoreAccess(req.user, req.params.storeId))) return error(res, 'Access denied', 403);
    const { days } = querySchema.parse(req.query);
    return success(res, await reportsService.storeReport(req.params.storeId, days));
  })
);

router.get('/platform/reports',
  authenticate,
  requireRole('PLATFORM_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { days } = querySchema.parse(req.query);
    return success(res, await reportsService.platformReport(days));
  })
);

export default router;
