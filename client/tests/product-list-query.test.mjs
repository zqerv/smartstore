import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/product-list-query.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { productListQuery } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('admin product queries support arbitrary pages and default all-status browsing', () => {
  const params = new URLSearchParams(productListQuery({
    page: 101, limit: 10, search: '', categoryId: '', status: 'ALL',
  }));
  assert.deepEqual(Object.fromEntries(params), { page: '101', limit: '10', status: 'ALL' });
});

for (const status of ['ACTIVE', 'INACTIVE', 'DRAFT']) {
  test(`admin ${status} search and category filters are encoded for server-side pagination`, () => {
    const params = new URLSearchParams(productListQuery({
      page: 2, limit: 10, search: '  rose & oud  ', categoryId: 'owner-category', status,
    }));
    assert.deepEqual(Object.fromEntries(params), {
      page: '2', limit: '10', status, search: 'rose & oud', categoryId: 'owner-category',
    });
  });
}
