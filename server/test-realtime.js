require('dotenv').config();

const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { io } = require(require.resolve('socket.io-client', { paths: [path.join(__dirname, '..', 'client')] }));

const BASE_URL = process.env.SMARTSTORE_API_URL || 'http://localhost:5000';
const db = new PrismaClient();

async function request(p, { method = 'GET', token, body } = {}) {
  const response = await fetch(new URL(p, BASE_URL), {
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
  if (result.status !== status) throw new Error(`${label}: expected ${status}, got ${result.status}; ${JSON.stringify(result.payload)}`);
  console.log(`✓ ${label} (${result.status})`);
  return result.payload?.data;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, { auth: { token }, transports: ['websocket'] });
    socket.events = [];
    for (const name of ['order:created', 'order:updated']) socket.on(name, (payload) => socket.events.push({ name, payload }));
    socket.once('realtime:ready', () => resolve(socket));
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('Socket did not become ready')), 8000);
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  if (process.env.SMARTSTORE_ALLOW_MUTATION_TESTS !== 'true') throw new Error('Set SMARTSTORE_ALLOW_MUTATION_TESTS=true');
  const created = { sockets: [], orderIds: [] };
  const suffix = Date.now().toString().slice(-8);
  try {
    const login = async (email, password) => expect(await request('/api/auth/login', { method: 'POST', body: { email, password } }), 200, `Login ${email}`);
    const admin = await login('admin@smartstore.demo', 'Admin123!');
    const owner = await login('owner@demo.com', 'Owner123!');
    const customer = await login('customer@demo.com', 'Customer123!');
    const storeId = owner.user.storeId;

    // A second, independent tenant with its own owner.
    const otherStore = expect(await request('/api/stores', {
      method: 'POST', token: admin.token,
      body: { name: 'Realtime isolation store', slug: `rt-iso-${suffix}`, owner: { phone: `+9647${suffix}`, email: `rt-owner-${suffix}@example.test`, password: 'Passw0rd!1', firstName: 'Other' } },
    }), 201, 'Platform admin creates a second store');
    created.otherStoreId = otherStore.id || otherStore.store?.id;
    const otherOwner = await login(`rt-owner-${suffix}@example.test`, 'Passw0rd!1');

    // Staff in the first store.
    const staffUser = expect(await request(`/api/stores/${storeId}/staff`, {
      method: 'POST', token: owner.token,
      body: { role: 'STAFF', phone: `+9647${Number(suffix) + 1}`, email: `rt-staff-${suffix}@example.test`, password: 'Passw0rd!1', firstName: 'Staff' },
    }), 201, 'Owner creates staff');
    created.staffId = staffUser.id;
    const staff = await login(`rt-staff-${suffix}@example.test`, 'Passw0rd!1');

    // Tenant isolation
    expect(await request(`/api/stores/${storeId}/orders`, { token: otherOwner.token }), 403, 'Other owner cannot list orders of store A');
    expect(await request(`/api/stores/${storeId}/reports`, { token: otherOwner.token }), 403, 'Other owner cannot read reports of store A');
    expect(await request(`/api/stores/${storeId}/staff`, { token: otherOwner.token }), 403, 'Other owner cannot list staff of store A');
    expect(await request(`/api/stores/${storeId}/customers`, { token: otherOwner.token }), 403, 'Other owner cannot list customers of store A');
    expect(await request(`/api/stores/${created.otherStoreId}/orders`, { token: owner.token }), 403, 'Owner A cannot list orders of store B');
    expect(await request(`/api/stores/${storeId}/staff`, { method: 'POST', token: staff.token, body: { role: 'STAFF', phone: '+96470000999', password: 'Passw0rd!1' } }), 403, 'Staff cannot create staff');
    expect(await request(`/api/stores/${storeId}/settings`, { method: 'PUT', token: staff.token, body: { name: 'Hacked' } }), 403, 'Staff cannot change store settings');

    // Catalog for the order
    const category = expect(await request(`/api/stores/${storeId}/categories`, { method: 'POST', token: owner.token, body: { nameAr: 'فئة الزمن الحقيقي', nameEn: `RT ${suffix}` } }), 201, 'Create category');
    created.categoryId = category.id;
    const product = expect(await request(`/api/stores/${storeId}/products`, { method: 'POST', token: owner.token, body: { categoryId: category.id, nameAr: 'منتج', nameEn: `RT product ${suffix}`, price: 10, stock: 5 } }), 201, 'Create product');
    created.productId = product.id;

    const sockets = {
      owner: await connect(owner.token),
      staff: await connect(staff.token),
      other: await connect(otherOwner.token),
      customer: await connect(customer.token),
    };
    created.sockets = Object.values(sockets);
    console.log('✓ Four authenticated sockets connected');

    const rejected = await new Promise((resolve) => {
      const bad = io(BASE_URL, { auth: { token: 'invalid' }, transports: ['websocket'], reconnection: false });
      bad.once('connect', () => { bad.close(); resolve(false); });
      bad.once('connect_error', () => { bad.close(); resolve(true); });
      setTimeout(() => { bad.close(); resolve(true); }, 4000);
    });
    if (!rejected) throw new Error('Socket accepted an invalid token');
    console.log('✓ Socket with invalid token rejected');

    expect(await request('/api/orders/checkout', {
      method: 'POST', token: customer.token,
      body: { customerId: customer.user.id, storeId, items: [{ productId: product.id, quantity: 1 }], deliveryAddress: 'Realtime Test Street', paymentMethod: 'ONLINE_PAYMENT' },
    }), 501, 'Online payment reports provider not configured');

    const checkout = await request('/api/orders/checkout', {
      method: 'POST', token: customer.token,
      body: { customerId: customer.user.id, storeId, items: [{ productId: product.id, quantity: 1 }], deliveryAddress: 'Realtime Test Street', paymentMethod: 'CASH_ON_DELIVERY' },
    });
    const order = expect(checkout, 201, 'Customer places a cash-on-delivery order');
    created.orderIds.push(order.id);
    await wait(800);
    const has = (socket, name) => socket.events.some((event) => event.name === name && (event.payload.id === order.id || event.payload.orderId === order.id));
    if (!has(sockets.owner, 'order:created')) throw new Error('Store owner did not receive order:created');
    if (!has(sockets.staff, 'order:created')) throw new Error('Staff did not receive order:created');
    if (!has(sockets.customer, 'order:created')) throw new Error('Customer did not receive its own order:created');
    if (sockets.other.events.length) throw new Error('Other tenant received events: cross-tenant leak');
    console.log('✓ New order reached store owner, staff and customer; other tenant received nothing');

    const staffOrders = expect(await request(`/api/stores/${storeId}/orders`, { token: staff.token }), 200, 'Staff lists store orders');
    const rows = Array.isArray(staffOrders) ? staffOrders : staffOrders.orders;
    if (!rows.some((row) => row.id === order.id)) throw new Error('Staff cannot see the new order');
    expect(await request(`/api/orders/${order.id}/status`, { method: 'PATCH', token: staff.token, body: { status: 'CONFIRMED' } }), 200, 'Staff confirms the order');
    await wait(800);
    if (!has(sockets.customer, 'order:updated')) throw new Error('Customer did not receive status update');
    if (!has(sockets.owner, 'order:updated')) throw new Error('Owner did not receive status update');
    if (sockets.other.events.length) throw new Error('Other tenant received status events');
    console.log('✓ Status change reached the customer and the store; other tenant received nothing');
    expect(await request(`/api/orders/${order.id}/status`, { method: 'PATCH', token: otherOwner.token, body: { status: 'PREPARING' } }), 403, 'Other tenant cannot change the order status');
    const mine = expect(await request(`/api/orders/${order.id}`, { token: customer.token }), 200, 'Customer reads own order');
    if (mine.status !== 'CONFIRMED') throw new Error('Customer sees stale status');
    console.log('All realtime / tenant / staff tests passed.');
  } finally {
    created.sockets.forEach((socket) => socket.close());
    try {
      for (const id of created.orderIds) {
        const order = await db.order.findUnique({ where: { id }, include: { items: true } });
        if (!order) continue;
        for (const item of order.items) await db.product.updateMany({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
        await db.order.delete({ where: { id } });
      }
      if (created.productId) await db.product.deleteMany({ where: { id: created.productId } });
      if (created.categoryId) await db.category.deleteMany({ where: { id: created.categoryId } });
      const userIds = [created.staffId].filter(Boolean);
      if (created.otherStoreId) {
        const members = await db.user.findMany({ where: { OR: [{ storeId: created.otherStoreId }, { email: { startsWith: `rt-owner-${suffix}` } }] }, select: { id: true } });
        userIds.push(...members.map((member) => member.id));
        await db.store.deleteMany({ where: { id: created.otherStoreId } });
      }
      for (const id of userIds) {
        await db.authToken.deleteMany({ where: { userId: id } });
        await db.user.deleteMany({ where: { id } });
      }
      console.log('Temporary test records cleaned up.');
    } catch (cleanupError) {
      console.error(`TEST_CLEANUP_FAILED=${cleanupError.message}`);
      process.exitCode = 1;
    }
    await db.$disconnect();
  }
}

run().catch((error) => { console.error(`FAILED: ${error.message}`); process.exit(1); });
