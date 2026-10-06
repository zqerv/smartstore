require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const BASE_URL = process.env.SMARTSTORE_API_URL || 'http://localhost:5000';
const db = new PrismaClient();
const ADMIN_EMAIL = process.env.SMARTSTORE_TEST_ADMIN_EMAIL || 'admin@smartstore.demo';
const ADMIN_PASSWORD = process.env.SMARTSTORE_TEST_ADMIN_PASSWORD || 'Admin123!';
const CUSTOMER_EMAIL = process.env.SMARTSTORE_TEST_CUSTOMER_EMAIL || 'customer@demo.com';
const CUSTOMER_PASSWORD = process.env.SMARTSTORE_TEST_CUSTOMER_PASSWORD || 'Customer123!';
const OWNER_EMAIL = process.env.SMARTSTORE_TEST_OWNER_EMAIL || 'owner@demo.com';
const OWNER_PASSWORD = process.env.SMARTSTORE_TEST_OWNER_PASSWORD || 'Owner123!';

async function request(path, { method = 'GET', token, guestToken, body } = {}) {
  const response = await fetch(new URL(path, BASE_URL), {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(guestToken ? { 'X-Guest-Cart-Token': guestToken } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, payload };
}

function assertStatus(result, expected, label) {
  if (result.status !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, got ${result.status}; response: ${JSON.stringify(result.payload)}`);
  }
  console.log(`✓ ${label} (${result.status})`);
}

function data(result) {
  return result.payload?.data;
}

async function login(email, password, label) {
  const result = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  assertStatus(result, 200, `${label} login`);
  const value = data(result);
  if (!value?.token || !value?.user?.id) throw new Error(`${label} login response is incomplete`);
  return value;
}

async function run() {
  if (process.env.SMARTSTORE_ALLOW_MUTATION_TESTS !== 'true') {
    throw new Error('Set SMARTSTORE_ALLOW_MUTATION_TESTS=true to run tests that create and clean up isolated test records.');
  }

  const created = {
    categoryId: null,
    productId: null,
    variantId: null,
    couponId: null,
    zoneId: null,
    addressId: null,
    orderIds: [],
    tableIds: [],
    isolationStoreId: null,
    customerId: null,
    storeId: null,
    guestCartId: null,
    guestUserId: null,
  };

  try {
    console.log(`Running isolated commerce integration tests against ${BASE_URL}`);
    const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD, 'Platform administrator');
    const owner = await login(OWNER_EMAIL, OWNER_PASSWORD, 'Store owner');
    const customer = await login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD, 'Customer');
    created.customerId = customer.user.id;

    const stores = await request('/api/stores/public');
    assertStatus(stores, 200, 'Public store discovery');
    created.storeId = (Array.isArray(data(stores)) ? data(stores) : data(stores)?.stores)
      ?.find((store) => store.slug === 'demo')?.id;
    if (!created.storeId) throw new Error('The active demo store was not found');

    const storeOwner = await request(`/api/stores/${encodeURIComponent(created.storeId)}/info`);
    assertStatus(storeOwner, 200, 'Public store settings and branding');
    const categoriesBefore = await request(`/api/stores/${encodeURIComponent(created.storeId)}/categories?activeOnly=true`);
    assertStatus(categoriesBefore, 200, 'Anonymous active category listing');

    const platformDenied = await request('/api/platform/stores', { token: customer.token });
    assertStatus(platformDenied, 403, 'Customer is denied platform administration');

    const customerCart = await request(`/api/customers/${encodeURIComponent(customer.user.id)}/cart?storeId=${encodeURIComponent(created.storeId)}`, { token: customer.token });
    assertStatus(customerCart, 200, 'Customer cart before test');
    if (data(customerCart)?.items?.length) {
      throw new Error('Mutation test aborted to preserve the customer’s existing cart');
    }

    created.isolationStoreId = (await db.store.create({
      data: {
        name: 'Temporary isolation test store',
        slug: `isolation-test-${Date.now().toString(36)}`,
        status: 'ACTIVE',
      },
      select: { id: true },
    })).id;
    const deniedStore = await request(`/api/stores/${encodeURIComponent(created.isolationStoreId)}/products`, { token: customer.token });
    assertStatus(deniedStore, 403, 'Customer is denied access to an unjoined store');
    const adminStore = await request(`/api/stores/${encodeURIComponent(created.isolationStoreId)}/products`, { token: admin.token });
    assertStatus(adminStore, 200, 'Platform administrator can access any store catalog');
    const storeSettings = await request(`/api/stores/${encodeURIComponent(created.isolationStoreId)}/settings`, {
      method: 'PUT',
      token: admin.token,
      body: { name: 'Temporary settings test store', defaultCurrency: 'IQD', locale: 'ar-IQ', dir: 'rtl' },
    });
    assertStatus(storeSettings, 200, 'Update store settings');
    if (data(storeSettings)?.name !== 'Temporary settings test store') throw new Error('Store settings update was not persisted');
    const storeBranding = await request(`/api/stores/${encodeURIComponent(created.isolationStoreId)}/branding`, {
      method: 'PUT',
      token: admin.token,
      body: { logo: 'https://example.invalid/smartstore-test.svg', primaryColor: '#123456', secondaryColor: '#654321' },
    });
    assertStatus(storeBranding, 200, 'Update store branding');
    if (data(storeBranding)?.primaryColor !== '#123456') throw new Error('Store branding update was not persisted');

    const category = await request(`/api/stores/${encodeURIComponent(created.storeId)}/categories`, {
      method: 'POST',
      token: owner.token,
      body: { nameAr: 'فئة اختبار التكامل', nameEn: `Integration ${Date.now()}` },
    });
    assertStatus(category, 201, 'Create category');
    created.categoryId = data(category)?.id;
    if (!created.categoryId) throw new Error('Category creation did not return an ID');

    const categoryUpdated = await request(`/api/categories/${encodeURIComponent(created.categoryId)}`, {
      method: 'PUT',
      token: owner.token,
      body: { nameAr: 'فئة اختبار محدثة' },
    });
    assertStatus(categoryUpdated, 200, 'Update category');

    const product = await request(`/api/stores/${encodeURIComponent(created.storeId)}/products`, {
      method: 'POST',
      token: owner.token,
      body: {
        categoryId: created.categoryId,
        nameAr: 'منتج اختبار التكامل',
        nameEn: `Integration Product ${Date.now()}`,
        price: 20,
        stock: 5,
      },
    });
    assertStatus(product, 201, 'Create product');
    created.productId = data(product)?.id;
    if (!created.productId) throw new Error('Product creation did not return an ID');

    const productUpdated = await request(`/api/products/${encodeURIComponent(created.productId)}`, {
      method: 'PUT',
      token: owner.token,
      body: { nameAr: 'منتج اختبار محدث', price: 20, stock: 5, status: 'ACTIVE' },
    });
    assertStatus(productUpdated, 200, 'Update product');
    const productPublic = await request(`/api/products/${encodeURIComponent(created.productId)}`);
    assertStatus(productPublic, 200, 'Public active product details');

    const draft = await request(`/api/products/${encodeURIComponent(created.productId)}`, {
      method: 'PUT',
      token: owner.token,
      body: { status: 'DRAFT' },
    });
    assertStatus(draft, 200, 'Set product to draft');
    const hiddenDraft = await request(`/api/products/${encodeURIComponent(created.productId)}`);
    assertStatus(hiddenDraft, 404, 'Anonymous users cannot read draft product details');
    const activeAgain = await request(`/api/products/${encodeURIComponent(created.productId)}`, {
      method: 'PUT',
      token: owner.token,
      body: { status: 'ACTIVE' },
    });
    assertStatus(activeAgain, 200, 'Republish product');

    const guestCart = await request('/api/guest-cart', {
      method: 'POST',
      body: { storeId: created.storeId },
    });
    assertStatus(guestCart, 201, 'Create public guest cart');
    assertStatus(await request(`/api/stores/${encodeURIComponent(created.storeId)}/zones`), 200, 'List active delivery zones anonymously');
    const guestSession = data(guestCart);
    created.guestCartId = guestSession?.cartId;
    if (!created.guestCartId || !/^[a-f0-9]{64}$/i.test(guestSession.token)) {
      throw new Error('Guest cart did not return its one-time session token');
    }
    const storedGuestCart = await db.guestCart.findUnique({
      where: { id: created.guestCartId },
      select: { tokenHash: true },
    });
    if (
      !storedGuestCart ||
      storedGuestCart.tokenHash !== require('crypto').createHash('sha256').update(guestSession.token).digest('hex')
    ) {
      throw new Error('Guest cart did not store only the SHA-256 token hash');
    }
    const guestAdded = await request(`/api/guest-cart/${encodeURIComponent(created.guestCartId)}/items`, {
      method: 'POST',
      guestToken: guestSession.token,
      body: { productId: created.productId, quantity: 1 },
    });
    assertStatus(guestAdded, 201, 'Add product to guest cart without login');
    assertStatus(await request(`/api/guest-cart/${encodeURIComponent(created.guestCartId)}/items`, {
      method: 'POST',
      guestToken: guestSession.token,
      body: { productId: created.productId, quantity: 5 },
    }), 409, 'Reject guest-cart quantity above available stock');
    const guestItemId = data(guestAdded)?.items?.[0]?.id;
    if (!guestItemId) throw new Error('Guest cart item was not returned');
    const guestCartRead = await request(`/api/guest-cart/${encodeURIComponent(created.guestCartId)}`, {
      guestToken: guestSession.token,
    });
    assertStatus(guestCartRead, 200, 'Read authorized guest cart');
    if (data(guestCartRead)?.items?.[0]?.unitPrice !== 20) {
      throw new Error('Guest cart did not use the current server product price');
    }
    assertStatus(await request(`/api/guest-cart/${encodeURIComponent(created.guestCartId)}`, {
      guestToken: '0'.repeat(64),
    }), 404, 'Reject an invalid guest-cart token');
    assertStatus(await request(`/api/guest-cart/${encodeURIComponent(created.guestCartId)}/items/${encodeURIComponent(guestItemId)}`, {
      method: 'PUT',
      guestToken: guestSession.token,
      body: { quantity: 2 },
    }), 200, 'Update guest-cart quantity with token');
    assertStatus(await request(`/api/guest-cart/${encodeURIComponent(created.guestCartId)}/items/${encodeURIComponent(guestItemId)}`, {
      method: 'DELETE',
      guestToken: guestSession.token,
    }), 200, 'Remove guest-cart item with token');
    const guestReadded = await request(`/api/guest-cart/${encodeURIComponent(created.guestCartId)}/items`, {
      method: 'POST',
      guestToken: guestSession.token,
      body: { productId: created.productId, quantity: 1 },
    });
    assertStatus(guestReadded, 201, 'Re-add guest-cart item');
    const guestTotal = await request(`/api/guest-cart/${encodeURIComponent(created.guestCartId)}/total`, {
      guestToken: guestSession.token,
    });
    assertStatus(guestTotal, 200, 'Read token-protected guest-cart total');
    if (Number(data(guestTotal)?.subtotal) !== 20) throw new Error('Guest-cart total did not match current item price');

    const guestCheckout = await request('/api/guest/checkout', {
      method: 'POST',
      body: {
        guestToken: guestSession.token,
        customerName: 'Guest Integration Test',
        customerPhone: '+964700000002',
        deliveryAddress: 'Guest Test Street 2, Test City',
        deliveryNotes: 'Call on arrival',
        requestedAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        paymentMethod: 'CASH_ON_DELIVERY',
      },
    });
    assertStatus(guestCheckout, 201, 'Place guest order without registration');
    const guestOrder = data(guestCheckout);
    if (!guestOrder?.orderNumber || !/^[a-f0-9]{64}$/i.test(guestOrder.trackingToken)) {
      throw new Error('Guest checkout did not return the order number and tracking token');
    }
    if ('id' in guestOrder || 'customerId' in guestOrder || 'accessTokenHash' in guestOrder) {
      throw new Error('Guest checkout exposed internal order or customer fields');
    }
    const guestOrderRecord = await db.order.findUnique({
      where: { orderNumber: guestOrder.orderNumber },
      select: {
        id: true,
        customerId: true,
        userId: true,
        isGuest: true,
        accessTokenHash: true,
        customerName: true,
        customerPhone: true,
      },
    });
    if (
      !guestOrderRecord?.isGuest ||
      guestOrderRecord.userId !== null ||
      guestOrderRecord.customerName !== 'Guest Integration Test' ||
      guestOrderRecord.customerPhone !== '+964700000002' ||
      guestOrderRecord.accessTokenHash !== require('crypto').createHash('sha256').update(guestOrder.trackingToken).digest('hex')
    ) {
      throw new Error('Guest order did not persist guest/contact/token data safely');
    }
    created.orderIds.push(guestOrderRecord.id);
    created.guestUserId = guestOrderRecord.customerId;
    const trackedGuestOrder = await request(`/api/orders/track/${encodeURIComponent(guestOrder.trackingToken)}`);
    assertStatus(trackedGuestOrder, 200, 'Track guest order using its secret token');
    const safeTrackedOrder = data(trackedGuestOrder);
    if (
      safeTrackedOrder?.customerName !== 'Guest Integration Test' ||
      safeTrackedOrder?.customerPhone !== '+964700000002' ||
      safeTrackedOrder?.deliveryAddress !== 'Guest Test Street 2, Test City' ||
      !safeTrackedOrder?.statusHistory?.length ||
      'id' in safeTrackedOrder ||
      'storeId' in safeTrackedOrder ||
      'accessTokenHash' in safeTrackedOrder
    ) {
      throw new Error('Guest tracking returned incomplete or sensitive order data');
    }
    assertStatus(await request(`/api/orders/track/${encodeURIComponent('0'.repeat(64))}`), 404, 'Reject unknown guest tracking token');

    const ordersBeforeUnsupportedPayment = await db.order.count({ where: { storeId: created.storeId } });
    const productBeforeUnsupportedPayment = await db.product.findUnique({
      where: { id: created.productId },
      select: { stock: true },
    });
    const unsupportedPayment = await request('/api/orders/checkout', {
      method: 'POST',
      token: customer.token,
      body: {
        customerId: customer.user.id,
        storeId: created.storeId,
        items: [{ productId: created.productId, quantity: 1 }],
        paymentMethod: 'ONLINE_PAYMENT',
      },
    });
    assertStatus(unsupportedPayment, 501, 'Reject unsupported online payment');
    const ordersAfterUnsupportedPayment = await db.order.count({ where: { storeId: created.storeId } });
    const productAfterUnsupportedPayment = await db.product.findUnique({
      where: { id: created.productId },
      select: { stock: true },
    });
    if (
      ordersAfterUnsupportedPayment !== ordersBeforeUnsupportedPayment ||
      productAfterUnsupportedPayment?.stock !== productBeforeUnsupportedPayment?.stock
    ) {
      throw new Error('Unsupported payment changed persisted orders or product stock');
    }

    const address = await request(`/api/customers/${encodeURIComponent(customer.user.id)}/addresses`, {
      method: 'POST',
      token: customer.token,
      body: {
        storeId: created.storeId,
        customerName: 'Integration Test',
        phone: '+964700000001',
        addressLine1: 'Test Street 1',
        city: 'Test City',
        isDefault: false,
      },
    });
    assertStatus(address, 201, 'Create customer address');
    created.addressId = data(address)?.id;
    if (!created.addressId) throw new Error('Address creation did not return an ID');
    const addressUpdated = await request(`/api/customers/${encodeURIComponent(customer.user.id)}/addresses/${encodeURIComponent(created.addressId)}`, {
      method: 'PUT',
      token: customer.token,
      body: {
        storeId: created.storeId,
        customerName: 'Integration Test',
        phone: '+964700000001',
        addressLine1: 'Updated Test Street 1',
        city: 'Test City',
      },
    });
    assertStatus(addressUpdated, 200, 'Update customer address');

    const zone = await request(`/api/stores/${encodeURIComponent(created.storeId)}/zones`, {
      method: 'POST',
      token: owner.token,
      body: { city: 'Test City', area: 'Test Area', deliveryFee: 100, minimumOrder: 0, estDeliveryDays: 2 },
    });
    assertStatus(zone, 201, 'Create delivery zone');
    created.zoneId = data(zone)?.id;
    if (!created.zoneId) throw new Error('Delivery zone creation did not return an ID');
    const quote = await request(`/api/stores/${encodeURIComponent(created.storeId)}/calculate-fee`, {
      method: 'POST',
      token: customer.token,
      body: { weight: 1, amount: 40, city: 'Test City', area: 'Test Area' },
    });
    assertStatus(quote, 200, 'Calculate delivery fee');
    if (Number(data(quote)?.fee) !== 100) throw new Error('Delivery fee quote did not use the persisted zone fee');

    const variant = await request(`/api/products/${encodeURIComponent(created.productId)}/variants`, {
      method: 'POST',
      token: owner.token,
      body: {
        name: 'Small size',
        sku: `VAR-${Date.now()}`,
        price: 22,
        stock: 5,
        options: 'size:S',
        zoneId: created.zoneId,
      },
    });
    assertStatus(variant, 201, 'Create product variant');
    created.variantId = data(variant)?.id;
    if (!created.variantId) throw new Error('Variant creation did not return an ID');
    const variantUpdated = await request(`/api/products/${encodeURIComponent(created.productId)}/variants/${encodeURIComponent(created.variantId)}`, {
      method: 'PUT',
      token: owner.token,
      body: { name: 'Small size updated', sku: data(variant).sku, price: 22, stock: 5, options: 'size:S', zoneId: created.zoneId },
    });
    assertStatus(variantUpdated, 200, 'Update product variant');
    const variants = await request(`/api/products/${encodeURIComponent(created.productId)}/variants`, { token: owner.token });
    assertStatus(variants, 200, 'List product variants');
    if (data(variants)?.variants?.length !== 1) throw new Error('Product variant listing returned an unexpected result');

    const couponCode = `T${Date.now().toString(36).slice(-7).toUpperCase()}`;
    const coupon = await request(`/api/stores/${encodeURIComponent(created.storeId)}/coupons`, {
      method: 'POST',
      token: owner.token,
      body: { code: couponCode, type: 'PERCENTAGE', value: 10, minOrderValue: 0, maxUses: 2 },
    });
    assertStatus(coupon, 201, 'Create coupon');
    created.couponId = data(coupon)?.id;
    if (!created.couponId) throw new Error('Coupon creation did not return an ID');
    const couponQuote = await request('/api/coupons/apply', {
      method: 'POST',
      token: customer.token,
      body: { couponCode, storeId: created.storeId, orderTotal: 40 },
    });
    assertStatus(couponQuote, 200, 'Validate coupon for customer');
    if (Number(data(couponQuote)?.discountAmount) !== 4) throw new Error('Coupon quote returned an incorrect discount');

    const TABLES = process.env.ENABLE_TABLE_ORDERING === 'true';
    let table1; let table2;
    const tableNumber = `T${Date.now().toString(36).slice(-6)}`;
    if (TABLES) {
    const tableRes = await request(`/api/stores/${encodeURIComponent(created.storeId)}/tables`, {
      method: 'POST', token: owner.token, body: { number: tableNumber, label: 'Test table' },
    });
    assertStatus(tableRes, 201, 'Create table');
    table1 = data(tableRes);
    created.tableIds.push(table1.id);
    const tableRes2 = await request(`/api/stores/${encodeURIComponent(created.storeId)}/tables`, {
      method: 'POST', token: owner.token, body: { number: `${tableNumber}B` },
    });
    assertStatus(tableRes2, 201, 'Create second table');
    table2 = data(tableRes2);
    created.tableIds.push(table2.id);
    assertStatus(await request(`/api/stores/${encodeURIComponent(created.storeId)}/tables`, {
      method: 'POST', token: owner.token, body: { number: tableNumber },
    }), 409, 'Reject duplicate table number');
    assertStatus(await request(`/api/stores/${encodeURIComponent(created.storeId)}/tables`, {
      method: 'POST', token: customer.token, body: { number: 'X1' },
    }), 403, 'Customer cannot create tables');
    const qrLookup = await request(`/api/tables/qr/${encodeURIComponent(table1.qrCode)}`);
    assertStatus(qrLookup, 200, 'Public QR lookup');
    if (data(qrLookup)?.table?.number !== tableNumber || data(qrLookup)?.store?.id !== created.storeId) {
      throw new Error('QR lookup returned the wrong table/store');
    }
    assertStatus(await request(`/api/tables/qr/does-not-exist`), 404, 'Unknown QR code');
    }

    async function placeOrder(tableId) {
      const added = await request(`/api/customers/${encodeURIComponent(customer.user.id)}/cart/items`, {
        method: 'POST',
        token: customer.token,
        body: { productId: created.productId, variantId: created.variantId, quantity: 2, storeId: created.storeId },
      });
      assertStatus(added, 201, 'Add product to cart');
      const cartItemId = data(added)?.id;
      const changedQuantity = await request(`/api/cart/items/${encodeURIComponent(cartItemId)}`, {
        method: 'PUT',
        token: customer.token,
        body: { quantity: 2 },
      });
      assertStatus(changedQuantity, 200, 'Update cart quantity');
      const checkout = await request('/api/orders/checkout', {
        method: 'POST',
        token: customer.token,
        body: {
          customerId: customer.user.id,
          storeId: created.storeId,
          items: [{ productId: created.productId, variantId: created.variantId, quantity: 2 }],
          deliveryZoneId: created.zoneId,
          deliveryAddress: 'Updated Test Street 1, Test City',
          couponCode,
          paymentMethod: 'CASH_ON_DELIVERY',
          ...(tableId ? { tableId } : {}),
        },
      });
      assertStatus(checkout, 201, 'Checkout and create order');
      const order = data(checkout);
      if (!order?.id) throw new Error('Checkout did not return an order ID');
      created.orderIds.push(order.id);
      const cleared = await request(`/api/customers/${encodeURIComponent(customer.user.id)}/cart?storeId=${encodeURIComponent(created.storeId)}`, { token: customer.token });
      assertStatus(cleared, 200, 'Read cart after checkout');
      if (data(cleared)?.items?.length) throw new Error('Checkout did not clear this store cart');
      return order;
    }

    const firstOrder = await placeOrder();
    const firstUsage = await db.couponUsage.findFirst({ where: { orderId: firstOrder.id } });
    const firstCouponState = await db.coupon.findUnique({ where: { id: created.couponId } });
    if (!firstUsage || firstCouponState.usedCount !== 1) throw new Error('Checkout did not persist coupon redemption history');
    const merchantOrders = await request(`/api/stores/${encodeURIComponent(created.storeId)}/orders`, { token: owner.token });
    assertStatus(merchantOrders, 200, 'Merchant order listing');
    const liveReport = await request(`/api/stores/${encodeURIComponent(created.storeId)}/reports?days=1`, { token: owner.token });
    assertStatus(liveReport, 200, 'Report includes the new order');
    const expectedRevenue = Number(firstOrder.total);
    if (data(liveReport).totals.orders < 1 || data(liveReport).totals.pending < 1 || data(liveReport).totals.revenue < expectedRevenue) {
      throw new Error(`Report does not reflect the new order: ${JSON.stringify(data(liveReport).totals)}`);
    }
    if (!data(liveReport).topProducts.length) throw new Error('Report top products is empty despite an order');

    const confirmed = await request(`/api/orders/${encodeURIComponent(firstOrder.id)}/status`, {
      method: 'PATCH',
      token: owner.token,
      body: { status: 'CONFIRMED' },
    });
    assertStatus(confirmed, 200, 'Advance order through valid status transition');
    const invalidTransition = await request(`/api/orders/${encodeURIComponent(firstOrder.id)}/status`, {
      method: 'PATCH',
      token: owner.token,
      body: { status: 'DELIVERED' },
    });
    assertStatus(invalidTransition, 409, 'Reject skipped order status transition');
    const cancelled = await request(`/api/orders/${encodeURIComponent(firstOrder.id)}/cancel`, {
      method: 'PATCH',
      token: customer.token,
      body: { reason: 'Integration test cleanup' },
    });
    assertStatus(cancelled, 200, 'Customer cancels own order');
    const releasedCoupon = await db.coupon.findUnique({ where: { id: created.couponId } });
    const retainedUsage = await db.couponUsage.findFirst({ where: { couponId: created.couponId, orderId: null } });
    if (releasedCoupon.usedCount !== 0 || !retainedUsage) {
      throw new Error('Order cancellation did not release coupon quota while retaining usage history');
    }

    const secondOrder = await placeOrder(TABLES ? table1.id : undefined);
    if (TABLES) {
    const stored = await db.order.findUnique({ where: { id: secondOrder.id }, select: { tableId: true } });
    if (stored?.tableId !== table1.id) throw new Error('Checkout did not persist the table');
    const moved = await request(`/api/orders/${encodeURIComponent(secondOrder.id)}/table`, {
      method: 'PATCH', token: customer.token, body: { tableId: table2.id },
    });
    assertStatus(moved, 200, 'Customer changes table');
    if (data(moved)?.table?.id !== table2.id) throw new Error('Change table did not update the order');
    const movedByStaff = await request(`/api/orders/${encodeURIComponent(secondOrder.id)}/table`, {
      method: 'PATCH', token: owner.token, body: { tableId: table1.id },
    });
    assertStatus(movedByStaff, 200, 'Merchant changes table');
    const isoOwner = await request(`/api/orders/${encodeURIComponent(secondOrder.id)}/table`, {
      method: 'PATCH', token: owner.token, body: { tableId: 'ckxxxxxxxxxxxxxxxxxxxxxxx' },
    });
    assertStatus(isoOwner, 404, 'Reject unknown table for change');
    const archivedTable = await request(`/api/tables/${encodeURIComponent(table2.id)}`, { method: 'DELETE', token: owner.token });
    assertStatus(archivedTable, 200, 'Archive table');
    assertStatus(await request(`/api/orders/${encodeURIComponent(secondOrder.id)}/table`, {
      method: 'PATCH', token: customer.token, body: { tableId: table2.id },
    }), 404, 'Cannot move order to archived table');
    assertStatus(await request('/api/orders/checkout', {
      method: 'POST', token: customer.token,
      body: { customerId: customer.user.id, storeId: created.storeId, items: [{ productId: created.productId, variantId: created.variantId, quantity: 1 }], deliveryZoneId: created.zoneId, deliveryAddress: 'x street test', paymentMethod: 'CASH_ON_DELIVERY', tableId: table2.id },
    }), 404, 'Checkout rejects archived table');
    }
    const useCount = await db.couponUsage.count({ where: { couponId: created.couponId } });
    if (useCount !== 2) throw new Error('Coupon could not be redeemed again after cancellation');
    const secondCancellation = await request(`/api/orders/${encodeURIComponent(secondOrder.id)}/cancel`, {
      method: 'PATCH',
      token: customer.token,
      body: { reason: 'Integration test cleanup' },
    });
    assertStatus(secondCancellation, 200, 'Cancel repeated coupon redemption');
    const restoredVariant = await db.productVariant.findUnique({ where: { id: created.variantId } });
    if (restoredVariant.stock !== 5) throw new Error('Order cancellation did not restore variant stock');

    const archivedVariant = await request(`/api/products/${encodeURIComponent(created.productId)}/variants/${encodeURIComponent(created.variantId)}`, {
      method: 'DELETE',
      token: owner.token,
    });
    assertStatus(archivedVariant, 200, 'Archive product variant');
    const deletedProduct = await request(`/api/products/${encodeURIComponent(created.productId)}`, {
      method: 'DELETE',
      token: owner.token,
    });
    assertStatus(deletedProduct, 200, 'Archive product');
    const deletedCategory = await request(`/api/categories/${encodeURIComponent(created.categoryId)}`, {
      method: 'DELETE',
      token: owner.token,
    });
    assertStatus(deletedCategory, 200, 'Archive category');
    console.log('All commerce mutation tests passed.');
  } finally {
    try {
      await db.$transaction(async (tx) => {
        for (const orderId of created.orderIds) {
          const order = await tx.order.findUnique({
            where: { id: orderId },
            include: { items: true },
          });
          if (!order) continue;
          if (!['CANCELLED', 'DELIVERED'].includes(order.status)) {
            for (const item of order.items) {
              if (item.variantId) {
                await tx.productVariant.updateMany({
                  where: { id: item.variantId },
                  data: { stock: { increment: item.quantity } },
                });
              } else {
                await tx.product.updateMany({
                  where: { id: item.productId },
                  data: { stock: { increment: item.quantity } },
                });
              }
            }
          }
          await tx.order.delete({ where: { id: orderId } });
        }
        if (created.tableIds.length) await tx.storeTable.deleteMany({ where: { id: { in: created.tableIds } } });
        if (created.couponId) {
          await tx.couponUsage.deleteMany({ where: { couponId: created.couponId } });
          await tx.coupon.deleteMany({ where: { id: created.couponId } });
        }
        if (created.customerId && created.storeId && created.productId) {
          await tx.cartItem.deleteMany({
            where: {
              customerId: created.customerId,
              storeId: created.storeId,
              productId: created.productId,
            },
          });
        }
        if (created.guestCartId) await tx.guestCart.deleteMany({ where: { id: created.guestCartId } });
        if (created.guestUserId) await tx.user.deleteMany({ where: { id: created.guestUserId } });
        if (created.productId) await tx.product.deleteMany({ where: { id: created.productId } });
        if (created.categoryId) await tx.category.deleteMany({ where: { id: created.categoryId } });
        if (created.zoneId) await tx.deliveryZone.deleteMany({ where: { id: created.zoneId } });
        if (created.addressId) await tx.customerAddress.deleteMany({ where: { id: created.addressId } });
        if (created.isolationStoreId) await tx.store.deleteMany({ where: { id: created.isolationStoreId } });
      });
      console.log('Temporary test records cleaned up.');
    } catch (cleanupError) {
      console.error(`TEST_CLEANUP_FAILED=${cleanupError.message}`);
      process.exitCode = 1;
    }
    await db.$disconnect();
  }
}

run().catch((error) => {
  console.error(`Commerce integration tests failed: ${error.message}`);
  process.exitCode = 1;
});
