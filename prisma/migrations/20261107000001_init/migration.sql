-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPERADMIN', 'SALES');

-- CreateEnum
CREATE TYPE "InvoiceTheme" AS ENUM ('PROFESIONAL', 'FAMILY', 'MINIMALIS', 'MODERN', 'KLASIK');

-- CreateEnum
CREATE TYPE "CommissionMode" AS ENUM ('PERCENT_OF_PROFIT', 'PERCENT_OF_REVENUE', 'TIERED_BY_TARGET', 'FIXED_PER_ORDER');

-- CreateEnum
CREATE TYPE "CommissionTrigger" AS ENUM ('ON_FULL_PAID', 'ON_DP_PAID');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('EARNED', 'PAID', 'REVERSED');

-- CreateEnum
CREATE TYPE "VendorKind" AS ENUM ('SUPPLIER', 'TRANSPORT');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('LEAD', 'PROSPECT', 'DEAL', 'REPEAT', 'LOST');

-- CreateEnum
CREATE TYPE "PriceField" AS ENUM ('COST', 'BASE', 'MIN', 'CUSTOMER_MIN');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('NONE', 'PERCENT', 'AMOUNT');

-- CreateEnum
CREATE TYPE "DiscountSource" AS ENUM ('MANUAL', 'PROMO', 'SUBSIDY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'REVISION_REQUIRED', 'AWAITING_DP', 'IN_PROCESS', 'FINAL_PENDING_APPROVAL', 'AWAITING_FINAL_PAYMENT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('DP', 'FINAL');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('RECEIPT', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('TRANSFER', 'CASH', 'CREDIT', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'VOID');

-- CreateEnum
CREATE TYPE "ShipMethod" AS ENUM ('OWN_FLEET', 'EXPEDITION', 'TRANSPORT_VENDOR');

-- CreateEnum
CREATE TYPE "ShipStatus" AS ENUM ('PREPARING', 'SHIPPED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "PoStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIAL_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockMoveType" AS ENUM ('PO_RECEIPT', 'SALE_SHIPMENT', 'RETURN_IN', 'ADJUSTMENT', 'OPNAME', 'VOID_REVERSAL');

-- CreateEnum
CREATE TYPE "CreditSettlement" AS ENUM ('OFFSET', 'REFUND', 'CUSTOMER_CREDIT');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReminderSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('CALL', 'VISIT', 'WHATSAPP', 'EMAIL', 'OTHER');

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "npwp" TEXT,
    "logoPath" TEXT,
    "invoiceTheme" "InvoiceTheme" NOT NULL DEFAULT 'PROFESIONAL',
    "invoiceFooterNote" TEXT,
    "ppnEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ppnRateBps" INTEGER NOT NULL DEFAULT 1100,
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "requirePaidBeforeShip" BOOLEAN NOT NULL DEFAULT false,
    "defaultDpBps" INTEGER NOT NULL DEFAULT 5000,
    "dueDays" INTEGER NOT NULL DEFAULT 7,
    "defaultRepeatDays" INTEGER NOT NULL DEFAULT 30,
    "commissionMode" "CommissionMode" NOT NULL DEFAULT 'PERCENT_OF_PROFIT',
    "commissionRateBps" INTEGER NOT NULL DEFAULT 1000,
    "commissionFixedAmount" BIGINT NOT NULL DEFAULT 0,
    "commissionTrigger" "CommissionTrigger" NOT NULL DEFAULT 'ON_FULL_PAID',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "businessId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "telegramChatId" BIGINT,
    "telegramLinkedAt" TIMESTAMP(3),
    "telegramBlocked" BOOLEAN NOT NULL DEFAULT false,
    "commissionMode" "CommissionMode",
    "commissionRateBps" INTEGER,
    "commissionFixedAmount" BIGINT,
    "lastSeenReleaseAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "activeBusinessId" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramLinkCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLinkCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" "VendorKind" NOT NULL DEFAULT 'SUPPLIER',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "picName" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "bankAccountHolder" TEXT,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "categoryId" TEXT,
    "defaultVendorId" TEXT,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "costPrice" BIGINT NOT NULL DEFAULT 0,
    "basePrice" BIGINT NOT NULL,
    "minPrice" BIGINT NOT NULL,
    "stockQty" INTEGER NOT NULL DEFAULT 0,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "minStockAlert" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rev" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerId" TEXT,
    "field" "PriceField" NOT NULL,
    "oldValue" BIGINT,
    "newValue" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "shippingAddress" TEXT,
    "billingAddress" TEXT,
    "npwp" TEXT,
    "assignedSalesId" TEXT,
    "pipelineStage" "PipelineStage" NOT NULL DEFAULT 'LEAD',
    "tags" TEXT[],
    "notes" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerMinPrice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "minPrice" BIGINT NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerMinPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPromo" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT,
    "label" TEXT NOT NULL,
    "source" "DiscountSource" NOT NULL,
    "type" "DiscountType" NOT NULL,
    "valueBps" INTEGER,
    "valueAmount" BIGINT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerPromo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmInteraction" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "salesId" TEXT NOT NULL,
    "type" "InteractionType" NOT NULL,
    "summary" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "nextFollowUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTask" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerSalesNote" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "salesId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerSalesNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesTarget" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "salesId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "targetRevenue" BIGINT NOT NULL,
    "targetProfit" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "SalesTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionTier" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "minAchievementBps" INTEGER NOT NULL,
    "rateBps" INTEGER NOT NULL,

    CONSTRAINT "CommissionTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "salesId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "rev" INTEGER NOT NULL DEFAULT 0,
    "customerSeq" INTEGER,
    "orderNo" TEXT,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "deliveryAddress" TEXT,
    "notes" TEXT,
    "repeatIntervalDays" INTEGER,
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "discountTotal" BIGINT NOT NULL DEFAULT 0,
    "shippingCharge" BIGINT NOT NULL DEFAULT 0,
    "ppnEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ppnRateBps" INTEGER NOT NULL DEFAULT 0,
    "ppnAmount" BIGINT NOT NULL DEFAULT 0,
    "grandTotal" BIGINT NOT NULL DEFAULT 0,
    "dpBps" INTEGER NOT NULL DEFAULT 0,
    "dpAmount" BIGINT NOT NULL DEFAULT 0,
    "hasBelowMin" BOOLEAN NOT NULL DEFAULT false,
    "belowMinReason" TEXT,
    "overrideNote" TEXT,
    "rejectReason" TEXT,
    "paidTotal" BIGINT NOT NULL DEFAULT 0,
    "creditTotal" BIGINT NOT NULL DEFAULT 0,
    "stockReserved" BOOLEAN NOT NULL DEFAULT false,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
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

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderCost" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "number" TEXT,
    "amount" BIGINT NOT NULL,
    "paidAmount" BIGINT NOT NULL DEFAULT 0,
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "theme" "InvoiceTheme",
    "snapshot" JSONB,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "printedCount" INTEGER NOT NULL DEFAULT 0,
    "lastPrintedAt" TIMESTAMP(3),
    "rev" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "type" "PaymentType" NOT NULL DEFAULT 'RECEIPT',
    "method" "PaymentMethod" NOT NULL DEFAULT 'TRANSFER',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "amount" BIGINT NOT NULL,
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

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliveryNo" TEXT,
    "method" "ShipMethod" NOT NULL,
    "transporterId" TEXT,
    "trackingNo" TEXT,
    "driverName" TEXT,
    "vehiclePlate" TEXT,
    "receiverName" TEXT,
    "status" "ShipStatus" NOT NULL DEFAULT 'PREPARING',
    "actualCost" BIGINT NOT NULL DEFAULT 0,
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "settlement" "CreditSettlement" NOT NULL,
    "amountExPpn" BIGINT NOT NULL,
    "ppnAmount" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL,
    "cogsReversed" BIGINT NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNoteItem" (
    "id" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "creditAmount" BIGINT NOT NULL,
    "restock" BOOLEAN NOT NULL DEFAULT true,
    "costReversed" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "CreditNoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCreditEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" TEXT,
    "creditNoteId" TEXT,
    "paymentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerCreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "vendorSeq" INTEGER,
    "poNo" TEXT,
    "status" "PoStatus" NOT NULL DEFAULT 'DRAFT',
    "orderDate" TIMESTAMP(3) NOT NULL,
    "expectedDate" TIMESTAMP(3),
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "shippingCost" BIGINT NOT NULL DEFAULT 0,
    "otherCost" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "paidTotal" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "receivedQty" INTEGER NOT NULL DEFAULT 0,
    "unitCost" BIGINT NOT NULL,
    "lineTotal" BIGINT NOT NULL,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorPayment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "amount" BIGINT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'TRANSFER',
    "reference" TEXT,
    "proofPath" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),

    CONSTRAINT "VendorPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "StockMoveType" NOT NULL,
    "qtyDelta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "salesId" TEXT NOT NULL,
    "mode" "CommissionMode" NOT NULL,
    "basisAmount" BIGINT NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'EARNED',
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "CommissionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT,
    "salesId" TEXT NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "lastOrderDate" TIMESTAMP(3) NOT NULL,
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "ReminderSource" NOT NULL DEFAULT 'AUTO',
    "snoozedUntil" TIMESTAMP(3),
    "lastNotifiedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkPath" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "telegramSentAt" TIMESTAMP(3),
    "telegramError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Catalog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "customerId" TEXT,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentCounter" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "actorId" TEXT,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseNote" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "broadcastAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Business_code_key" ON "Business"("code");

-- CreateIndex
CREATE INDEX "BankAccount_businessId_idx" ON "BankAccount"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- CreateIndex
CREATE INDEX "User_businessId_idx" ON "User"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "LoginAttempt_username_createdAt_idx" ON "LoginAttempt"("username", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt"("ip", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLinkCode_codeHash_key" ON "TelegramLinkCode"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "Category_businessId_name_key" ON "Category"("businessId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_businessId_code_key" ON "Vendor"("businessId", "code");

-- CreateIndex
CREATE INDEX "Product_businessId_isActive_idx" ON "Product"("businessId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Product_businessId_sku_key" ON "Product"("businessId", "sku");

-- CreateIndex
CREATE INDEX "ProductImage_businessId_productId_idx" ON "ProductImage"("businessId", "productId");

-- CreateIndex
CREATE INDEX "PriceHistory_businessId_productId_createdAt_idx" ON "PriceHistory"("businessId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_businessId_assignedSalesId_idx" ON "Customer"("businessId", "assignedSalesId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_businessId_code_key" ON "Customer"("businessId", "code");

-- CreateIndex
CREATE INDEX "CustomerMinPrice_businessId_idx" ON "CustomerMinPrice"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMinPrice_customerId_productId_key" ON "CustomerMinPrice"("customerId", "productId");

-- CreateIndex
CREATE INDEX "CustomerPromo_businessId_customerId_idx" ON "CustomerPromo"("businessId", "customerId");

-- CreateIndex
CREATE INDEX "CrmInteraction_businessId_customerId_occurredAt_idx" ON "CrmInteraction"("businessId", "customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "CrmTask_businessId_assignedToId_dueAt_idx" ON "CrmTask"("businessId", "assignedToId", "dueAt");

-- CreateIndex
CREATE INDEX "OwnerSalesNote_businessId_salesId_idx" ON "OwnerSalesNote"("businessId", "salesId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTarget_salesId_month_key" ON "SalesTarget"("salesId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionTier_businessId_minAchievementBps_key" ON "CommissionTier"("businessId", "minAchievementBps");

-- CreateIndex
CREATE INDEX "Order_businessId_status_idx" ON "Order"("businessId", "status");

-- CreateIndex
CREATE INDEX "Order_businessId_salesId_createdAt_idx" ON "Order"("businessId", "salesId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_businessId_orderNo_key" ON "Order"("businessId", "orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "Order_businessId_customerId_customerSeq_key" ON "Order"("businessId", "customerId", "customerSeq");

-- CreateIndex
CREATE INDEX "OrderItem_businessId_orderId_idx" ON "OrderItem"("businessId", "orderId");

-- CreateIndex
CREATE INDEX "OrderCost_businessId_orderId_idx" ON "OrderCost"("businessId", "orderId");

-- CreateIndex
CREATE INDEX "Invoice_businessId_status_idx" ON "Invoice"("businessId", "status");

-- CreateIndex
CREATE INDEX "Invoice_orderId_idx" ON "Invoice"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_businessId_number_key" ON "Invoice"("businessId", "number");

-- CreateIndex
CREATE INDEX "Payment_businessId_orderId_idx" ON "Payment"("businessId", "orderId");

-- CreateIndex
CREATE INDEX "Payment_businessId_status_idx" ON "Payment"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_orderId_key" ON "Shipment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_deliveryNo_key" ON "Shipment"("deliveryNo");

-- CreateIndex
CREATE INDEX "CreditNote_businessId_orderId_idx" ON "CreditNote"("businessId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_businessId_number_key" ON "CreditNote"("businessId", "number");

-- CreateIndex
CREATE INDEX "CustomerCreditEntry_businessId_customerId_idx" ON "CustomerCreditEntry"("businessId", "customerId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_businessId_vendorId_idx" ON "PurchaseOrder"("businessId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_businessId_poNo_key" ON "PurchaseOrder"("businessId", "poNo");

-- CreateIndex
CREATE INDEX "VendorPayment_businessId_vendorId_idx" ON "VendorPayment"("businessId", "vendorId");

-- CreateIndex
CREATE INDEX "StockMovement_businessId_productId_createdAt_idx" ON "StockMovement"("businessId", "productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionEntry_orderId_key" ON "CommissionEntry"("orderId");

-- CreateIndex
CREATE INDEX "CommissionEntry_businessId_salesId_earnedAt_idx" ON "CommissionEntry"("businessId", "salesId", "earnedAt");

-- CreateIndex
CREATE INDEX "Reminder_businessId_status_nextDueDate_idx" ON "Reminder"("businessId", "status", "nextDueDate");

-- CreateIndex
CREATE INDEX "Reminder_customerId_productId_idx" ON "Reminder"("customerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Catalog_businessId_ownerId_idx" ON "Catalog"("businessId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_catalogId_productId_key" ON "CatalogItem"("catalogId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentCounter_businessId_scope_scopeId_key" ON "DocumentCounter"("businessId", "scope", "scopeId");

-- CreateIndex
CREATE INDEX "AuditLog_businessId_entityType_entityId_idx" ON "AuditLog"("businessId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramLinkCode" ADD CONSTRAINT "TelegramLinkCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_defaultVendorId_fkey" FOREIGN KEY ("defaultVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_assignedSalesId_fkey" FOREIGN KEY ("assignedSalesId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMinPrice" ADD CONSTRAINT "CustomerMinPrice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPromo" ADD CONSTRAINT "CustomerPromo_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmInteraction" ADD CONSTRAINT "CrmInteraction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNoteItem" ADD CONSTRAINT "CreditNoteItem_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditEntry" ADD CONSTRAINT "CustomerCreditEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Catalog" ADD CONSTRAINT "Catalog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

