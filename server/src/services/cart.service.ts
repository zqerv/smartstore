import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/errorHandler';
import { logger } from '../lib/logger';

const prisma = new PrismaClient();

export interface CartItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
  [key: string]: unknown;
}

export class CartService {
  async getCart(customerId: string, storeId: string) {
    const items = await prisma.cartItem.findMany({
      where: { customerId, storeId },
      include: { product: true },
      orderBy: { createdAt: 'asc' },
    });

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.unitPrice) * item.quantity,
      0
    );

    return { items, subtotal, totalQuantity, total: subtotal };
  }

  async addToCart(customerId: string, storeId: string, item: CartItemInput) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) {
      throw new AppError('Quantity must be an integer between 1 and 999', 400);
    }

    const membership = await prisma.customerStore.findFirst({
      where: { userId: customerId, storeId },
      select: { id: true },
    });
    if (!membership) throw new AppError('Customer does not belong to this store', 403);

    const product = await prisma.product.findFirst({
      where: { id: item.productId, storeId, status: 'ACTIVE' },
      select: { id: true, slug: true, price: true, stock: true },
    });
    if (!product) throw new AppError('Product not found in this store', 404);

    let unitPrice = Number(product.price);
    let availableStock = product.stock;
    if (item.variantId) {
      const variant = await prisma.productVariant.findFirst({
        where: { id: item.variantId, productId: product.id, isActive: true },
        select: { price: true, stock: true },
      });
      if (!variant) throw new AppError('Product variant not found', 404);
      unitPrice = Number(variant.price);
      availableStock = variant.stock;
    }

    const existing = await prisma.cartItem.findFirst({
      where: {
        customerId,
        storeId,
        productId: item.productId,
        variantId: item.variantId ?? null,
      },
    });
    const quantity = (existing?.quantity ?? 0) + item.quantity;
    if (quantity > availableStock) {
      throw new AppError('Requested quantity exceeds available stock', 409);
    }

    const cartItem = existing
      ? await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity, unitPrice },
      })
      : await prisma.cartItem.create({
        data: {
          customerId,
          storeId,
          productId: product.id,
          productSlug: product.slug,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice,
        },
      });

    logger.info(`Item added to cart: ${customerId}/${product.id}`);
    return cartItem;
  }

  async getCartAtId(cartItemId: string) {
    const item = await prisma.cartItem.findUnique({ where: { id: cartItemId } });
    if (!item) throw new AppError('Cart item not found', 404);
    return item;
  }

  async removeFromCart(cartItemId: string) {
    await this.getCartAtId(cartItemId);
    await prisma.cartItem.delete({ where: { id: cartItemId } });
    return { success: true };
  }

  async updateCartItemQuantity(cartItemId: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      throw new AppError('Quantity must be an integer between 1 and 999', 400);
    }

    const cartItem = await this.getCartAtId(cartItemId);
    const product = await prisma.product.findUnique({
      where: { id: cartItem.productId },
      select: { stock: true },
    });
    const variant = cartItem.variantId
      ? await prisma.productVariant.findUnique({
        where: { id: cartItem.variantId },
        select: { stock: true },
      })
      : null;
    const availableStock = variant?.stock ?? product?.stock ?? 0;
    if (quantity > availableStock) {
      throw new AppError('Requested quantity exceeds available stock', 409);
    }

    return prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity },
    });
  }

  async clearCart(customerId: string, storeId?: string) {
    await prisma.cartItem.deleteMany({
      where: { customerId, ...(storeId ? { storeId } : {}) },
    });
    return { success: true };
  }

  async verifyCartItems(items: CartItemInput[]) {
    if (items.length === 0) return true;
    if (items.some((item) =>
      !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999
    )) return false;

    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, status: 'ACTIVE' },
      select: { id: true, storeId: true, stock: true },
    });
    if (products.length !== productIds.length) return false;

    const productById = new Map(products.map((product) => [product.id, product]));
    return items.every((item) => {
      const product = productById.get(item.productId);
      return product !== undefined && item.quantity <= product.stock;
    });
  }
}

export const cartService = new CartService();
