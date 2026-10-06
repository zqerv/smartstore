import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { success, created } from '../../utils/response';
import { guestCartService } from '../../services/guest-cart.service';
import { TenantIsolation } from '../../middleware/auth';

const router = Router();
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/i);
const itemSchema = z.object({
  productId: z.string().cuid(),
  variantId: z.string().cuid().optional(),
  quantity: z.number().int().min(1).max(50),
});
const quantitySchema = z.object({
  quantity: z.number().int().min(1).max(50),
});

function guestToken(req: Request): string {
  return tokenSchema.parse(req.header('X-Guest-Cart-Token'));
}

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const storeId = z.string().cuid().parse(req.body.storeId);
    const { cart, token } = await guestCartService.createGuestCart(storeId);
    return created(res, { cartId: cart.id, storeId: cart.storeId, token });
  }),
);

router.get(
  '/:cartId',
  TenantIsolation,
  asyncHandler(async (req: Request, res: Response) => {
    const cart = await guestCartService.getCart(req.params.cartId, guestToken(req));
    return success(res, cart);
  }),
);

router.post(
  '/:cartId/items',
  TenantIsolation,
  asyncHandler(async (req: Request, res: Response) => {
    const item = itemSchema.parse(req.body);
    const cart = await guestCartService.addToGuestCart(
      req.params.cartId,
      guestToken(req),
      item,
    );
    return created(res, cart);
  }),
);

router.put(
  '/:cartId/items/:cartItemId',
  TenantIsolation,
  asyncHandler(async (req: Request, res: Response) => {
    const { quantity } = quantitySchema.parse(req.body);
    const cart = await guestCartService.updateCartItemQuantity(
      req.params.cartId,
      req.params.cartItemId,
      guestToken(req),
      quantity,
    );
    return success(res, cart);
  }),
);

router.delete(
  '/:cartId/items/:cartItemId',
  TenantIsolation,
  asyncHandler(async (req: Request, res: Response) => {
    const cart = await guestCartService.removeFromGuestCartItem(
      req.params.cartId,
      req.params.cartItemId,
      guestToken(req),
    );
    return success(res, cart);
  }),
);

router.get(
  '/:cartId/total',
  TenantIsolation,
  asyncHandler(async (req: Request, res: Response) => {
    const total = await guestCartService.getCartTotal(req.params.cartId, guestToken(req));
    return success(res, total);
  }),
);

export default router;
