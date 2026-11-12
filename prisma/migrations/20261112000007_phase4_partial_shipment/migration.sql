-- Fase 4: Pengiriman Parsial (Multi-Kloter) & Opsi Kirim Sebelum Pelunasan

-- 1. Toggle kebijakan pengiriman pada Business (default ketat: false)
ALTER TABLE "Business"
  ADD COLUMN IF NOT EXISTS "allowPartialShipment" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "allowShipBeforeFinalInvoice" BOOLEAN NOT NULL DEFAULT false;

-- 2. Ubah relasi Shipment (1:1 -> 1:N) & tambah nomor kloter
DROP INDEX IF EXISTS "Shipment_orderId_key";

ALTER TABLE "Shipment"
  ADD COLUMN IF NOT EXISTS "kloterNo" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "Shipment_businessId_orderId_idx" ON "Shipment"("businessId", "orderId");
CREATE INDEX IF NOT EXISTS "Shipment_orderId_kloterNo_idx" ON "Shipment"("orderId", "kloterNo");

-- 3. Tabel rincian item per kloter pengiriman
CREATE TABLE IF NOT EXISTS "ShipmentItem" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "qty" INTEGER NOT NULL,
  CONSTRAINT "ShipmentItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShipmentItem_qty_check" CHECK ("qty" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShipmentItem_shipmentId_orderItemId_key" ON "ShipmentItem"("shipmentId", "orderItemId");
CREATE INDEX IF NOT EXISTS "ShipmentItem_orderItemId_idx" ON "ShipmentItem"("orderItemId");

ALTER TABLE "ShipmentItem"
  ADD CONSTRAINT "ShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ShipmentItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Backfill data legacy: untuk setiap Shipment SHIPPED/DELIVERED yang belum memiliki ShipmentItem,
-- salin seluruh item OrderItem terkait agar perhitungan qty terkirim konsisten 100%.
INSERT INTO "ShipmentItem" ("id", "shipmentId", "orderItemId", "qty")
SELECT
  'si_bf_' || md5(s."id" || ':' || oi."id"),
  s."id",
  oi."id",
  oi."qty"
FROM "Shipment" s
JOIN "OrderItem" oi ON oi."orderId" = s."orderId" AND oi."businessId" = s."businessId"
WHERE s."status" IN ('SHIPPED', 'DELIVERED')
  AND oi."qty" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "ShipmentItem" existing
    WHERE existing."shipmentId" = s."id" AND existing."orderItemId" = oi."id"
  );

