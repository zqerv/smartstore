import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { success, created, notFound, error } from '../../utils/response';
import { cartService } from '../../services/cart.service';
import { customerService } from '../../services/customer.service';
import { authenticate, requireRole, TenantIsolation } from '../../middleware/auth';
import { db } from '../../services/_db';
import { AppError } from '../../utils/errorHandler';

const router = Router();

// =====================
// Input Schemas
// =====================

const cartItemInput = z.object({
  productId: z.string().cuid(),
  nameAr: z.string().optional(),
  nameEn: z.string().optional(),
  quantity: z.number().min(1).refine(v => v <= 999, 'Quantity must be less than or equal to 999'),
  unitPrice: z.number().min(0).optional(),
  mainImage: z.string().url().optional(),
  variantId: z.string().cuid().optional(),
  variantName: z.string().optional(),
  originalQuantity: z.number().optional(),
  storeId: z.string().cuid().optional(),
});

const cartUpdateInput = z.object({
  quantity: z.number().min(1).refine(v => v <= 999, 'Quantity must be less than or equal to 999'),
});

// =====================
// Get Cart
// =====================
router.get('/customers/:customerId/cart',
  TenantIsolation,
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { customerId } = req.params;
    const customerIdFromUser = req.user?.customerId;
    
    // Verify own cart or platform admin
    if (req.user?.role !== 'PLATFORM_ADMIN' && customerId !== customerIdFromUser) {
      return error(res, 'You can only access your own cart', 403);
    }
    
    // Ensure customer exists
    const customer = await customerService.getCustomerById(customerId);
    if (!customer) return notFound(res, 'Customer not found');
    
    const storeId = await resolveCustomerStoreId(
      customerId,
      typeof req.query.storeId === 'string' ? req.query.storeId : undefined
    );
    const cart = await cartService.getCart(customerId, storeId);
    
    return success(res, cart);
  })
);

// =====================
// Add to Cart
// =====================
router.post('/customers/:customerId/cart/items',
  TenantIsolation,
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { customerId } = req.params;
    const customerIdFromUser = req.user?.customerId;
    
    if (req.user?.role !== 'PLATFORM_ADMIN' && customerId !== customerIdFromUser) {
      return error(res, 'You can only manage your own cart', 403);
    }
    
    const customer = await customerService.getCustomerById(customerId);
    if (!customer) return notFound(res, 'Customer not found');
    
    const data = cartItemInput.parse(req.body);
    const { productId, variantId, quantity } = data;
    const storeId = await resolveCustomerStoreId(customerId, data.storeId);
    
    const item = await cartService.addToCart(customerId, storeId, {
      productId,
      variantId,
      quantity,
    });
    
    return created(res, item);
  })
);

// =====================
// Update Cart Item Quantity
// =====================
router.put('/cart/items/:cartItemId',
  TenantIsolation,
  authenticate,
  verifyUserStoreForCartItem,
  asyncHandler(async (req: Request, res: Response) => {
    const { cartItemId } = req.params;
    const { quantity } = cartUpdateInput.parse(req.body);
    
    const cartItem = await cartService.updateCartItemQuantity(cartItemId, quantity);
    
    return success(res, cartItem);
  })
);

// =====================
// Remove Cart Item
// =====================
router.delete('/cart/items/:cartItemId',
  TenantIsolation,
  authenticate,
  verifyUserStoreForCartItem,
  asyncHandler(async (req: Request, res: Response) => {
    const { cartItemId } = req.params;
    
    await cartService.removeFromCart(cartItemId);
    
    return success(res, { message: 'Item removed from cart' });
  })
);

// =====================
// Clear Cart
// =====================
router.delete('/customers/:customerId/cart',
  TenantIsolation,
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { customerId } = req.params;
    const customerIdFromUser = req.user?.customerId;
    
    if (req.user?.role !== 'PLATFORM_ADMIN' && customerId !== customerIdFromUser) {
      return error(res, 'You can only clear your own cart', 403);
    }
    
    const customer = await customerService.getCustomerById(customerId);
    if (!customer) return notFound(res, 'Customer not found');
    
    await cartService.clearCart(customerId);
    
    return success(res, { message: 'Cart cleared successfully' });
  })
);

// =====================
// Verify Cart Items (Frontend helper)
// =====================
router.post('/cart/verify',
  TenantIsolation,
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const items = req.body.items as any[];
    const valid = await cartService.verifyCartItems(items);
    
    return success(res, { valid });
  })
);

// Helper middleware to verify user store matches cart item store
function verifyUserStoreForCartItem(req: Request, res: Response, next: NextFunction) {
  const cartItemId = req.params.cartItemId;
  void cartService.getCartAtId(cartItemId).then(async (rootCartItem) => {
    const user = req.user;
    if (!user) {
      error(res, 'Authentication required', 401);
      return;
    }
    if (user.role === 'CUSTOMER' && rootCartItem.customerId !== user.customerId) {
      error(res, 'You can only modify your own cart', 403);
      return;
    }
    if (
      user.role !== 'PLATFORM_ADMIN' &&
      user.role !== 'CUSTOMER' &&
      user.storeId !== rootCartItem.storeId
    ) {
      const membership = await db.storeAdmin.findFirst({
        where: { userId: user.userId, storeId: rootCartItem.storeId },
        select: { id: true },
      });
      if (!membership) {
        error(res, 'Cannot modify items from this store', 403);
        return;
      }
    }
    next();
  }).catch(next);
}

async function resolveCustomerStoreId(customerId: string, requestedStoreId?: string): Promise<string> {
  if (requestedStoreId) {
    const membership = await db.customerStore.findFirst({
      where: { userId: customerId, storeId: requestedStoreId },
      select: { storeId: true },
    });
    if (!membership) throw new AppError('Customer does not belong to this store', 403);
    return membership.storeId;
  }

  const memberships = await db.customerStore.findMany({
    where: { userId: customerId },
    select: { storeId: true },
    take: 2,
  });
  if (memberships.length === 1) return memberships[0].storeId;
  if (memberships.length === 0) throw new AppError('Customer is not registered with a store', 403);
  throw new AppError('Store ID is required when a customer belongs to multiple stores', 400);
}

export default router;