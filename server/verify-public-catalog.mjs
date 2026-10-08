import assert from 'node:assert/strict';

const api = (process.env.VERIFY_API_URL || 'https://smartstore-7pbc.onrender.com/api').replace(/\/+$/, '');
const origin = new URL(api).origin;

async function get(path, headers) {
  const response = await fetch(`${api}${path}`, { headers });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  const body = await response.json();
  assert.equal(body.success, true, `${path}: ${body.message || body.error}`);
  return body.data;
}

const stores = [];
const imageUrls = new Set();
for (const slug of ['veloura', 'maison-elan']) {
  const store = await get(`/stores/${slug}/info`);
  assert.equal(store.slug, slug);
  assert.equal(store.status, 'ACTIVE');
  const [catalog, categoryResult, unfiltered] = await Promise.all([
    get(`/stores/${slug}/catalog/products?limit=100`),
    get(`/stores/${slug}/catalog/categories`),
    get(`/stores/${store.id}/products?limit=100`),
  ]);
  assert.equal(catalog.products.length, Math.min(100, catalog.pagination.total), `${slug}: returned count`);
  assert.equal(unfiltered.pagination.total, catalog.pagination.total, `${slug}: legacy API count`);
  for (let page = 2; page <= catalog.pagination.totalPages; page++) {
    const next = await get(`/stores/${slug}/catalog/products?page=${page}&limit=100`);
    assert.equal(next.pagination.total, catalog.pagination.total, `${slug}: total changed during verification`);
    catalog.products.push(...next.products);
  }
  assert.equal(catalog.products.length, catalog.pagination.total, `${slug}: all pages returned`);
  assert.equal(new Set(catalog.products.map((product) => product.id)).size, catalog.products.length);
  assert.ok(categoryResult.categories.length > 0, `${slug}: categories missing`);
  for (const category of categoryResult.categories) {
    assert.equal(category.storeId, store.id);
    assert.equal(category.isActive, true);
  }
  for (const product of catalog.products) {
    assert.equal(product.storeId, store.id);
    assert.equal(product.category.storeId, store.id);
    assert.equal(product.category.id, product.categoryId);
    assert.equal(product.category.isActive, true);
    assert.equal(product.status, 'ACTIVE');
    assert.ok(product.nameAr && product.slug);
    assert.ok(Number(product.price) >= 0);
    assert.ok(Number(product.stock) >= 0);
    if (product.productImages) {
      assert.equal(product.productImages.productId, product.id);
      assert.ok(product.productImages.url);
      imageUrls.add(new URL(product.productImages.url, origin).href);
    }
    assert.equal('costPrice' in product, false);
    const details = await get(`/stores/${slug}/catalog/products/${product.id}`);
    assert.equal(details.id, product.id);
    assert.equal(details.storeId, store.id);
  }
  const staleSession = await get(`/stores/${slug}/catalog/products`, { Authorization: 'Bearer stale-dashboard-session' });
  assert.equal(staleSession.products.length, Math.min(staleSession.pagination.limit, staleSession.pagination.total));
  stores.push({ ...store, products: catalog.products, categories: categoryResult.categories });
  console.log(`PASS ${slug}: ${catalog.products.length}/${catalog.pagination.total} products, all returned details, categories, active status, stock, prices, image relations and stale-session public access`);
}

for (const [selected, other] of [[stores[0], stores[1]], [stores[1], stores[0]]]) {
  if (other.products.length) {
    const response = await fetch(`${api}/stores/${selected.slug}/catalog/products/${other.products[0].id}`);
    assert.equal(response.status, 404, `${selected.slug}: cross-store detail must be rejected`);
  }
  if (other.categories.length) {
    const categoryFilter = await get(`/stores/${selected.slug}/catalog/products?categoryId=${other.categories[0].id}`);
    assert.equal(categoryFilter.products.length, 0);
    assert.equal(categoryFilter.pagination.total, 0);
  }
}

for (const url of imageUrls) {
  const response = await fetch(url);
  assert.equal(response.status, 200, url);
  const contentType = response.headers.get('content-type') || '';
  assert.match(contentType, /^image\//);
  if (contentType.startsWith('image/jpeg')) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(bytes[0], 0xff, url);
    assert.equal(bytes[1], 0xd8, url);
  }
}

console.log(`PASS production API: ${stores.reduce((total, store) => total + store.products.length, 0)} returned products, tenant isolation, ${imageUrls.size} verified image assets. No writes or orders performed.`);
