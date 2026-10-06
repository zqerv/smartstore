DROP INDEX IF EXISTS "coupon_usages_couponId_key";
CREATE INDEX IF NOT EXISTS "coupon_usages_couponId_idx" ON "coupon_usages"("couponId");
