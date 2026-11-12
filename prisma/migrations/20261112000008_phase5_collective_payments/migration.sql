-- CreateTable
CREATE TABLE "PaymentBatch" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'TRANSFER',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "totalPaid" BIGINT NOT NULL,
    "allocatedTotal" BIGINT NOT NULL,
    "creditAmount" BIGINT NOT NULL DEFAULT 0,
    "creditOption" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "proofPath" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentBatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentBatch_totalPaid_pos_chk" CHECK ("totalPaid" > 0),
    CONSTRAINT "PaymentBatch_allocatedTotal_pos_chk" CHECK ("allocatedTotal" > 0),
    CONSTRAINT "PaymentBatch_creditAmount_nonneg_chk" CHECK ("creditAmount" >= 0)
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentAllocation_amount_pos_chk" CHECK ("amount" > 0)
);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "batchId" TEXT;

-- CreateIndex
CREATE INDEX "PaymentBatch_businessId_customerId_idx" ON "PaymentBatch"("businessId", "customerId");

-- CreateIndex
CREATE INDEX "PaymentBatch_businessId_status_idx" ON "PaymentBatch"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_key" ON "PaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_batchId_idx" ON "PaymentAllocation"("batchId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_orderId_idx" ON "PaymentAllocation"("orderId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_businessId_batchId_idx" ON "Payment"("businessId", "batchId");

-- AddForeignKey
ALTER TABLE "PaymentBatch" ADD CONSTRAINT "PaymentBatch_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatch" ADD CONSTRAINT "PaymentBatch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PaymentBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PaymentBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

