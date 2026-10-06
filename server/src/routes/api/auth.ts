import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { authService } from '../../services/auth.service';
import { platformService } from '../../services/platform.service';
import { asyncHandler } from '../../utils/errorHandler';
import { success, created, error } from '../../utils/response';
import { getMessageProvider } from '../../lib/providers/messaging';
import { authLimiter } from '../../middleware/rateLimit';

const router = Router();

router.use(['/login', '/register', '/forgot-password', '/reset-password', '/verify-otp', '/request-otp'], authLimiter);

// =====================
// Validation Schemas
// =====================

const registerSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(5),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  storeId: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(5).optional(),
  password: z.string(),
}).refine((data) => data.email || data.phone, {
  message: 'Email or phone is required',
});

// =====================
// Routes
// =====================

/**
 * Register new customer
 * POST /api/auth/register
 */
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  if (!(await platformService.getSettings()).allowCustomerRegistration) {
    return error(res, 'Registration is currently disabled by the platform administrator', 403);
  }
  const data = registerSchema.parse(req.body);
  const result = await authService.register(data);

  return created(res, {
    user: result.user,
    token: result.token,
  });
}));

/**
 * Login
 * POST /api/auth/login
 */
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const data = loginSchema.parse(req.body);

  const result = await authService.login({
    email: data.email,
    phone: data.phone,
    password: data.password,
  });

  return success(res, {
    user: result.user,
    token: result.token,
  });
}));

/**
 * Verify OTP
 * POST /api/auth/verify-otp
 */
router.post('/verify-otp', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body);
  await authService.verifyPhoneOtp(req.user!.userId, code);
  return success(res, { message: 'Phone number verified' });
}));

/**
 * Request phone OTP (code delivery requires a configured SMS provider)
 * POST /api/auth/request-otp
 */
router.post('/request-otp', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.requestPhoneOtp(req.user!.userId);
  return success(res, {
    delivered: result.delivered,
    ...(result.delivered ? {} : { status: 'PROVIDER CONFIGURATION REQUIRED', message: 'SMS delivery is not configured; no code was sent' }),
  });
}));

/**
 * Logout: revokes every token issued before now
 * POST /api/auth/logout
 */
router.post('/logout', authenticate, asyncHandler(async (req: Request, res: Response) => {
  await authService.logout(req.user!.userId);
  return success(res, { message: 'Logged out; all existing sessions were revoked' });
}));

/**
 * Refresh Token: issues a fresh token for a still-valid session
 * POST /api/auth/refresh
 */
router.post('/refresh', authenticate, asyncHandler(async (req: Request, res: Response) => {
  return success(res, { token: await authService.refresh(req.user!.userId) });
}));

/**
 * Forgot Password: always answers the same way so accounts cannot be enumerated
 * POST /api/auth/forgot-password
 */
router.post('/forgot-password', asyncHandler(async (req: Request, res: Response) => {
  const { identifier } = z.object({ identifier: z.string().trim().min(3).max(120) }).parse(req.body);
  await authService.requestPasswordReset(identifier);
  return success(res, {
    message: 'If an account exists, a reset code was issued. Delivery requires a configured email/SMS provider.',
    deliveryConfigured: getMessageProvider().configured,
  });
}));

/**
 * Reset Password
 * POST /api/auth/reset-password
 */
router.post('/reset-password', asyncHandler(async (req: Request, res: Response) => {
  const { token, newPassword } = z.object({
    token: z.string().min(32).max(128),
    newPassword: z.string().min(8).max(128),
  }).parse(req.body);
  await authService.resetPassword(token, newPassword);
  return success(res, { message: 'Password updated. Please sign in again.' });
}));

/**
 * Update Password (Protected)
 * POST /api/auth/change-password
 */
router.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8),
    }).parse(req.body);

    const userId = req.user?.userId;
    if (!userId) {
      return error(res, 'User not authenticated', 401);
    }

    const token = await authService.changePassword(userId, currentPassword, newPassword);

    return success(res, { message: 'Password changed successfully', token });
  })
);

/**
 * Get Current User (Protected)
 * GET /api/auth/me
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    
    if (!userId) {
      return error(res, 'User not authenticated', 401);
    }

    const user = await authService.getUserById(userId);

    if (!user) {
      return error(res, 'User not found', 404);
    }

    return success(res, user);
  })
);

export default router;