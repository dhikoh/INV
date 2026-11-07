import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { env } from './env';

export const TENANT_MODELS = new Set([
  'BankAccount',
  'Category',
  'Vendor',
  'Product',
  'ProductImage',
  'PriceHistory',
  'Customer',
  'CustomerMinPrice',
  'CustomerPromo',
  'CrmInteraction',
  'CrmTask',
  'OwnerSalesNote',
  'SalesTarget',
  'CommissionTier',
  'Order',
  'OrderItem',
  'OrderCost',
  'Invoice',
  'Payment',
  'Shipment',
  'CreditNote',
  'CustomerCreditEntry',
  'PurchaseOrder',
  'VendorPayment',
  'StockMovement',
  'CommissionEntry',
  'Reminder',
  'Catalog',
  'DocumentCounter',
]);

export const GUARDED_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

export function createPrismaClient() {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const baseClient = new PrismaClient({ adapter });

  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (TENANT_MODELS.has(model) && GUARDED_OPS.has(operation)) {
            const where = (args as { where?: Record<string, unknown> })?.where;
            if (!where || !('businessId' in where)) {
              throw new Error(`Query ${model}.${operation} tanpa businessId`);
            }
          }
          return query(args);
        },
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
