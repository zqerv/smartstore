require('dotenv').config();

const { PrismaClient, Prisma } = require('@prisma/client');

const BASE_URL = process.env.SMARTSTORE_API_URL || 'http://localhost:5000';
const db = new PrismaClient();

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(new URL(path, BASE_URL), {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: response.status, payload };
}

function expect(result, status, label) {
  if (result.status !== status) {
    throw new Error(`${label}: expected HTTP ${status}, got ${result.status}; ${JSON.stringify(result.payload)}`);
  }
  console.log(`✓ ${label} (${result.status})`);
  return result.payload?.data;
}

function assert(condition, label) {
  if (!condition) throw new Error(`Assertion failed: ${label}`);
  console.log(`✓ ${label}`);
}

// 1x1 PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function run() {
  if (process.env.SMARTSTORE_ALLOW_MUTATION_TESTS !== 'true') {
    throw new Error('Set SMARTSTORE_ALLOW_MUTATION_TESTS=true to run tests that restore their own changes.');
  }
  const cleanup = [];
  try {
    const owner = expect(await request('/api/auth/login', { method: 'POST', body: { email: 'owner@demo.com', password: 'Owner123!' } }), 200, 'Owner login');
    const admin = expect(await request('/api/auth/login', { method: 'POST', body: { email: 'admin@smartstore.demo', password: 'Admin123!' } }), 200, 'Platform admin login');
    const customer = expect(await request('/api/auth/login', { method: 'POST', body: { email: 'customer@demo.com', password: 'Customer123!' } }), 200, 'Customer login');
    const storeId = owner.user.storeId;

    // --- Store location and opening hours ---
    const before = await db.store.findUnique({ where: { id: storeId }, select: { city: true, latitude: true, longitude: true, mapUrl: true, openingHours: true } });
    cleanup.push(() => db.store.update({ where: { id: storeId }, data: { ...before, openingHours: before.openingHours ?? Prisma.DbNull } }));
    const hours = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [day, { closed: day === 'fri', open: '08:30', close: '23:00' }]));
    expect(await request(`/api/stores/${storeId}/settings`, { method: 'PUT', token: owner.token, body: { city: 'Baghdad', latitude: 33.3152, longitude: 44.3661, mapUrl: 'https://maps.example.com/?q=33.3,44.3', openingHours: hours } }), 200, 'Owner saves location + hours');
    const info = expect(await request(`/api/stores/${storeId}/info`, { token: customer.token }), 200, 'Customer reads store info');
    assert(info.city === 'Baghdad' && Number(info.latitude) === 33.3152 && info.mapUrl.startsWith('https://maps.example.com'), 'Location persisted and public');
    assert(info.openingHours?.fri?.closed === true && info.openingHours?.mon?.open === '08:30', 'Opening hours persisted and public');
    expect(await request(`/api/stores/${storeId}/settings`, { method: 'PUT', token: owner.token, body: { latitude: 120 } }), 400, 'Invalid latitude rejected');
    expect(await request(`/api/stores/${storeId}/settings`, { method: 'PUT', token: owner.token, body: { openingHours: { ...hours, mon: { closed: false, open: '25:99', close: '10:00' } } } }), 400, 'Invalid opening time rejected');
    expect(await request(`/api/stores/${storeId}/settings`, { method: 'PUT', token: owner.token, body: { mapUrl: 'javascript:alert(1)' } }), 400, 'Non-http map link rejected');
    expect(await request(`/api/stores/${storeId}/settings`, { method: 'PUT', token: customer.token, body: { city: 'X' } }), 403, 'Customer cannot edit store settings');

    // --- Product image upload / attach / remove ---
    const products = expect(await request(`/api/stores/${storeId}/products?limit=1`, { token: owner.token }), 200, 'Owner lists products');
    const product = products.products[0];
    const upload = expect(await request(`/api/stores/${storeId}/uploads`, { method: 'POST', token: owner.token, body: { kind: 'product', dataBase64: PNG } }), 201, 'Owner uploads product image');
    cleanup.push(() => db.productImage.deleteMany({ where: { productId: product.id } }));
    expect(await request(`/api/products/${product.id}/image`, { method: 'PUT', token: customer.token, body: { url: upload.url } }), 403, 'Customer cannot attach image');
    expect(await request(`/api/products/${product.id}/image`, { method: 'PUT', token: owner.token, body: { url: '/uploads/storesOTHERSTORE/product/x.png' } }), 403, 'Cross-store image URL rejected');
    expect(await request(`/api/products/${product.id}/image`, { method: 'PUT', token: owner.token, body: { url: 'https://evil.example/x.png' } }), 400, 'External image URL rejected');
    expect(await request(`/api/products/${product.id}/image`, { method: 'PUT', token: owner.token, body: { url: upload.url } }), 200, 'Owner attaches image');
    const detail = expect(await request(`/api/products/${product.id}`, { token: customer.token }), 200, 'Customer reads product details');
    assert(detail.productImages?.url === upload.url, 'Product details include the image');
    assert(!('costPrice' in detail), 'Customer product details hide costPrice');
    const catalog = expect(await request(`/api/stores/${storeId}/products?limit=5`, { token: customer.token }), 200, 'Customer lists products');
    assert(catalog.products.every((entry) => !('costPrice' in entry)), 'Customer product list hides costPrice');
    const file = await fetch(new URL(upload.url, BASE_URL));
    assert(file.status === 200 && (file.headers.get('content-type') || '').startsWith('image/'), 'Uploaded image is served');
    expect(await request(`/api/products/${product.id}/image`, { method: 'DELETE', token: owner.token }), 200, 'Owner removes image');
    assert((await fetch(new URL(upload.url, BASE_URL))).status === 404, 'Removed image file is gone');
    assert((await request(`/api/products/${product.id}`, { token: owner.token })).payload.data.productImages === null, 'Image association removed');

    // --- Pagination ---
    const page1 = expect(await request(`/api/stores/${storeId}/products?page=1&limit=1`, { token: owner.token }), 200, 'Products page 1');
    const page2 = expect(await request(`/api/stores/${storeId}/products?page=2&limit=1`, { token: owner.token }), 200, 'Products page 2');
    assert(page1.pagination.total >= 2 && page1.products.length === 1 && page2.products.length === 1 && page1.products[0].id !== page2.products[0].id, 'Pagination returns different records per page');
    const zones = expect(await request(`/api/stores/${storeId}/zones?page=1&limit=5`, { token: owner.token }), 200, 'Zones paginated');
    assert(zones.pagination && Array.isArray(zones.zones), 'Zones response has pagination meta');

    // --- Platform users ---
    expect(await request('/api/platform/users', { token: owner.token }), 403, 'Store owner cannot list platform users');
    expect(await request('/api/platform/users', { token: customer.token }), 403, 'Customer cannot list platform users');
    expect(await request('/api/platform/users'), 401, 'Anonymous cannot list platform users');
    const users = expect(await request('/api/platform/users?page=1&limit=2', { token: admin.token }), 200, 'Platform admin lists users');
    assert(users.users.length === 2 && users.pagination.total >= 5, 'Users are paginated');
    assert(users.users.every((entry) => !('password' in entry) && !('tokenVersion' in entry)), 'User list never exposes credentials');
    const filtered = expect(await request('/api/platform/users?role=STORE_OWNER', { token: admin.token }), 200, 'Filter users by role');
    assert(filtered.users.length >= 1 && filtered.users.every((entry) => entry.role === 'STORE_OWNER'), 'Role filter works');
    const searched = expect(await request('/api/platform/users?search=OWNER@demo', { token: admin.token }), 200, 'Search users');
    assert(searched.users.some((entry) => entry.email === 'owner@demo.com'), 'Search is case-insensitive');
    const profile = expect(await request(`/api/platform/users/${owner.user.id}`, { token: admin.token }), 200, 'User details');
    assert(profile.store?.id === storeId, 'User details include store association');
    expect(await request(`/api/platform/users/${admin.user.id}/status`, { method: 'PATCH', token: admin.token, body: { isActive: false } }), 409, 'Admin cannot deactivate self');
    expect(await request(`/api/platform/users/${owner.user.id}/status`, { method: 'PATCH', token: owner.token, body: { isActive: false } }), 403, 'Owner cannot change user status');
    // Deactivate/reactivate a throwaway customer.
    const phone = `+9647${Date.now().toString().slice(-8)}`;
    const registered = expect(await request('/api/auth/register', { method: 'POST', body: { phone, password: 'Passw0rd!1', firstName: 'Tmp' } }), 201, 'Register throwaway customer');
    const tmpId = registered.user.id;
    cleanup.push(async () => {
      await db.customerStore.deleteMany({ where: { userId: tmpId } });
      await db.authToken.deleteMany({ where: { userId: tmpId } });
      await db.user.deleteMany({ where: { id: tmpId } });
    });
    expect(await request(`/api/platform/users/${tmpId}/status`, { method: 'PATCH', token: admin.token, body: { isActive: false } }), 200, 'Admin deactivates user');
    expect(await request('/api/auth/me', { token: registered.token }), 401, 'Deactivated user token is rejected');
    expect(await request('/api/auth/login', { method: 'POST', body: { phone, password: 'Passw0rd!1' } }), 403, 'Deactivated user cannot log in');
    expect(await request(`/api/platform/users/${tmpId}/status`, { method: 'PATCH', token: admin.token, body: { isActive: true } }), 200, 'Admin reactivates user');
    expect(await request('/api/auth/login', { method: 'POST', body: { phone, password: 'Passw0rd!1' } }), 200, 'Reactivated user can log in');

    // --- System settings ---
    const original = expect(await request('/api/platform/settings', { token: admin.token }), 200, 'Admin reads system settings');
    cleanup.push(() => request('/api/platform/settings', { method: 'PUT', token: admin.token, body: original }));
    expect(await request('/api/platform/settings', { token: owner.token }), 403, 'Owner cannot read system settings');
    expect(await request('/api/platform/settings', { method: 'PUT', token: owner.token, body: original }), 403, 'Owner cannot write system settings');
    expect(await request('/api/platform/settings', { method: 'PUT', token: admin.token, body: { ...original, defaultCurrency: 'TOOLONG' } }), 400, 'Invalid system settings rejected');
    const changed = { ...original, platformName: 'SmartStore QA', supportEmail: 'help@example.com', allowCustomerRegistration: false };
    expect(await request('/api/platform/settings', { method: 'PUT', token: admin.token, body: changed }), 200, 'Admin saves system settings');
    const reread = expect(await request('/api/platform/settings', { token: admin.token }), 200, 'System settings reload');
    assert(reread.platformName === 'SmartStore QA' && reread.allowCustomerRegistration === false, 'System settings persisted');
    const pub = expect(await request('/api/platform/settings/public'), 200, 'Public settings readable');
    assert(pub.platformName === 'SmartStore QA' && !('defaultCurrency' in pub), 'Public settings expose only safe fields');
    expect(await request('/api/auth/register', { method: 'POST', body: { phone: `+9647${Date.now().toString().slice(-8)}`, password: 'Passw0rd!1', firstName: 'Blocked' } }), 403, 'Registration blocked when disabled');
    expect(await request('/api/platform/settings', { method: 'PUT', token: admin.token, body: original }), 200, 'System settings restored');
  } finally {
    for (const step of cleanup.reverse()) {
      try { await step(); } catch (error) { console.error('cleanup failed:', error.message); }
    }
    await db.$disconnect();
  }
}

run().then(() => console.log('\nFeature tests passed.')).catch((error) => { console.error('\nFAILED:', error.message); process.exit(1); });
