import { prisma } from '@/lib/db';

export async function resetDb() {
  const tables = [
    'ReleaseNote',
    'AuditLog',
    'DocumentCounter',
    'CatalogItem',
    'Catalog',
    'Notification',
    'Reminder',
    'CommissionEntry',
    'StockMovement',
    'VendorPayment',
    'PurchaseOrderItem',
    'PurchaseOrder',
    'CustomerCreditEntry',
    'CreditNoteItem',
    'CreditNote',
    'Shipment',
    'Payment',
    'Invoice',
    'OrderCost',
    'OrderItem',
    'Order',
    'CommissionTier',
    'SalesTarget',
    'OwnerSalesNote',
    'CrmTask',
    'CrmInteraction',
    'CustomerPromo',
    'CustomerMinPrice',
    'Customer',
    'PriceHistory',
    'ProductImage',
    'Product',
    'Vendor',
    'Category',
    'TelegramLinkCode',
    'LoginAttempt',
    'Session',
    'User',
    'BankAccount',
    'Business',
  ];

  try {
    for (const table of tables) {
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;`
      );
    }
  } catch {
    // Graceful fallback for mock/in-memory environments
  }
}
