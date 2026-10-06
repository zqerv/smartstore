const BASE_URL = process.env.SMARTSTORE_API_URL || 'http://localhost:5000';
const ADMIN_EMAIL = process.env.SMARTSTORE_TEST_ADMIN_EMAIL || 'admin@smartstore.demo';
const ADMIN_PASSWORD = process.env.SMARTSTORE_TEST_ADMIN_PASSWORD || 'Admin123!';
const CUSTOMER_EMAIL = process.env.SMARTSTORE_TEST_CUSTOMER_EMAIL || 'customer@demo.com';
const CUSTOMER_PASSWORD = process.env.SMARTSTORE_TEST_CUSTOMER_PASSWORD || 'Customer123!';
const OWNER_EMAIL = process.env.SMARTSTORE_TEST_OWNER_EMAIL || 'owner@demo.com';
const OWNER_PASSWORD = process.env.SMARTSTORE_TEST_OWNER_PASSWORD || 'Owner123!';

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(new URL(path, BASE_URL), {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
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

async function runTests() {
  console.log(`Running SmartStore API smoke tests against ${BASE_URL}\n`);

  const health = await request('/health');
  assertStatus(health, 200, 'Health endpoint');

  const root = await request('/');
  assertStatus(root, 200, 'Root endpoint');

  const anonymousStores = await request('/api/stores');
  assertStatus(anonymousStores, 401, 'Protected store listing rejects anonymous access');

  const anonymousProfile = await request('/api/auth/me');
  assertStatus(anonymousProfile, 401, 'Profile endpoint rejects anonymous access');

  const invalidToken = await request('/api/auth/me', { token: 'not-a-valid-token' });
  assertStatus(invalidToken, 401, 'Profile endpoint rejects invalid tokens');

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  assertStatus(login, 200, 'Demo platform administrator login');

  const token = login.payload?.data?.token;
  if (!token) {
    throw new Error('Login response did not include data.token');
  }

  const profile = await request('/api/auth/me', { token });
  assertStatus(profile, 200, 'Authenticated profile');
  if (profile.payload?.data?.role !== 'PLATFORM_ADMIN') {
    throw new Error('Smoke-test account is not a platform administrator');
  }

  const stores = await request('/api/platform/stores', { token });
  assertStatus(stores, 200, 'Platform store listing');

  const stats = await request('/api/platform/stats', { token });
  assertStatus(stats, 200, 'Platform statistics');

  const publicStores = await request('/api/stores/public');
  assertStatus(publicStores, 200, 'Public store discovery');
  const storesData = publicStores.payload?.data;
  const storesList = Array.isArray(storesData) ? storesData : storesData?.stores;
  const demoStore = storesList?.find((store) => store.slug === 'demo') || storesList?.[0];
  if (!demoStore?.id) {
    throw new Error('Public store discovery did not return a store ID');
  }

  const products = await request(`/api/stores/${encodeURIComponent(demoStore.id)}/products`);
  assertStatus(products, 200, 'Public active product catalog');

  const ownerLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
  });
  assertStatus(ownerLogin, 200, 'Demo store owner login');
  const ownerToken = ownerLogin.payload?.data?.token;
  if (!ownerToken) {
    throw new Error('Owner login response did not include data.token');
  }

  for (const [path, label] of [
    [`/api/stores/${encodeURIComponent(demoStore.id)}/stats`, 'Store statistics'],
    [`/api/stores/${encodeURIComponent(demoStore.id)}/products?status=ALL`, 'Merchant product listing'],
    [`/api/stores/${encodeURIComponent(demoStore.id)}/categories`, 'Merchant category listing'],
    [`/api/stores/${encodeURIComponent(demoStore.id)}/customers`, 'Store customer listing'],
    [`/api/stores/${encodeURIComponent(demoStore.id)}/staff`, 'Store staff listing'],
  ]) {
    const result = await request(path, { token: ownerToken });
    assertStatus(result, 200, label);
  }

  const customerLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: CUSTOMER_EMAIL, password: CUSTOMER_PASSWORD },
  });
  assertStatus(customerLogin, 200, 'Demo customer login');
  const customerToken = customerLogin.payload?.data?.token;
  const customerId = customerLogin.payload?.data?.user?.id;
  if (!customerToken || !customerId) {
    throw new Error('Customer login response did not include data.user.id and data.token');
  }

  const customerProfile = await request(`/api/customers/${encodeURIComponent(customerId)}/profile`, {
    token: customerToken,
  });
  assertStatus(customerProfile, 200, 'Customer reads own profile');

  const customerOrders = await request(`/api/customers/${encodeURIComponent(customerId)}/orders`, {
    token: customerToken,
  });
  assertStatus(customerOrders, 200, 'Customer reads own order history');

  const customerCart = await request(`/api/customers/${encodeURIComponent(customerId)}/cart?storeId=${encodeURIComponent(demoStore.id)}`, {
    token: customerToken,
  });
  assertStatus(customerCart, 200, 'Customer reads own store cart');

  const customerAddresses = await request(`/api/customers/${encodeURIComponent(customerId)}/addresses?storeId=${encodeURIComponent(demoStore.id)}`, {
    token: customerToken,
  });
  assertStatus(customerAddresses, 200, 'Customer reads own store addresses');

  const emptyCheckout = await request('/api/orders/checkout', {
    method: 'POST',
    token: customerToken,
    body: {
      customerId,
      storeId: demoStore.id,
      items: [],
      paymentMethod: 'CASH_ON_DELIVERY',
    },
  });
  assertStatus(emptyCheckout, 400, 'Checkout rejects an empty order without creating a record');

  const otherCustomerProfile = await request(`/api/customers/${encodeURIComponent(profile.payload.data.id)}/profile`, {
    token: customerToken,
  });
  assertStatus(otherCustomerProfile, 403, 'Customer cannot read another account profile');

  const zones = await request(`/api/stores/${encodeURIComponent(demoStore.id)}/zones`, {
    token: customerToken,
  });
  assertStatus(zones, 200, 'Customer reads active zones for a joined store');

  const otherStore = storesList?.find((store) => store.id !== demoStore.id && store.status === 'ACTIVE');
  if (otherStore) {
    const crossStoreProducts = await request(`/api/stores/${encodeURIComponent(otherStore.id)}/products`, {
      token: customerToken,
    });
    assertStatus(crossStoreProducts, 403, 'Customer cannot access a store they have not joined');
  } else {
    console.log('· Cross-store authorization test skipped: no second active store exists');
  }

  console.log('\nAll API smoke tests passed. No store, customer, or commerce records were created or modified; logins update account lastLoginAt.');
}

runTests().catch((error) => {
  console.error(`API smoke tests failed: ${error.message}`);
  process.exitCode = 1;
});
