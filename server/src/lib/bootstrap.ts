import bcrypt from 'bcryptjs';
import { Prisma, UserRole } from '@prisma/client';
import { db } from '../services/_db';
import { logger } from './logger';
import { additionalVelouraProducts, additionalMaisonProducts } from './luxury-catalog';

const DEMO_ADMIN = {
  email: 'admin@smartstore.demo',
  phone: '964700000000',
  password: 'Admin123!',
};

const DEMO_OWNER = {
  email: 'owner@demo.com',
  phone: '9647900000000',
  password: 'Owner123!',
};

const DEMO_CUSTOMER = {
  email: 'customer@demo.com',
  phone: '9647800000000',
  password: 'Customer123!',
};

const LUXURY_DEMOS = [
  {
    slug: 'veloura',
    name: 'Veloura Parfums',
    email: 'hello@veloura.demo',
    phone: '+9647701002001',
    address: 'Al Mansour, Baghdad',
    description: 'A considered collection of modern oriental fragrances, composed to become part of your signature.',
    primaryColor: '#795c45',
    secondaryColor: '#33251f',
    owner: { email: 'owner@veloura.demo', phone: '+9647701002002', password: 'VelouraOwner123!', name: 'Veloura Owner' },
    staff: { email: 'staff@veloura.demo', phone: '+9647701002003', password: 'VelouraStaff123!', name: 'Veloura Stylist' },
    categories: [
      ['women-perfumes', 'عطور نسائية', 'Women’s Perfume'],
      ['men-perfumes', 'عطور رجالية', 'Men’s Perfume'],
      ['luxury-fragrances', 'عطور فاخرة', 'Luxury Fragrance'],
      ['gift-sets', 'مجموعات الهدايا', 'Gift Sets'],
      ['unisex', 'للجنسين', 'Unisex'],
      ['best-sellers', 'الأكثر مبيعاً', 'Best Sellers'],
      ['new-arrivals', 'وصل حديثاً', 'New Arrivals'],
      ['collections', 'المجموعات', 'Collections'],
    ],
    products: [
      ['velvet-oud', 'فيلفت عود', 'Velvet Oud', 'luxury-fragrances', 185000, 18, 'A warm blend of smoked oud, amber and soft woods, made for evenings that linger. 100 ml.', 'veloura-oud.jpg'],
      ['rose-elegance', 'روز إليغانس', 'Rose Élégance', 'women-perfumes', 142000, 24, 'Fresh rose petals meet delicate musk and a luminous heart of white florals. 75 ml.', 'veloura-rose.jpg'],
      ['noir-intense', 'نوار إنتنس', 'Noir Intense', 'men-perfumes', 168000, 15, 'A confident composition of bergamot, dark spices and refined cedar. 100 ml.', 'veloura-noir.jpg'],
      ['imperial-musk', 'إمبيريال مسك', 'Imperial Musk', 'luxury-fragrances', 205000, 12, 'Silky white musk, cashmere woods and a subtle trail of golden amber. 100 ml.', 'veloura-musk.jpg'],
      ['golden-bloom', 'غولدن بلوم', 'Golden Bloom', 'women-perfumes', 156000, 21, 'A radiant floral bouquet with pear, jasmine and a soft vanilla finish. 75 ml.', 'veloura-rose.jpg'],
      ['signature-collection', 'مجموعة سيغنتشر', 'Signature Collection', 'gift-sets', 289000, 9, 'Three house favourites presented together in a keepsake gift box.', 'veloura-gift.jpg'],
      ['saffron-veil', 'سافرون ڤيل', 'Saffron Veil', 'luxury-fragrances', 192000, 14, 'Golden saffron and transparent florals unfold over a smooth amber base. 100 ml.', 'veloura-noir.jpg'],
      ['amber-nocturne', 'أمبر نوكتورن', 'Amber Nocturne', 'men-perfumes', 174000, 17, 'A modern amber scent layered with cardamom, tonka and warm skin musk. 100 ml.', 'veloura-oud.jpg'],
      ...additionalVelouraProducts,
    ],
  },
  {
    slug: 'maison-elan',
    name: 'Maison Élan',
    email: 'bonjour@maison-elan.demo',
    phone: '+9647702002001',
    address: 'Al Jadriya, Baghdad',
    description: 'Thoughtful wardrobe pieces, tailored with ease and made for a life in motion.',
    primaryColor: '#596153',
    secondaryColor: '#242820',
    owner: { email: 'owner@maison-elan.demo', phone: '+9647702002002', password: 'MaisonOwner123!', name: 'Maison Owner' },
    staff: { email: 'staff@maison-elan.demo', phone: '+9647702002003', password: 'MaisonStaff123!', name: 'Maison Stylist' },
    categories: [
      ['dresses', 'فساتين', 'Dresses'],
      ['shirts', 'قمصان', 'Shirts'],
      ['jackets', 'سترات', 'Jackets'],
      ['shoes', 'أحذية', 'Shoes'],
      ['accessories', 'إكسسوارات', 'Accessories'],
      ['men', 'رجال', 'Men'],
      ['women', 'نساء', 'Women'],
      ['bags', 'حقائب', 'Bags'],
      ['new-arrivals', 'وصل حديثاً', 'New Arrivals'],
      ['collections', 'المجموعات', 'Collections'],
    ],
    products: [
      ['milano-oversized-blazer', 'بليزر ميلانو الواسع', 'Milano Oversized Blazer', 'jackets', 245000, 12, 'A softly structured, single-breasted blazer with a relaxed, considered silhouette.', 'maison-jacket.jpg'],
      ['elise-satin-dress', 'فستان إليز الساتان', 'Élise Satin Dress', 'dresses', 198000, 16, 'Fluid satin drapes beautifully in this occasion-ready midi dress.', 'maison-dress.jpg'],
      ['essential-linen-shirt', 'قميص الكتان الأساسي', 'Essential Linen Shirt', 'shirts', 98000, 28, 'Breathable European linen in an easy fit for warm, unhurried days.', 'maison-shirt.jpg'],
      ['monaco-leather-shoes', 'حذاء موناكو الجلدي', 'Monaco Leather Shoes', 'shoes', 275000, 10, 'Polished leather and a timeless profile, finished for all-day comfort.', 'maison-shoes.jpg'],
      ['signature-handbag', 'حقيبة سيغنتشر', 'Signature Handbag', 'accessories', 225000, 14, 'A versatile structured handbag with considered details and a clean profile.', 'maison-bag.jpg'],
      ['classic-wool-coat', 'معطف الصوف الكلاسيكي', 'Classic Wool Coat', 'jackets', 365000, 8, 'A longline wool-blend coat with a generous collar and refined drape.', 'maison-coat.jpg'],
      ['studio-knit-top', 'قطعة ستوديو المحبوكة', 'Studio Knit Top', 'shirts', 112000, 19, 'A fine-gauge knit with a clean neckline and beautifully soft hand feel.', 'maison-knit.jpg'],
      ['evening-clutch', 'حقيبة سهرة', 'Evening Clutch', 'accessories', 145000, 11, 'An understated evening companion with a satin finish and detachable chain.', 'maison-clutch.jpg'],
      ...additionalMaisonProducts,
    ],
  },
] as const;

export async function ensureDemoData(): Promise<void> {
  const adminHash = await bcrypt.hash(DEMO_ADMIN.password, 12);
  const ownerHash = await bcrypt.hash(DEMO_OWNER.password, 12);
  const customerHash = await bcrypt.hash(DEMO_CUSTOMER.password, 12);
  // Hash outside the transaction: bcrypt is CPU-bound and would otherwise eat into the transaction timeout.
  const luxuryHashes = new Map<string, string>();
  for (const demo of LUXURY_DEMOS) {
    for (const account of [demo.owner, demo.staff]) {
      luxuryHashes.set(account.email, await bcrypt.hash(account.password, 12));
    }
  }

  await db.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { email: DEMO_ADMIN.email },
      update: {},
      create: {
        email: DEMO_ADMIN.email,
        phone: DEMO_ADMIN.phone,
        password: adminHash,
        role: UserRole.PLATFORM_ADMIN,
        isActive: true,
      },
    });

    const store = await tx.store.upsert({
      where: { slug: 'demo' },
      update: {},
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
      },
    });

    const owner = await tx.user.upsert({
      where: { email: DEMO_OWNER.email },
      update: {},
      create: {
        email: DEMO_OWNER.email,
        phone: DEMO_OWNER.phone,
        password: ownerHash,
        role: UserRole.STORE_OWNER,
        storeId: store.id,
        isActive: true,
      },
    });

    await tx.storeAdmin.upsert({
      where: { userId_storeId: { userId: owner.id, storeId: store.id } },
      update: {},
      create: {
        userId: owner.id,
        storeId: store.id,
        permissionLevel: 'OWNER',
      },
    });

    const customer = await tx.user.upsert({
      where: { email: DEMO_CUSTOMER.email },
      update: {},
      create: {
        email: DEMO_CUSTOMER.email,
        phone: DEMO_CUSTOMER.phone,
        password: customerHash,
        role: UserRole.CUSTOMER,
        isActive: true,
      },
    });

    await tx.customer.upsert({
      where: { id: customer.id },
      update: {},
      create: {
        id: customer.id,
        phone: customer.phone ?? DEMO_CUSTOMER.phone,
        email: customer.email,
        firstName: 'Demo',
        lastName: 'Customer',
        defaultLanguage: 'ar-SA',
        isActive: true,
      },
    });

    const existingCustomerStore = await tx.customerStore.findFirst({
      where: { userId: customer.id, storeId: store.id },
      select: { id: true },
    });
    if (!existingCustomerStore) {
      await tx.customerStore.create({
        data: { userId: customer.id, storeId: store.id },
      });
    }

    const category = await tx.category.upsert({
      where: { storeId_slug: { storeId: store.id, slug: 'electronics' } },
      update: {},
      create: {
        storeId: store.id,
        nameAr: 'الإلكترونيات',
        nameEn: 'Electronics',
        slug: 'electronics',
        sortOrder: 1,
        isActive: true,
      },
    });

    await tx.category.upsert({
      where: { storeId_slug: { storeId: store.id, slug: 'fashion' } },
      update: {},
      create: {
        storeId: store.id,
        nameAr: 'الموضة',
        nameEn: 'Fashion',
        slug: 'fashion',
        sortOrder: 2,
        isActive: true,
      },
    });

    await tx.product.upsert({
      where: { storeId_slug: { storeId: store.id, slug: 'smartphone-pro' } },
      update: {},
      create: {
        storeId: store.id,
        categoryId: category.id,
        nameAr: 'هاتف ذكي برو',
        nameEn: 'Smartphone Pro',
        slug: 'smartphone-pro',
        price: new Prisma.Decimal('899.00'),
        stock: 24,
        status: 'ACTIVE',
        descriptionAr: 'هاتف ذكي متقدم مناسب للمستخدم اليومي.',
        descriptionEn: 'Advanced smartphone for everyday productivity.',
      },
    });

    await tx.product.upsert({
      where: { storeId_slug: { storeId: store.id, slug: 'classic-shirt' } },
      update: {},
      create: {
        storeId: store.id,
        categoryId: (await tx.category.findFirstOrThrow({ where: { storeId: store.id, slug: 'fashion' } })).id,
        nameAr: 'قميص كلاسيكي',
        nameEn: 'Classic Shirt',
        slug: 'classic-shirt',
        price: new Prisma.Decimal('120.00'),
        stock: 40,
        status: 'ACTIVE',
        descriptionAr: 'قميص أنيق مناسب للاستخدام اليومي.',
        descriptionEn: 'Classic shirt for everyday comfort.',
      },
    });

    await ensureLuxuryStores(tx, luxuryHashes);

    logger.info('Demo data ensured for SmartStore.');
  }, {
    // Remote demo bootstrap includes both complete catalogs; allow time for the atomic upserts.
    maxWait: 10000,
    timeout: 120000,
  });
}

async function ensureLuxuryStores(
  tx: Prisma.TransactionClient,
  passwordHashes: ReadonlyMap<string, string>,
): Promise<void> {
  const hashFor = (email: string): string => {
    const hash = passwordHashes.get(email);
    if (!hash) throw new Error(`Missing demo password hash for ${email}`);
    return hash;
  };

  for (const [storeIndex, demo] of LUXURY_DEMOS.entries()) {
    const store = await tx.store.upsert({
      where: { slug: demo.slug },
      update: {
        name: demo.name,
        description: demo.description,
        phone: demo.phone,
        email: demo.email,
        address: demo.address,
        city: 'Baghdad',
        primaryColor: demo.primaryColor,
        secondaryColor: demo.secondaryColor,
        status: 'ACTIVE',
        defaultCurrency: 'IQD',
        locale: 'ar-IQ',
        dir: 'rtl',
      },
      create: {
        name: demo.name,
        slug: demo.slug,
        description: demo.description,
        phone: demo.phone,
        whatsapp: demo.phone,
        email: demo.email,
        address: demo.address,
        city: 'Baghdad',
        primaryColor: demo.primaryColor,
        secondaryColor: demo.secondaryColor,
        status: 'ACTIVE',
        defaultCurrency: 'IQD',
        locale: 'ar-IQ',
        dir: 'rtl',
      },
    });

    const unexpectedProducts = await tx.product.count({
      where: { storeId: store.id, slug: { notIn: demo.products.map(([slug]) => slug) } },
    });
    if (unexpectedProducts) {
      throw new Error(`Refusing to replace business data: ${demo.slug} contains ${unexpectedProducts} products outside the managed demo catalog`);
    }

    const owner = await tx.user.upsert({
      where: { email: demo.owner.email },
      update: { isActive: true, storeId: store.id },
      create: {
        email: demo.owner.email,
        phone: demo.owner.phone,
        password: hashFor(demo.owner.email),
        firstName: demo.owner.name,
        role: UserRole.STORE_OWNER,
        storeId: store.id,
        isActive: true,
      },
    });
    await tx.storeAdmin.upsert({
      where: { userId_storeId: { userId: owner.id, storeId: store.id } },
      update: { permissionLevel: 'OWNER' },
      create: { userId: owner.id, storeId: store.id, permissionLevel: 'OWNER' },
    });

    const staff = await tx.user.upsert({
      where: { email: demo.staff.email },
      update: { isActive: true, storeId: store.id },
      create: {
        email: demo.staff.email,
        phone: demo.staff.phone,
        password: hashFor(demo.staff.email),
        firstName: demo.staff.name,
        role: UserRole.STAFF,
        storeId: store.id,
        isActive: true,
      },
    });
    await tx.storeAdmin.upsert({
      where: { userId_storeId: { userId: staff.id, storeId: store.id } },
      update: { permissionLevel: 'STAFF' },
      create: { userId: staff.id, storeId: store.id, permissionLevel: 'STAFF' },
    });

    const categoryBySlug = new Map<string, string>();
    for (const [index, [slug, nameAr, nameEn]] of demo.categories.entries()) {
      const category = await tx.category.upsert({
        where: { storeId_slug: { storeId: store.id, slug } },
        update: { nameAr, nameEn, sortOrder: index + 1, isActive: true },
        create: { storeId: store.id, slug, nameAr, nameEn, sortOrder: index + 1, isActive: true },
      });
      categoryBySlug.set(slug, category.id);
    }

    for (const [productIndex, [slug, nameAr, nameEn, categorySlug, price, stock, description, imageFile]] of demo.products.entries()) {
      const categoryId = categoryBySlug.get(categorySlug);
      if (!categoryId) throw new Error(`Missing category ${categorySlug} for ${demo.slug}/${slug}`);
      const product = await tx.product.upsert({
        where: { storeId_slug: { storeId: store.id, slug } },
        update: {
          categoryId, nameAr, nameEn, status: 'ACTIVE',
          descriptionAr: description, descriptionEn: description,
          isFeatured: productIndex < 4,
        },
        create: {
          storeId: store.id,
          categoryId,
          nameAr,
          nameEn,
          slug,
          price: new Prisma.Decimal(price),
          stock,
          sku: `${storeIndex === 0 ? 'VEL' : 'MEL'}-${String(productIndex + 1).padStart(3, '0')}`,
          status: 'ACTIVE',
          isFeatured: productIndex < 4,
          descriptionAr: description,
          descriptionEn: description,
        },
      });
      await tx.productImage.upsert({
        where: { productId: product.id },
        update: { url: `/demo-assets/${imageFile}`, alt: nameEn, isPrimary: true },
        create: { productId: product.id, url: `/demo-assets/${imageFile}`, alt: nameEn, isPrimary: true, order: productIndex },
      });
    }
    const count = await tx.product.count({ where: { storeId: store.id } });
    if (count !== 30) throw new Error(`Expected exactly 30 products for ${demo.slug}, found ${count}`);
    logger.info(`Demo catalog verified: ${demo.slug}, ${count} products`);
  }
}
