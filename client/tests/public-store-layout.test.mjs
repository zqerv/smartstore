import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import ts from 'typescript';

const source = await readFile(new URL('../src/pages/PublicStoreLayout.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
});
const code = outputText
  .replace(/import ['"]\.\/public-store\.css['"];?\s*/, '')
  .replace(/from ['"]([^'"]+)['"]/g, (_, specifier) => `from ${JSON.stringify(import.meta.resolve(specifier))}`);
const { PublicStoreLayout } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

for (const locale of ['ar', 'en']) {
  test(`${locale} public store shell brands commerce without requiring login`, () => {
    const html = renderToStaticMarkup(createElement(StaticRouter, { location: '/store/veloura' },
      createElement(PublicStoreLayout, {
        active: true, locale, setLocale: () => {},
        children: createElement('p', null, 'Real catalog content'),
      })));
    assert.match(html, /class="public-commerce"/);
    assert.match(html, /Real catalog content/);
    assert.match(html, /VAYRON/);
    assert.match(html, /href="\/demo"/);
    assert.doesNotMatch(html, /\/login|SmartStore Demo/);
    assert.match(html, new RegExp(`dir="${locale === 'ar' ? 'rtl' : 'ltr'}" lang="${locale}"`));
  });
}

test('private routes retain their original layout without public branding', () => {
  const html = renderToStaticMarkup(createElement(PublicStoreLayout, {
    active: false, locale: 'ar', setLocale: () => {},
    children: createElement('p', null, 'Private dashboard'),
  }));
  assert.equal(html, '<p>Private dashboard</p>');
});
