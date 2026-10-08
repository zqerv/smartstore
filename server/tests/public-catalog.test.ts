import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { db } from '../src/services/_db';
import { storeService } from '../src/services/store.service';
import { publicCatalogService } from '../src/services/public-catalog.service';
import publicCatalogRouter from '../src/routes/api/public-catalog';
import { TenantIsolation, authenticate, requireRole } from '../src/middleware/auth';
import { config } from '../src/lib/config';
import { errorHandler } from '../src/utils/errorHandler';
import { productService } from '../src/services/product.service';

const storeId = 'caaaaaaaaaaaaaaaaaaaaaaaa';
const otherStoreId = 'cbbbbbbbbbbbbbbbbbbbbbbbb';
const productId = 'cccccccccccccccccccccccc';

for (const total of [0, 31, 50, 200, 500, 1001]) {
  test(`public and admin pagination supports ${total} matching products without a store-size cap`, async (t) => {
    t.mock.method(storeService, 'getPublicStore', async () => ({ id: storeId }));
    t.mock.method(db.product, 'count', async () => total);
    t.mock.method(db.product, 'findMany', async (args: Prisma.ProductFindManyArgs) => {
      assert.equal(args.where?.storeId, storeId);
      const skip = args.skip || 0;
      const take = args.take || 0;
      return Array.from({ length: Math.min(take, Math.max(0, total - skip)) },
        (_, index) => ({ id: `product-${skip + index}`, storeId }));
    });
    for (const page of [1, 2, Math.max(1, Math.ceil(total / 30)), Math.ceil(total / 30) + 1]) {
      for (const list of [
        () => publicCatalogService.getProducts('veloura', { page, limit: 30 }),
        () => productService.getProducts({ storeId, page, limit: 30, status: 'ALL' }),
      ]) {
        const result = await list();
        assert.deepEqual(result.pagination, { page, limit: 30, total, totalPages: Math.ceil(total / 30) });
        assert.equal(result.products.length, Math.min(30, Math.max(0, total - (page - 1) * 30)));
      }
    }
  });
}

test('public product list scopes both products and categories and never selects internal costs', async (t) => {
  t.mock.method(storeService, 'getPublicStore', async () => ({ id: storeId }));
  t.mock.method(db.product, 'findMany', async (args: Prisma.ProductFindManyArgs) => {
    assert.equal(args.where?.storeId, storeId);
    assert.equal(args.where?.status, 'ACTIVE');
    assert.deepEqual(args.where?.category, { storeId, isActive: true });
    assert.equal(args.where?.categoryId, otherStoreId);
    assert.equal(args.take, 30);
    assert.equal(args.select?.costPrice, undefined);
    return [];
  });
  t.mock.method(db.product, 'count', async (args: Prisma.ProductCountArgs) => {
    assert.equal(args.where?.storeId, storeId);
    assert.equal(args.where?.status, 'ACTIVE');
    return 0;
  });
  const result = await publicCatalogService.getProducts('veloura', { categoryId: otherStoreId });
  assert.equal(result.pagination.total, 0);
});

test('public details reject another tenant product inside the database query', async (t) => {
  t.mock.method(storeService, 'getPublicStore', async () => ({ id: storeId }));
  t.mock.method(db.product, 'findFirst', async (args: Prisma.ProductFindFirstArgs) => {
    assert.deepEqual(args.where, {
      id: productId, storeId, status: 'ACTIVE', category: { storeId, isActive: true },
    });
    return null;
  });
  await assert.rejects(publicCatalogService.getProduct('veloura', productId),
    { statusCode: 404, message: 'Product not found in this store' });
});

test('inactive stores are rejected before any catalog database query', async (t) => {
  t.mock.method(db.store, 'findFirst', async (args: Prisma.StoreFindFirstArgs) => {
    assert.equal(args.where?.status, 'ACTIVE');
    return null;
  });
  const products = t.mock.method(db.product, 'findMany', async () => []);
  await assert.rejects(publicCatalogService.getProducts('suspended', {}), { statusCode: 404 });
  assert.equal(products.mock.callCount(), 0);
});

test('public categories are active and store-scoped', async (t) => {
  t.mock.method(storeService, 'getPublicStore', async () => ({ id: storeId }));
  t.mock.method(db.category, 'findMany', async (args: Prisma.CategoryFindManyArgs) => {
    assert.deepEqual(args.where, { storeId, isActive: true });
    return [];
  });
  assert.deepEqual(await publicCatalogService.getCategories('veloura'), { categories: [] });
});

test('public HTTP reads ignore stale bearer sessions while private tenant/RBAC checks remain enforced', async (t) => {
  const oldSecret = config.jwtSecret;
  config.jwtSecret = 'isolated-unit-test-secret-not-production-'.repeat(2);
  t.after(() => { config.jwtSecret = oldSecret; });
  t.mock.method(publicCatalogService, 'getProducts', async () => ({
    products: Array.from({ length: 30 }, (_, index) => ({ id: `product-${index}`, storeId })),
    pagination: { page: 1, limit: 30, total: 30, totalPages: 1 },
  }));
  t.mock.method(db.user, 'findUnique', async () => ({
    id: 'owner', role: 'STORE_OWNER', storeId: otherStoreId, isActive: true, tokenVersion: 0,
  }));
  t.mock.method(db.storeAdmin, 'findFirst', async () => null);
  const app = express();
  app.use('/api', publicCatalogRouter);
  app.get('/api/private/:storeId', TenantIsolation, authenticate, requireRole('STORE_OWNER'), (_req, res) => res.json({ success: true }));
  app.use(errorHandler);
  const server = createServer(app);
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
    server.closeAllConnections();
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  for (const authorization of ['', 'Bearer stale-dashboard-token']) {
    const response = await fetch(`${base}/stores/veloura/catalog/products`, { headers: { authorization } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.products.length, 30);
  }
  assert.equal((await fetch(`${base}/private/${storeId}`)).status, 401);
  const token = jwt.sign({ userId: 'owner', role: 'STORE_OWNER', storeId: otherStoreId }, config.jwtSecret);
  assert.equal((await fetch(`${base}/private/${storeId}`, { headers: { Authorization: `Bearer ${token}` } })).status, 403);
  assert.equal((await fetch(`${base}/stores/veloura/catalog/products?limit=101`)).status, 400);
});
