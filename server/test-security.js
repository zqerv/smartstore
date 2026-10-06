require('dotenv').config();

const { createHash } = require('crypto');
const { PrismaClient } = require('@prisma/client');

const BASE_URL = process.env.SMARTSTORE_API_URL || 'http://localhost:5000';
const db = new PrismaClient();
const sha = (value) => createHash('sha256').update(value).digest('hex');

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(new URL(path, BASE_URL), {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: response.status, payload };
}

function expect(result, status, label) {
  if (result.status !== status) {
    throw new Error(`${label}: expected HTTP ${status}, got ${result.status}; ${JSON.stringify(result.payload)}`);
  }
  console.log(`✓ ${label} (${result.status})`);
  return result.payload?.data;
}

// 1x1 transparent PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function run() {
  if (process.env.SMARTSTORE_ALLOW_MUTATION_TESTS !== 'true') {
    throw new Error('Set SMARTSTORE_ALLOW_MUTATION_TESTS=true to run tests that create and clean up their own accounts.');
  }
  const suffix = Date.now().toString().slice(-8);
  const phone = `+9647${suffix}`;
  let userId = null;
  const storeUser = {};
  try {
    const owner = expect(await request('/api/auth/login', { method: 'POST', body: { email: 'owner@demo.com', password: 'Owner123!' } }), 200, 'Owner login');
    const admin = expect(await request('/api/auth/login', { method: 'POST', body: { email: 'admin@smartstore.demo', password: 'Admin123!' } }), 200, 'Admin login');
    storeUser.storeId = owner.user.storeId;

    // Account security: register, refresh, logout revocation, password change.
    const registered = expect(await request('/api/auth/register', { method: 'POST', body: { phone, password: 'Passw0rd!1', firstName: 'Sec' } }), 201, 'Register temporary customer');
    userId = registered.user.id;
    const first = registered.token;
    expect(await request('/api/auth/me', { token: first }), 200, 'Token works');
    const refreshed = expect(await request('/api/auth/refresh', { method: 'POST', token: first }), 200, 'Refresh issues token');
    expect(await request('/api/auth/refresh', { method: 'POST' }), 401, 'Refresh requires authentication');
    expect(await request('/api/auth/logout', { method: 'POST', token: refreshed.token }), 200, 'Logout');
    expect(await request('/api/auth/me', { token: refreshed.token }), 401, 'Revoked token rejected');
    expect(await request('/api/auth/me', { token: first }), 401, 'Older token also revoked');

    const relogin = expect(await request('/api/auth/login', { method: 'POST', body: { phone, password: 'Passw0rd!1' } }), 200, 'Login after logout');
    const changed = expect(await request('/api/auth/change-password', { method: 'POST', token: relogin.token, body: { currentPassword: 'Passw0rd!1', newPassword: 'Passw0rd!2' } }), 200, 'Change password');
    expect(await request('/api/auth/me', { token: relogin.token }), 401, 'Old token revoked after password change');
    expect(await request('/api/auth/me', { token: changed.token }), 200, 'New token from password change works');

    // Password reset: unknown and known accounts get the same answer; only a hash is stored.
    const unknown = expect(await request('/api/auth/forgot-password', { method: 'POST', body: { identifier: '+9640000000000' } }), 200, 'Forgot password (unknown account)');
    const known = expect(await request('/api/auth/forgot-password', { method: 'POST', body: { identifier: phone } }), 200, 'Forgot password (known account)');
    if (unknown.message !== known.message) throw new Error('Forgot-password response leaks account existence');
    if (known.deliveryConfigured !== false) throw new Error('Delivery must report not configured');
    const stored = await db.authToken.findFirst({ where: { userId, type: 'PASSWORD_RESET' } });
    if (!stored || stored.tokenHash.length !== 64) throw new Error('Reset token hash was not stored');
    expect(await request('/api/auth/reset-password', { method: 'POST', body: { token: 'a'.repeat(64), newPassword: 'Passw0rd!3' } }), 400, 'Reset with unknown token rejected');
    const knownToken = 'b'.repeat(64);
    await db.authToken.update({ where: { id: stored.id }, data: { tokenHash: sha(knownToken) } });
    expect(await request('/api/auth/reset-password', { method: 'POST', body: { token: knownToken, newPassword: 'Passw0rd!3' } }), 200, 'Reset with valid token');
    expect(await request('/api/auth/reset-password', { method: 'POST', body: { token: knownToken, newPassword: 'Passw0rd!4' } }), 400, 'Reset token is single-use');
    expect(await request('/api/auth/me', { token: changed.token }), 401, 'Tokens revoked after reset');
    const afterReset = expect(await request('/api/auth/login', { method: 'POST', body: { phone, password: 'Passw0rd!3' } }), 200, 'Login with reset password');
    const expiredToken = 'c'.repeat(64);
    await db.authToken.create({ data: { userId, type: 'PASSWORD_RESET', tokenHash: sha(expiredToken), expiresAt: new Date(Date.now() - 1000) } });
    expect(await request('/api/auth/reset-password', { method: 'POST', body: { token: expiredToken, newPassword: 'Passw0rd!5' } }), 400, 'Expired reset token rejected');

    // Phone OTP: delivery is provider dependent, verification logic is real.
    const otp = expect(await request('/api/auth/request-otp', { method: 'POST', token: afterReset.token }), 200, 'Request OTP');
    if (otp.delivered !== false || !String(otp.status).includes('PROVIDER CONFIGURATION REQUIRED')) throw new Error('OTP must not claim delivery without a provider');
    const otpRow = await db.authToken.findFirst({ where: { userId, type: 'PHONE_OTP' } });
    await db.authToken.update({ where: { id: otpRow.id }, data: { tokenHash: sha(`${userId}:123456`) } });
    expect(await request('/api/auth/verify-otp', { method: 'POST', token: afterReset.token, body: { code: '654321' } }), 400, 'Wrong OTP rejected');
    expect(await request('/api/auth/verify-otp', { method: 'POST', token: afterReset.token, body: { code: '123456' } }), 200, 'Correct OTP verifies phone');
    const verifiedUser = await db.user.findUnique({ where: { id: userId }, select: { isPhoneVerified: true } });
    if (!verifiedUser.isPhoneVerified) throw new Error('Phone was not marked verified');

    // Payments stay provider dependent.
    // Uploads
    const upload = expect(await request(`/api/stores/${storeUser.storeId}/uploads`, { method: 'POST', token: owner.token, body: { kind: 'logo', dataBase64: PNG } }), 201, 'Upload PNG logo');
    storeUser.uploadUrl = upload.url;
    const served = await fetch(new URL(upload.url, BASE_URL));
    if (served.status !== 200 || !String(served.headers.get('content-type')).includes('image/png')) throw new Error('Uploaded image is not served');
    console.log('✓ Uploaded image is served as image/png');
    expect(await request(`/api/stores/${storeUser.storeId}/uploads`, { method: 'POST', token: owner.token, body: { kind: 'logo', dataBase64: Buffer.from('<svg onload=alert(1)>').toString('base64') } }), 415, 'Non-image upload rejected');
    expect(await request(`/api/stores/${storeUser.storeId}/uploads`, { method: 'POST', token: afterReset.token, body: { kind: 'logo', dataBase64: PNG } }), 403, 'Customer cannot upload');

    // Reports
    const report = expect(await request(`/api/stores/${storeUser.storeId}/reports?days=7`, { token: owner.token }), 200, 'Store report');
    if (report.salesOverTime.length !== 7 || typeof report.totals.revenue !== 'number') throw new Error('Report shape is wrong');
    const realOrders = await db.order.count({ where: { storeId: storeUser.storeId, createdAt: { gte: new Date(report.range.since) } } });
    if (realOrders !== report.totals.orders) throw new Error('Report order count does not match the database');
    console.log('✓ Report totals match database');
    expect(await request(`/api/stores/${storeUser.storeId}/reports`, { token: afterReset.token }), 403, 'Customer cannot read reports');
    expect(await request('/api/stores/not-my-store/reports', { token: owner.token }), 403, 'Owner cannot read another store report');
    expect(await request('/api/platform/reports?days=30', { token: admin.token }), 200, 'Platform report');
    expect(await request('/api/platform/reports', { token: owner.token }), 403, 'Owner cannot read platform report');
    console.log('All security/account tests passed.');
  } finally {
    try {
      if (userId) {
        await db.authToken.deleteMany({ where: { userId } });
        await db.customerStore.deleteMany({ where: { userId } });
        await db.customer.deleteMany({ where: { id: userId } });
        await db.user.deleteMany({ where: { id: userId } });
      }
      if (storeUser.uploadUrl) {
        const fs = require('fs');
        const path = require('path');
        fs.rmSync(path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'), storeUser.uploadUrl.replace('/uploads/', '')), { force: true });
      }
      console.log('Temporary test records cleaned up.');
    } catch (cleanupError) {
      console.error(`TEST_CLEANUP_FAILED=${cleanupError.message}`);
      process.exitCode = 1;
    }
    await db.$disconnect();
  }
}

run().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});
