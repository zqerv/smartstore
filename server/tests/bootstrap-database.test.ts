import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';
import { config } from '../src/lib/config';

test('real database bootstrap preserves successive owner additions and paginates without seed duplicates', async (t) => {
  const host = new URL(config.databaseUrl).hostname;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(host),
    'This rollback-only regression test must use a local database, never production.');
  const db = new PrismaClient();
  const globals = globalThis as typeof globalThis & { prisma?: PrismaClient };
  const previous = globals.prisma;
  t.after(async () => {
    globals.prisma = previous;
    await db.$disconnect();
  });
  const rollback = new Error('Rollback isolated bootstrap regression data');
  const slug = `bootstrap-regression-${randomUUID()}`;
  await assert.rejects(db.$transaction(async (tx) => {
    const store = await tx.store.findUniqueOrThrow({ where: { slug: 'maison-elan' } });
    const category = await tx.category.create({
      data: { storeId: store.id, slug, nameAr: 'Owner regression category', isActive: true },
    });
    const snapshot = async () => ({
      products: await tx.product.findMany({ orderBy: { id: 'asc' }, include: { productImages: true } }),
      categories: await tx.category.findMany({ orderBy: { id: 'asc' } }),
      stores: await tx.store.findMany({ orderBy: { id: 'asc' } }),
      users: await tx.user.findMany({ orderBy: { id: 'asc' } }),
      permissions: await tx.storeAdmin.findMany({ orderBy: { id: 'asc' } }),
      orders: await tx.order.count(),
      customers: await tx.customer.count(),
    });
    globals.prisma = new Proxy(db, {
      get(target, key) {
        if (key === '$transaction') {
          return (callback: (client: Prisma.TransactionClient) => Promise<void>) => callback(tx);
        }
        if (key in tx) return Reflect.get(tx, key);
        return Reflect.get(target, key);
      },
    });
    const { ensureDemoData } = await import('../src/lib/bootstrap');
    const { productService } = await import('../src/services/product.service');
    const { publicCatalogService } = await import('../src/services/public-catalog.service');
    await ensureDemoData();
    const baseline = await snapshot();
    const createOwnerProduct = (suffix: string) => productService.createProduct(store.id, {
      categoryId: category.id, slug: `${slug}-${suffix}`,
      nameAr: `Owner regression ${suffix}`, nameEn: `Owner regression ${suffix}`,
      price: 123456, stock: 7, sku: `${slug}-${suffix}`,
    });
    const ownerProduct = await createOwnerProduct('first');
    const firstSnapshot = await snapshot();
    await ensureDemoData();
    assert.deepEqual(await snapshot(), firstSnapshot);
    const secondProduct = await createOwnerProduct('second');
    const secondSnapshot = await snapshot();
    await ensureDemoData();
    await ensureDemoData();
    assert.deepEqual(await snapshot(), secondSnapshot);
    assert.equal(secondSnapshot.products.length, baseline.products.length + 2);
    for (const product of [ownerProduct, secondProduct]) {
      const visible = await publicCatalogService.getProduct(store.slug, product.id);
      assert.equal(visible.id, product.id);
      assert.equal(visible.stock, product.stock);
      assert.equal(visible.price.toString(), product.price.toString());
      assert.equal(visible.nameEn, product.nameEn);
    }
    await tx.product.createMany({
      data: Array.from({ length: 65 }, (_, index) => ({
        storeId: store.id, categoryId: category.id, slug: `${slug}-bulk-${index}`,
        nameAr: `Owner bulk ${index}`, nameEn: `Owner bulk ${index}`,
        price: new Prisma.Decimal(100), stock: 1, status: index < 60 ? 'ACTIVE' : 'DRAFT',
      })),
    });
    const largeSnapshot = await snapshot();
    await ensureDemoData();
    assert.deepEqual(await snapshot(), largeSnapshot);
    const allIds = new Set<string>();
    let page = 1;
    let totalPages = 1;
    let total = 0;
    do {
      const result = await publicCatalogService.getProducts(store.slug, { page, limit: 30 });
      assert.ok(result.products.length <= 30);
      total = result.pagination.total;
      totalPages = result.pagination.totalPages;
      for (const product of result.products) {
        assert.ok(!allIds.has(product.id), 'Product duplicated across public pages');
        allIds.add(product.id);
      }
      page++;
    } while (page <= totalPages);
    assert.equal(allIds.size, total);
    assert.ok(totalPages > 1);
    for (const status of ['ALL', 'ACTIVE', 'DRAFT']) {
      const admin = await productService.getProducts({
        storeId: store.id, categoryId: category.id, search: 'Owner bulk', status, page: 2, limit: 10,
      });
      const expectedTotal = status === 'DRAFT' ? 5 : status === 'ACTIVE' ? 60 : 65;
      assert.equal(admin.pagination.total, expectedTotal);
      assert.equal(admin.pagination.totalPages, Math.ceil(expectedTotal / 10));
      assert.equal(admin.products.length, Math.min(10, Math.max(0, expectedTotal - 10)));
      assert.ok(admin.products.every((product) => product.categoryId === category.id));
    }
    const slugs = largeSnapshot.products.map((product) => `${product.storeId}/${product.slug}`);
    assert.equal(new Set(slugs).size, slugs.length);
    throw rollback;
  }, { maxWait: 10000, timeout: 120000 }), (error) => error === rollback);
  assert.equal(await db.product.count({ where: { slug: { startsWith: slug } } }), 0);
  await db.$disconnect();
});
