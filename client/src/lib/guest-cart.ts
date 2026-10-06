import { ApiError, apiRequest } from './api';

export interface GuestCartItem {
  [key: string]: unknown;
  id: string;
  productId: string;
  productNameAr?: string;
  productNameEn?: string;
  productSlug?: string;
  mainImage?: string;
  quantity: number;
  unitPrice: number;
  total: number;
  variantId?: string;
  variantName?: string;
}

export interface GuestCart {
  id: string;
  storeId: string;
  items: GuestCartItem[];
  subtotal: number;
  total: number;
}

export interface GuestCartSession {
  cartId: string;
  storeId: string;
  token: string;
}

const GUEST_CART_KEY = 'smartstore.guestCart';

export function readGuestCart(): GuestCartSession | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || 'null');
    if (
      parsed &&
      typeof parsed.cartId === 'string' &&
      typeof parsed.storeId === 'string' &&
      typeof parsed.token === 'string' &&
      /^[a-f0-9]{64}$/i.test(parsed.token)
    ) {
      return parsed as GuestCartSession;
    }
  } catch {
    localStorage.removeItem(GUEST_CART_KEY);
  }
  return null;
}

export function writeGuestCart(cartId: string, storeId: string, token: string): void {
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify({ cartId, storeId, token }));
}

export function clearGuestCart(): void {
  localStorage.removeItem(GUEST_CART_KEY);
}

function tokenHeaders(token: string): HeadersInit {
  return { 'X-Guest-Cart-Token': token };
}

function requireSession(cartId: string, storeId?: string): GuestCartSession {
  const session = readGuestCart();
  if (!session || session.cartId !== cartId || (storeId && session.storeId !== storeId)) {
    throw new ApiError('Guest cart session is missing or expired. Please add the item again.', 404);
  }
  return session;
}

export async function createGuestCart(storeId: string): Promise<string> {
  const response = await apiRequest<{ cartId: string; storeId: string; token: string }>(
    '/guest-cart',
    { method: 'POST', anonymous: true, body: JSON.stringify({ storeId }) },
  );
  if (!response.cartId || !response.token) {
    throw new ApiError('The server returned an invalid guest cart session.', 502);
  }
  writeGuestCart(response.cartId, response.storeId, response.token);
  return response.cartId;
}

export async function getGuestCart(cartId: string, token?: string): Promise<GuestCart> {
  const session = requireSession(cartId);
  const cart = await apiRequest<GuestCart>(`/guest-cart/${encodeURIComponent(cartId)}`, {
    anonymous: true,
    headers: tokenHeaders(token || session.token),
  });
  return cart;
}

export async function addToGuestCart(
  cartId: string,
  storeId: string,
  productId: string,
  variantId?: string,
  quantity = 1,
): Promise<GuestCart> {
  const addItem = (session: GuestCartSession) =>
    apiRequest<GuestCart>(`/guest-cart/${encodeURIComponent(session.cartId)}/items`, {
      method: 'POST',
      anonymous: true,
      headers: tokenHeaders(session.token),
      body: JSON.stringify({ productId, variantId, quantity }),
    });
  const session = requireSession(cartId, storeId);
  try {
    return await addItem(session);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404 || !/guest cart not found or expired/i.test(error.message)) {
      throw error;
    }
    clearGuestCart();
    const renewedCartId = await createGuestCart(storeId);
    return addItem(requireSession(renewedCartId, storeId));
  }
}

export async function updateGuestCartItemQuantity(
  cartId: string,
  cartItemId: string,
  quantity: number,
): Promise<GuestCart> {
  const session = requireSession(cartId);
  return apiRequest<GuestCart>(
    `/guest-cart/${encodeURIComponent(cartId)}/items/${encodeURIComponent(cartItemId)}`,
    {
      method: 'PUT',
      anonymous: true,
      headers: tokenHeaders(session.token),
      body: JSON.stringify({ quantity }),
    },
  );
}

export async function removeFromGuestCartItem(cartId: string, cartItemId: string): Promise<GuestCart> {
  const session = requireSession(cartId);
  return apiRequest<GuestCart>(
    `/guest-cart/${encodeURIComponent(cartId)}/items/${encodeURIComponent(cartItemId)}`,
    { method: 'DELETE', anonymous: true, headers: tokenHeaders(session.token) },
  );
}
