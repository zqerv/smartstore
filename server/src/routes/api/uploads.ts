import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../utils/errorHandler';
import { created } from '../../utils/response';
import { authenticate, hasStoreAccess, requireRole } from '../../middleware/auth';
import { getStorageProvider } from '../../lib/providers/storage';

const router = Router();
const MAX_BYTES = 2 * 1024 * 1024;

const uploadSchema = z.object({
  kind: z.enum(['logo', 'favicon', 'product']),
  dataBase64: z.string().min(16),
}).strict();

// SVG is intentionally rejected because it can carry scripts.
function detectImage(data: Buffer): string | null {
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpg';
  if (data.length > 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (data.length > 6 && ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii'))) return 'gif';
  return null;
}

router.post('/stores/:storeId/uploads',
  authenticate,
  requireRole('PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user || !(await hasStoreAccess(req.user, req.params.storeId))) throw new AppError('Access denied', 403);
    const input = uploadSchema.parse(req.body);
    const base64 = input.dataBase64.replace(/^data:[^;]+;base64,/, '');
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(base64)) throw new AppError('Image data is not valid base64', 400);
    const data = Buffer.from(base64, 'base64');
    if (data.length === 0 || data.length > MAX_BYTES) throw new AppError('Image must be between 1 byte and 2 MB', 413);
    const extension = detectImage(data);
    if (!extension) throw new AppError('Only PNG, JPEG, WebP and GIF images are accepted', 415);
    const stored = await getStorageProvider().upload({ folder: `stores/${req.params.storeId}/${input.kind}`, extension, data });
    return created(res, stored);
  })
);

export default router;
