import { createHash, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errorHandler';
import { db } from './_db';

const CART_TTL_MS = 30 * 60 * 1000;
type GuestCartWithItems = Prisma.GuestCartGetPayload<{
  include: {
    items: {
      include: {
        product: { include: { productImages: true; variants: true } };
      };
    };
  };
}>;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function presentCart(cart: GuestCartWithItems) {
  const items = cart.items.map((item) => {
    const variant = item.variantId
      ? item.product.variants.find((candidate) =>
        candidate.id === item.variantId && candidate.isActive)
      : null;
    const unitPrice = Number(variant?.price ?? item.product.price);
    return {
      id: item.id,
      productId: item.productId,
      productNameAr: item.product.nameAr,
      productNameEn: item.product.nameEn,
      productSlug: item.product.slug,
      mainImage: item.product.productImages?.url,
      quantity: item.quantity,
      unitPrice,
      total: unitPrice * item.quantity,
      variantId: item.variantId ?? undefined,
      variantName: variant?.name,
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  return { id: cart.id, storeId: cart.storeId, items, subtotal, total: subtotal };
}

export class GuestCartService {
  generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  async createGuestCart(storeId: string) {
    const store = await db.store.findFirst({
      where: { id: storeId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!store) throw new AppError('Store not found or inactive', 404);

    const token = this.generateToken();
    const cart = await db.guestCart.create({
      data: {
        storeId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + CART_TTL_MS),
      },
      select: { id: true, storeId: true },
    });
    return { cart, token };
  }

  private async findActiveCart(cartId: string, token: string): Promise<GuestCartWithItems> {
    const cart = await db.guestCart.findFirst({
      where: {
        id: cartId,
        tokenHash: hashToken(token),
        checkedOutAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        items: {
          include: {
            product: {
              include: { productImages: true, variants: true },
            },
          },
        },
      },
    });
    if (!cart) throw new AppError('Guest cart not found or expired', 404);
    return cart;
  }

  async getCart(cartId: string, token: string) {
    const cart = await this.findActiveCart(cartId, token);
    return presentCart(cart);
  }

  async addToGuestCart(
    cartId: string,
    token: string,
    item: { productId: string; variantId?: string; quantity: number },
  ) {
    const cart = await this.findActiveCart(cartId, token);
    const product = await db.product.findFirst({
      where: { id: item.productId, storeId: cart.storeId, status: 'ACTIVE' },
      select: { id: true, stock: true },
    });
    if (!product) throw new AppError('Product not found', 404);

    const variant = item.variantId
      ? await db.productVariant.findFirst({
        where: { id: item.variantId, productId: product.id, isActive: true },
        select: { id: true, stock: true },
      })
      : null;
    if (item.variantId && !variant) throw new AppError('Product variant is unavailable', 404);

    const existing = await db.guestCartItem.findFirst({
      where: {
        cartId,
        productId: product.id,
        variantId: item.variantId || null,
      },
      select: { id: true, quantity: true },
    });
    const quantity = (existing?.quantity ?? 0) + item.quantity;
    if (quantity > (variant?.stock ?? product.stock)) {
      throw new AppError('Insufficient stock', 409);
    }

    if (existing) {
      await db.guestCartItem.update({
        where: { id: existing.id },
        data: { quantity },
      });
    } else {
      await db.guestCartItem.create({
        data: {
          cartId,
          productId: product.id,
          variantId: item.variantId || null,
          quantity: item.quantity,
        },
      });
    }
    return this.getCart(cartId, token);
  }

  async updateCartItemQuantity(
    cartId: string,
    cartItemId: string,
    token: string,
    quantity: number,
  ) {
    const cart = await this.findActiveCart(cartId, token);
    const item = cart.items.find((entry) => entry.id === cartItemId);
    if (!item) throw new AppError('Cart item not found', 404);
    const variant = item.variantId
      ? item.product.variants.find((candidate) =>
        candidate.id === item.variantId && candidate.isActive)
      : null;
    if (item.product.status !== 'ACTIVE') {
      throw new AppError('Product is no longer available', 409);
    }
    if (!variant && item.variantId) throw new AppError('Product variant is unavailable', 409);
    if (quantity > (variant?.stock ?? item.product.stock)) {
      throw new AppError('Insufficient stock', 409);
    }
    await db.guestCartItem.update({
      where: { id: cartItemId },
      data: { quantity },
    });
    return this.getCart(cartId, token);
  }

  async removeFromGuestCartItem(cartId: string, cartItemId: string, token: string) {
    const cart = await this.findActiveCart(cartId, token);
    if (!cart.items.some((item) => item.id === cartItemId)) {
      throw new AppError('Cart item not found', 404);
    }
    await db.guestCartItem.delete({ where: { id: cartItemId } });
    return this.getCart(cartId, token);
  }

  async getCartTotal(cartId: string, token: string) {
    const cart = await this.getCart(cartId, token);
    return { items: cart.items, subtotal: cart.subtotal, total: cart.total };
  }
}

export const guestCartService = new GuestCartService();
