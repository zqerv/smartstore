import bcrypt from 'bcryptjs';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('⚠ WARNING: SAFE seed using upsert/create-if-missing. No destructive operations.');
  console.log('Remove this message when confirming seed is safe.\n');

  const now = new Date();
  const adminHash = await bcrypt.hash('Admin123!', 10);
  const ownerHash = await bcrypt.hash('Owner123!', 10);
  const customerHash = await bcrypt.hash('Customer123!', 10);

  // Platform Admin - Upsert (safe)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@smartstore.demo' },
    update: { isActive: true },
    create: {
      email: 'admin@smartstore.demo',
      phone: '96470000000',
      password: adminHash,
      role: UserRole.PLATFORM_ADMIN,
      isActive: true,
      lastLoginAt: now,
    },
  });
  console.log(`✓ Platform Admin: ${admin.id}`);

  // Store Owner - Upsert (safe)
  const owner = await prisma.user.upsert({
    where: { email: 'owner@demo.com' },
    update: { isActive: true },
    create: {
      email: 'owner@demo.com',
      phone: '9647900000000',
      password: ownerHash,
      role: UserRole.STORE_OWNER,
      storeId: null,
      isActive: true,
      lastLoginAt: now,
    },
  });
  console.log(`✓ Store Owner: ${owner.id}`);

  // Customer - Upsert (safe)
  const customer = await prisma.user.upsert({
    where: { email: 'customer@demo.com' },
    update: { isActive: true },
    create: {
      email: 'customer@demo.com',
      phone: '9647800000000',
      password: customerHash,
      role: UserRole.CUSTOMER,
      storeId: null,
      isActive: true,
      lastLoginAt: now,
    },
  });
  console.log(`✓ Customer: ${customer.id}`);

  // Store - Create if missing (safe)
  const store = await prisma.store.upsert({
    where: { slug: 'demo' },
    update: { isActive: true },
    create: {
      name: 'SmartStore Demo',
      slug: 'demo',
      email: 'demo@smartstore.demo',
      phone: '9647777777',
      status: 'ACTIVE',
      defaultCurrency: 'IQD',
      locale: 'ar-SA',
      dir: 'rtl',
      description: 'Demo smartstore',
      createdAt: now,
      updatedAt: now,
    },
  });
  console.log(`✓ Store: ${store.id} (${store.name})`);

  // Store Admin - Create if missing (safe)
  const storeAdmin = await prisma.storeAdmin.findFirst({
    where: { userId: owner.id, storeId: store.id }
  });
  if (!storeAdmin) {
    await prisma.storeAdmin.create({
      userId: owner.id,
      storeId: store.id,
      permissionLevel: 'OWNER',
      createdAt: now,
    });
    console.log(`✓ Store Admin linked`);
  }

  // Customer Store - Create if missing (safe)
  const customerStoreLink = await prisma.customerStore.findFirst({
    where: { userId: customer.id, storeId: store.id }
  });
  if (!customerStoreLink) {
    await prisma.customerStore.create({
      userId: customer.id,
      storeId: store.id,
      joinedAt: now,
    });
    console.log(`✓ Customer Store linked`);
  }

  // Categories - Create if missing (safe)
  const clothingCat = await prisma.category.upsert({
    where: { slug: 'clothing' },
    update: { isActive: true },
    create: {
      storeId: store.id,
      nameAr: 'الملابس',
      nameEn: 'Clothing',
      slug: 'clothing',
      sortOrder: 1,
      isActive: true,
    },
  });
  console.log(`✓ Category: ${clothingCat.nameAr}/${clothingCat.nameEn}`);

  const electronicsCat = await prisma.category.upsert({
    where: { slug: 'electronics' },
    update: { isActive: true },
    create: {
      storeId: store.id,
      nameAr: 'الإلكترونيات',
      nameEn: 'Electronics',
      slug: 'electronics',
      sortOrder: 2,
      isActive: true,
    },
  });
  console.log(`✓ Category: ${electronicsCat.nameAr}/${electronicsCat.nameEn}`);

  // Products - Create if missing (safe)
  const laptop = await prisma.product.upsert({
    where: { slug: 'professional-laptop' },
    update: { isActive: true },
    create: {
      storeId: store.id,
      categoryId: electronicsCat.id,
      nameAr: 'لابتوب احترافي',
      price: 850000,
      cost: 650000,
      quantity: 50,
      weight: 2000,
      sku: 'LPT-PRO-001',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
  });
  console.log(`✓ Product: ${laptop.slug} (${laptop.price})`);

  const shirt = await prisma.product.upsert({
    where: { slug: 'casual-shirt' },
    update: { isActive: true },
    create: {
      storeId: store.id,
      categoryId: clothingCat.id,
      nameAr: 'قميص كاجوال',
      price: 25000,
      cost: 10000,
      quantity: 100,
      weight: 500,
      sku: 'SHR-CASUAL-002',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
  });
  console.log(`✓ Product: ${shirt.slug} (${shirt.price})`);

  console.log(`\n✅ Seed completed successfully.`);
  console.log(`   Stores: ${(await prisma.store.count())}`);
  console.log(`   Users: ${(await prisma.user.count())}`);
  console.log(`   Categories: ${(await prisma.category.count())}`);
  console.log(`   Products: ${(await prisma.product.count())}`);
}

main();
