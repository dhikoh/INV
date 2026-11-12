-- CreateEnum
CREATE TYPE "CatalogLayoutStyle" AS ENUM ('TABLE', 'PROMO_GRID', 'HERO_SALE', 'EDITORIAL');

-- CreateEnum
CREATE TYPE "PromoValidityType" AS ENUM ('NONE', 'PERIOD');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "instagram" TEXT,
ADD COLUMN     "showWebsiteOnPdf" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tagline" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "Catalog" ADD COLUMN     "ctaText" TEXT,
ADD COLUMN     "isPromo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "layoutStyle" "CatalogLayoutStyle" NOT NULL DEFAULT 'TABLE',
ADD COLUMN     "promoEndAt" TIMESTAMP(3),
ADD COLUMN     "promoHighlight" TEXT,
ADD COLUMN     "promoStartAt" TIMESTAMP(3),
ADD COLUMN     "promoValidityType" "PromoValidityType" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "showSku" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showStrikethroughPrice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subtitle" TEXT,
ADD COLUMN     "termsNote" TEXT,
ADD COLUMN     "validityText" TEXT,
ADD COLUMN     "verifyToken" TEXT;

-- AlterTable
ALTER TABLE "CatalogItem" ADD COLUMN     "badgeText" TEXT,
ADD COLUMN     "itemNote" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "address" TEXT,
ADD COLUMN     "emergencyContact" TEXT,
ADD COLUMN     "identityNotes" TEXT,
ADD COLUMN     "identityVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "ktpPath" TEXT,
ADD COLUMN     "nik" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Catalog_verifyToken_key" ON "Catalog"("verifyToken");

