-- Section 6.8 Constraint dan indeks yang Prisma tidak bisa buat

ALTER TABLE "Product" ADD CONSTRAINT product_min_le_base CHECK ("minPrice" <= "basePrice");
ALTER TABLE "Product" ADD CONSTRAINT product_money_nonneg CHECK ("costPrice" >= 0 AND "basePrice" >= 0 AND "minPrice" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT product_reserved_nonneg CHECK ("reservedQty" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT order_money_nonneg CHECK ("subtotal" >= 0 AND "discountTotal" >= 0 AND "shippingCharge" >= 0 AND "grandTotal" >= 0 AND "dpAmount" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT order_dp_range CHECK ("dpBps" >= 0 AND "dpBps" <= 9900);
ALTER TABLE "OrderItem" ADD CONSTRAINT orderitem_qty_pos CHECK ("qty" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT payment_amount_pos CHECK ("amount" > 0);
ALTER TABLE "Invoice" ADD CONSTRAINT invoice_amount_nonneg CHECK ("amount" >= 0 AND "paidAmount" >= 0);

-- hanya satu invoice aktif per order dan tipe (revisi dibuat setelah yang lama ditolak, ditarik, atau di-void)
CREATE UNIQUE INDEX invoice_one_active_per_type ON "Invoice" ("orderId", "type")
  WHERE "status" IN ('PENDING_APPROVAL', 'APPROVED') AND "deletedAt" IS NULL;

-- satu pengingat aktif per customer dan produk (NULL dianggap sama lewat COALESCE)
CREATE UNIQUE INDEX reminder_one_per_target ON "Reminder" ("customerId", COALESCE("productId", ''))
  WHERE "status" IN ('ACTIVE', 'PAUSED');

-- Section 16.5 Audit log immutable trigger
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog tidak boleh diubah atau dihapus';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
