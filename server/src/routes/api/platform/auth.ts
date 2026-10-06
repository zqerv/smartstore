import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../../../services/auth.service';
import { asyncHandler } from '../../../utils/errorHandler';
import { success, error } from '../../../utils/response';
import { authenticate } from '../../../middleware/auth';
import { authLimiter } from '../../../middleware/rateLimit';

const router = Router();

router.use('/login', authLimiter);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

/**
 * Platform Admin Login
 * POST /api/platform/auth/login
 */
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const data = loginSchema.parse(req.body);

  const result = await authService.platformAdminLogin(data);

  return success(res, {
    user: {
      id: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      role: result.user.role,
    },
    token: result.token,
  });
}));

/**
 * Platform Admin Register
 * POST /api/platform/auth/register
 */
router.post('/register', asyncHandler(async (_req: Request, res: Response) => {
  return error(res, 'Platform administrators cannot self-register', 403);
}));

/**
 * Platform Admin Logout
 * POST /api/platform/auth/logout
 */
router.post('/logout', authenticate, asyncHandler(async (req: Request, res: Response) => {
  await authService.logout(req.user!.userId);
  return success(res, { message: 'Logged out; all existing sessions were revoked' });
}));

export default router;