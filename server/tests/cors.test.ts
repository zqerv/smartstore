import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import cors from 'cors';
import express from 'express';
import { getCorsOrigins } from '../src/lib/cors-origins';

const productionOrigin = 'https://vayron-store.vercel.app';

test('production defaults allow only the production frontend', () => {
  assert.deepEqual(getCorsOrigins(undefined, 'production'), [productionOrigin]);
});

test('production allows Vercel even with a stale localhost override', () => {
  assert.deepEqual(getCorsOrigins('http://localhost:5173', 'production'), [
    'http://localhost:5173',
    productionOrigin,
  ]);
});

test('configured origins are preserved, trimmed and deduplicated', () => {
  assert.deepEqual(getCorsOrigins(` https://preview.example.com, ${productionOrigin}, ,${productionOrigin}`, 'production'), [
    'https://preview.example.com',
    productionOrigin,
  ]);
});

test('development and test keep existing local behavior', () => {
  assert.deepEqual(getCorsOrigins(undefined, 'development'), ['http://localhost:5173']);
  assert.deepEqual(getCorsOrigins(undefined, 'test'), ['http://localhost:5173']);
  assert.deepEqual(getCorsOrigins('https://local.example.com', 'development'), ['https://local.example.com']);
});

test('login preflight allows Vercel but not arbitrary origins without loading the backend', async (t) => {
  const app = express();
  app.use(cors({
    origin: getCorsOrigins('http://localhost:5173', 'production'),
    credentials: true,
  }));
  const server = createServer(app);
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/auth/login`;

  for (const origin of [productionOrigin, 'https://untrusted.example.com']) {
    const response = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), origin === productionOrigin ? productionOrigin : null);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  }
});
