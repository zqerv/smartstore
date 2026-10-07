import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { ensureDemoData } from '../src/lib/bootstrap';
import { db } from '../src/services/_db';

test('idempotent bootstrap maintains exactly 30 real products per store and preserves price/stock', async (t) => {
  const records = new Map<string, Prisma.ProductCreateInput | Prisma.ProductUncheckedCreateInput>();
  const images = new Map<string, string>();
  const categories = new Set<string>();
  t.mock.method(db, '$transaction', async (callback: (tx: typeof db) => Promise<void>) => callback(db));
  t.mock.method(db.user, 'upsert', async (args: Prisma.UserUpsertArgs) => ({ id: args.where.email }));
  t.mock.method(db.store, 'upsert', async (args: Prisma.StoreUpsertArgs) => ({ id: args.where.slug }));
  t.mock.method(db.storeAdmin, 'upsert', async () => ({}));
  t.mock.method(db.customer, 'upsert', async () => ({}));
  t.mock.method(db.customerStore, 'findFirst', async () => ({ id: 'demo-membership' }));
  t.mock.method(db.category, 'upsert', async (args: Prisma.CategoryUpsertArgs) => {
    const key = `${args.create.storeId}/${args.create.slug}`;
    categories.add(key);
    return { id: key };
  });
  t.mock.method(db.category, 'findFirstOrThrow', async () => ({ id: 'demo/fashion' }));
  t.mock.method(db.product, 'count', async (args: Prisma.ProductCountArgs) => {
    const products = [...records.values()].filter((record) => record.storeId === args.where?.storeId);
    return args.where?.slug ? 0 : products.length;
  });
  t.mock.method(db.product, 'upsert', async (args: Prisma.ProductUpsertArgs) => {
    const key = `${args.create.storeId}/${args.create.slug}`;
    if (args.create.storeId !== 'demo') {
      assert.equal(args.create.status, 'ACTIVE');
      assert.ok(Number(args.create.price) > 0);
      assert.ok(Number(args.create.stock) > 0);
      assert.ok(args.create.descriptionEn);
      assert.ok(args.create.nameAr && args.create.nameEn);
      assert.ok(categories.has(String(args.create.categoryId)));
      assert.equal(args.update.price, undefined);
      assert.equal(args.update.stock, undefined);
    }
    if (!records.has(key)) records.set(key, args.create);
    return { id: key };
  });
  t.mock.method(db.productImage, 'upsert', async (args: Prisma.ProductImageUpsertArgs) => {
    images.set(String(args.create.productId), args.create.url);
    return { id: args.create.productId };
  });
  await ensureDemoData();
  await ensureDemoData();
  for (const store of ['veloura', 'maison-elan']) {
    assert.equal([...records.values()].filter((record) => record.storeId === store).length, 30);
    assert.equal([...images.keys()].filter((key) => key.startsWith(`${store}/`)).length, 30);
  }
  for (const url of new Set(images.values())) {
    assert.match(url, /^\/demo-assets\/[a-z-]+\.jpg$/);
    const bytes = await readFile(join(process.cwd(), 'public', 'demo', url.split('/').pop()!));
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
  }
});
