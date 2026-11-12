-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "allowSalesCashPayment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentLegalNotice" TEXT,
ADD COLUMN     "requireTransferProofForSales" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showBankOnProforma" BOOLEAN NOT NULL DEFAULT false;

