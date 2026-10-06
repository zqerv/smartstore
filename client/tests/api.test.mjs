import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});

async function loadApi(env) {
  const code = outputText.replaceAll('import.meta.env', JSON.stringify(env));
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('production defaults point to Render without environment overrides', async () => {
  const api = await loadApi({ DEV: false });
  assert.equal(api.API_URL, 'https://smartstore-7pbc.onrender.com/api');
  assert.equal(api.SOCKET_URL, 'https://smartstore-7pbc.onrender.com');
});

test('local development retains localhost defaults', async () => {
  const api = await loadApi({ DEV: true });
  assert.equal(api.API_URL, 'http://localhost:5000/api');
  assert.equal(api.SOCKET_URL, 'http://localhost:5000');
});

test('Vite environment overrides are respected and trailing slashes removed', async () => {
  const api = await loadApi({
    DEV: false,
    VITE_API_URL: 'https://smartstore-7pbc.onrender.com/api///',
    VITE_SOCKET_URL: 'https://smartstore-7pbc.onrender.com/',
  });
  assert.equal(api.API_URL, 'https://smartstore-7pbc.onrender.com/api');
  assert.equal(api.SOCKET_URL, 'https://smartstore-7pbc.onrender.com');
});

test('empty production environment values use Render, not localhost', async () => {
  const api = await loadApi({ DEV: false, VITE_API_URL: '', VITE_SOCKET_URL: '' });
  assert.equal(api.API_URL, 'https://smartstore-7pbc.onrender.com/api');
  assert.equal(api.SOCKET_URL, 'https://smartstore-7pbc.onrender.com');
});

test('login POST targets the production auth endpoint without contacting a backend', async (t) => {
  const api = await loadApi({ DEV: false });
  const payload = JSON.stringify({ email: 'test@example.invalid', password: 'test-only' });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://smartstore-7pbc.onrender.com/api/auth/login');
    assert.equal(options.method, 'POST');
    assert.equal(options.body, payload);
    assert.equal(options.headers.get('Content-Type'), 'application/json');
    return new Response(JSON.stringify({ success: true, data: { token: 'mock-token' } }), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const result = await api.apiRequest('/auth/login', {
    anonymous: true,
    method: 'POST',
    body: payload,
  });
  assert.deepEqual(result, { token: 'mock-token' });
  assert.equal(globalThis.fetch.mock.callCount(), 1);
});

test('network failures retain explicit errors without local port instructions', async (t) => {
  const api = await loadApi({ DEV: false });
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('Network unavailable');
  });
  await assert.rejects(api.apiRequest('/auth/login', { anonymous: true }), (error) => {
    assert.ok(error instanceof api.ApiError);
    assert.equal(error.status, 0);
    assert.equal(error.code, 'NETWORK_ERROR');
    assert.ok(!error.message.includes('5000'));
    return true;
  });
});
