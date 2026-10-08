import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { config } from '../src/lib/config';
import { ensureDemoData } from '../src/lib/bootstrap';
import { db } from '../src/services/_db';

test('real database bootstrap preserves an active owner product across repeated startup seeding', async (t) => {
  const host = new URL(config.databaseUrl).hostname;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(host),
    'This rollback-only regression test must use a local database, never production.');
  const rollback = new Error('Rollback isolated bootstrap regression data');
  const slug = `bootstrap-regression-${randomUUID()}`;
  await assert.rejects(db.$transaction(async (tx) => {
    const store = await tx.store.findUniqueOrThrow({ where: { slug: 'maison-elan' } });
    const category = await tx.category.create({
      data: { storeId: store.id, slug, nameAr: 'Owner regression category', isActive: true },
    });
    const ownerProduct = await tx.product.create({
      data: {
        storeId: store.id, categoryId: category.id, slug,
        nameAr: 'Owner regression product', nameEn: 'Owner regression product',
        price: new Prisma.Decimal(123456), stock: 7, status: 'ACTIVE', sku: slug,
        productImages: { create: { url: '/uploads/owner-regression.jpg', isPrimary: true } },
      },
      include: { productImages: true },
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
    const before = await snapshot();
    t.mock.method(db, '$transaction', async (callback: (client: Prisma.TransactionClient) => Promise<void>) => callback(tx));
    await ensureDemoData();
    await ensureDemoData();
    assert.deepEqual(await snapshot(), before);
    const visible = await tx.product.findFirst({
      where: {
        id: ownerProduct.id, storeId: store.id, status: 'ACTIVE',
        category: { storeId: store.id, isActive: true },
      },
      include: { productImages: true },
    });
    assert.deepEqual(visible, ownerProduct);
    throw rollback;
  }, { maxWait: 10000, timeout: 120000 }), (error) => error === rollback);
  assert.equal(await db.product.count({ where: { slug } }), 0);
  await db.$disconnect();
});
