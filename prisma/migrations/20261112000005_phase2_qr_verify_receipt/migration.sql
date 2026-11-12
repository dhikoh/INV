-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "verifyToken" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "verifyToken" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "receiptNo" TEXT,
ADD COLUMN     "verifyToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_verifyToken_key" ON "Invoice"("verifyToken");

-- CreateIndex
CREATE UNIQUE INDEX "Order_verifyToken_key" ON "Order"("verifyToken");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_verifyToken_key" ON "Payment"("verifyToken");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_businessId_receiptNo_key" ON "Payment"("businessId", "receiptNo");

