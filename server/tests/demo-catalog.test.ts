import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { ensureDemoData } from '../src/lib/bootstrap';
import { db } from '../src/services/_db';

test('additive bootstrap preserves owner data, seed edits and slug collisions while filling missing catalog entries', async (t) => {
  const records = new Map<string, Prisma.ProductCreateInput | Prisma.ProductUncheckedCreateInput>();
  const images = new Map<string, string>();
  const categories = new Set<string>();
  const ownerProduct: Prisma.ProductUncheckedCreateInput = {
    id: 'owner-product', storeId: 'maison-elan', categoryId: 'owner-category',
    slug: 'owner-designed-coat', nameAr: 'Owner coat', nameEn: 'Owner coat',
    price: new Prisma.Decimal(321000), stock: 7, status: 'ACTIVE', sku: 'OWNER-001',
  };
  records.set('maison-elan/owner-designed-coat', ownerProduct);
  images.set('maison-elan/owner-designed-coat', '/uploads/owner-coat.jpg');
  const collision: Prisma.ProductUncheckedCreateInput = {
    ...ownerProduct, id: 'owner-collision', slug: 'milano-oversized-blazer',
    nameEn: 'Owner custom blazer', stock: 3, status: 'DRAFT',
  };
  records.set('maison-elan/milano-oversized-blazer', collision);
  images.set('maison-elan/milano-oversized-blazer', '/uploads/owner-blazer.jpg');
  t.mock.method(db, '$transaction', async (callback: (tx: typeof db) => Promise<void>) => callback(db));
  t.mock.method(db.user, 'upsert', async (args: Prisma.UserUpsertArgs) => {
    assert.deepEqual(args.update, {});
    return { id: args.where.email };
  });
  t.mock.method(db.store, 'upsert', async (args: Prisma.StoreUpsertArgs) => {
    assert.deepEqual(args.update, {});
    return { id: args.where.slug };
  });
  t.mock.method(db.storeAdmin, 'upsert', async (args: Prisma.StoreAdminUpsertArgs) => {
    assert.deepEqual(args.update, {});
    return {};
  });
  t.mock.method(db.customer, 'upsert', async () => ({}));
  t.mock.method(db.customerStore, 'findFirst', async () => ({ id: 'demo-membership' }));
  t.mock.method(db.category, 'upsert', async (args: Prisma.CategoryUpsertArgs) => {
    assert.deepEqual(args.update, {});
    const key = `${args.create.storeId}/${args.create.slug}`;
    categories.add(key);
    return { id: key };
  });
  t.mock.method(db.category, 'findFirstOrThrow', async () => ({ id: 'demo/fashion' }));
  t.mock.method(db.product, 'count', async (args: Prisma.ProductCountArgs) => {
    const products = [...records.values()].filter((record) => record.storeId === args.where?.storeId);
    const filter = args.where?.slug;
    if (filter && typeof filter === 'object') {
      if (Array.isArray(filter.in)) return products.filter((record) => filter.in.includes(record.slug)).length;
      if (Array.isArray(filter.notIn)) return products.filter((record) => !filter.notIn.includes(record.slug)).length;
    }
    return products.length;
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
    }
    assert.deepEqual(args.update, {});
    if (!records.has(key)) {
      records.set(key, args.create);
      const image = args.create.productImages?.create;
      if (image && !Array.isArray(image)) images.set(key, image.url);
    }
    return { id: key };
  });
  await ensureDemoData();
  const firstRecords = new Map(records);
  const firstImages = new Map(images);
  await ensureDemoData();
  assert.deepEqual(records, firstRecords);
  assert.deepEqual(images, firstImages);
  assert.deepEqual(records.get('maison-elan/owner-designed-coat'), ownerProduct);
  assert.deepEqual(records.get('maison-elan/milano-oversized-blazer'), collision);

  const editedKey = 'veloura/velvet-oud';
  const edited = { ...records.get(editedKey)!, price: new Prisma.Decimal(100), stock: 0, status: 'INACTIVE', nameEn: 'Owner edited fragrance' };
  records.set(editedKey, edited);
  images.set(editedKey, '/uploads/owner-edited.jpg');
  records.delete('veloura/rose-elegance');
  images.delete('veloura/rose-elegance');
  await ensureDemoData();
  assert.deepEqual(records.get(editedKey), edited);
  assert.equal(images.get(editedKey), '/uploads/owner-edited.jpg');
  assert.ok(records.has('veloura/rose-elegance'));
  assert.equal(images.get('maison-elan/owner-designed-coat'), '/uploads/owner-coat.jpg');
  assert.equal(images.get('maison-elan/milano-oversized-blazer'), '/uploads/owner-blazer.jpg');
  for (const store of ['veloura', 'maison-elan']) {
    const expectedCount = store === 'maison-elan' ? 31 : 30;
    assert.equal([...records.values()].filter((record) => record.storeId === store).length, expectedCount);
    assert.equal([...images.keys()].filter((key) => key.startsWith(`${store}/`)).length, expectedCount);
  }
  for (const url of new Set(images.values())) {
    if (url.startsWith('/uploads/')) continue;
    assert.match(url, /^\/demo-assets\/[a-z-]+\.jpg$/);
    const bytes = await readFile(join(process.cwd(), 'public', 'demo', url.split('/').pop()!));
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
  }
});
