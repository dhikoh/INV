-- CreateEnum
CREATE TYPE "OrderRevisionStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "OrderRevision" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "status" "OrderRevisionStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "reason" TEXT NOT NULL,
    "belowMinReason" TEXT,
    "overrideNote" TEXT,
    "rejectReason" TEXT,
    "deliveryAddress" TEXT,
    "shippingCharge" BIGINT NOT NULL DEFAULT 0,
    "ppnEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ppnRateBps" INTEGER NOT NULL DEFAULT 0,
    "oldSubtotal" BIGINT NOT NULL,
    "oldDiscountTotal" BIGINT NOT NULL DEFAULT 0,
    "oldPpnAmount" BIGINT NOT NULL DEFAULT 0,
    "oldGrandTotal" BIGINT NOT NULL,
    "newSubtotal" BIGINT NOT NULL,
    "newDiscountTotal" BIGINT NOT NULL DEFAULT 0,
    "newPpnAmount" BIGINT NOT NULL DEFAULT 0,
    "newGrandTotal" BIGINT NOT NULL,
    "hasBelowMin" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderRevisionItem" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "oldQty" INTEGER NOT NULL DEFAULT 0,
    "newQty" INTEGER NOT NULL,
    "listPrice" BIGINT NOT NULL,
    "unitPrice" BIGINT NOT NULL,
    "discountType" "DiscountType" NOT NULL DEFAULT 'NONE',
    "discountValue" BIGINT NOT NULL DEFAULT 0,
    "discountSource" "DiscountSource" NOT NULL DEFAULT 'MANUAL',
    "lineSubtotal" BIGINT NOT NULL,
    "lineDiscount" BIGINT NOT NULL,
    "lineNet" BIGINT NOT NULL,
    "costPrice" BIGINT NOT NULL,
    "floorPrice" BIGINT NOT NULL,
    "belowMin" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderRevisionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderRevision_businessId_status_idx" ON "OrderRevision"("businessId", "status");

-- CreateIndex
CREATE INDEX "OrderRevision_orderId_idx" ON "OrderRevision"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderRevision_businessId_orderId_revisionNo_key" ON "OrderRevision"("businessId", "orderId", "revisionNo");

-- CreateIndex
CREATE INDEX "OrderRevisionItem_revisionId_idx" ON "OrderRevisionItem"("revisionId");

-- AddForeignKey
ALTER TABLE "OrderRevision" ADD CONSTRAINT "OrderRevision_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRevision" ADD CONSTRAINT "OrderRevision_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRevisionItem" ADD CONSTRAINT "OrderRevisionItem_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "OrderRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

