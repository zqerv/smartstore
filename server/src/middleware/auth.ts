import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { config } from '../lib/config';
import { db } from '../services/_db';

export interface JWTPayload {
  userId: string;
  role: UserRole;
  storeId?: string;
  customerId?: string;
  tokenVersion?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

function getJwtSecret(): string {
  if (config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }
  return config.jwtSecret;
}

export function verifyToken(token: string): JWTPayload | null {
  const secret = getJwtSecret();
  try {
    const payload = jwt.verify(token, secret);
    if (
      typeof payload === 'string' ||
      typeof (payload as JwtPayload).userId !== 'string' ||
      !Object.values(UserRole).includes((payload as JwtPayload).role as UserRole)
    ) {
      return null;
    }

    const claims = payload as JwtPayload;
    return {
      userId: claims.userId as string,
      role: claims.role as UserRole,
      ...(typeof claims.storeId === 'string' ? { storeId: claims.storeId } : {}),
      tokenVersion: typeof claims.tv === 'number' ? claims.tv : 0,
    };
  } catch {
    return null;
  }
}

export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (req.user) {
    next();
    return;
  }

  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: 'No token provided' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }

  void db.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      role: true,
      storeId: true,
      isActive: true,
      tokenVersion: true,
      customers: { select: { id: true } },
    },
  }).then((user) => {
    if (!user || !user.isActive || user.tokenVersion !== (payload.tokenVersion ?? 0)) {
      res.status(401).json({ success: false, error: 'Invalid token' });
      return;
    }

    req.user = {
      userId: user.id,
      role: user.role,
      ...(user.storeId ? { storeId: user.storeId } : {}),
      ...(user.customers ? { customerId: user.customers.id } : {}),
    };
    next();
  }).catch(next);
};

export const TenantIsolation = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.headers.authorization) {
    next();
    return;
  }

  authenticate(req, res, () => {
    const storeId = req.params.storeId;
    const user = req.user;
    if (!storeId || !user || user.role === UserRole.PLATFORM_ADMIN) {
      next();
      return;
    }

    const hasStoreAccess = user.storeId === storeId
      ? Promise.resolve(true)
      : user.role === UserRole.CUSTOMER
        ? db.customerStore.findFirst({
          where: { userId: user.userId, storeId },
          select: { id: true },
        }).then(Boolean)
        : db.storeAdmin.findFirst({
          where: { userId: user.userId, storeId },
          select: { id: true },
        }).then(Boolean);

    void hasStoreAccess.then((allowed) => {
      if (!allowed) {
        res.status(403).json({
          success: false,
          error: 'You do not have access to this store',
        });
        return;
      }
      next();
    }).catch(next);
  });
};

export async function hasStoreAccess(user: JWTPayload, storeId: string): Promise<boolean> {
  if (user.role === UserRole.PLATFORM_ADMIN || user.storeId === storeId) return true;
  const membership = user.role === UserRole.CUSTOMER
    ? await db.customerStore.findFirst({
      where: { userId: user.userId, storeId },
      select: { id: true },
    })
    : await db.storeAdmin.findFirst({
      where: { userId: user.userId, storeId },
      select: { id: true },
    });
  return Boolean(membership);
}

export const verifyStoreOwnership = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }
  if (user.role === UserRole.PLATFORM_ADMIN) {
    next();
    return;
  }

  const resourceStore = req.params.storeId
    ? Promise.resolve({ storeId: req.params.storeId })
    : req.params.productId
      ? db.product.findUnique({
        where: { id: req.params.productId },
        select: { storeId: true },
      })
      : req.params.categoryId
        ? db.category.findUnique({
          where: { id: req.params.categoryId },
          select: { storeId: true },
        })
      : req.params.variantId
        ? db.productVariant.findUnique({
          where: { id: req.params.variantId },
          select: { product: { select: { storeId: true } } },
        }).then((variant) => variant ? { storeId: variant.product.storeId } : null)
      : req.params.couponId
          ? db.coupon.findUnique({
            where: { id: req.params.couponId },
            select: { storeId: true },
          })
        : Promise.resolve(null);

  void resourceStore.then(async (resource) => {
    if (!resource) {
      res.status(404).json({ success: false, error: 'Store resource not found' });
      return;
    }

    const ownsStore = user.storeId === resource.storeId ||
      Boolean(await db.storeAdmin.findFirst({
        where: { userId: user.userId, storeId: resource.storeId },
        select: { id: true },
      }));
    if (!ownsStore) {
      res.status(403).json({ success: false, error: 'You do not have access to this store' });
      return;
    }
    next();
  }).catch(next);
};

export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user?.role) {
      res.status(403).json({ success: false, error: 'No role specified' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }
    next();
  };
};
