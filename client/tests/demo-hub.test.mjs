import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import ts from 'typescript';

const source = await readFile(new URL('../src/pages/DemoHubPage.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
});
const code = outputText
  .replace(/import ['"]\.\/demo-hub\.css['"];?\s*/, '')
  .replace(/from ['"]([^'"]+)['"]/g, (_, specifier) => `from ${JSON.stringify(import.meta.resolve(specifier))}`);
const { DemoHubPage } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

function renderHub(locale) {
  return renderToStaticMarkup(createElement(StaticRouter, { location: '/demo' },
    createElement(DemoHubPage, { locale, setLocale: () => {} })));
}

for (const locale of ['ar', 'en']) {
  test(`${locale} demo hub shows only the two real store links without sign-in or credentials`, () => {
    const html = renderHub(locale);
    assert.equal((html.match(/<article /g) || []).length, 2);
    assert.match(html, /Veloura Parfums/);
    assert.match(html, /Maison Élan/);
    assert.match(html, /href="\/store\/veloura"/);
    assert.match(html, /href="\/store\/maison-elan"/);
    assert.doesNotMatch(html, /SmartStore|href="\/store\/demo"|\/demo\/access|\/login|password|@.*\.demo/i);
    assert.match(html, new RegExp(`dir="${locale === 'ar' ? 'rtl' : 'ltr'}" lang="${locale}"`));
  });
}

test('Arabic hub includes the required VAYRON headline, subtitle and two browse buttons', () => {
  const html = renderHub('ar');
  assert.match(html, /جرّب منظومة/);
  assert.match(html, /VAYRON STORE/);
  assert.match(html, /منصة متكاملة لإدارة وتشغيل المتاجر الإلكترونية/);
  assert.equal((html.match(/<span>تصفح المتجر<\/span>/g) || []).length, 2);
});
