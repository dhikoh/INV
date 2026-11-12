import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/lib/db';
import { env } from '../src/lib/env';
import { seedSuperAdmin } from '../prisma/seed';
import { importData } from '../src/lib/transfer/import';

const ALL_TABLES = [
  'BankAccount',
  'User',
  'Session',
  'LoginAttempt',
  'TelegramLinkCode',
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
  'CreditNoteItem',
  'CustomerCreditEntry',
  'PurchaseOrder',
  'PurchaseOrderItem',
  'VendorPayment',
  'StockMovement',
  'CommissionEntry',
  'Reminder',
  'Notification',
  'Catalog',
  'CatalogItem',
  'DocumentCounter',
  'AuditLog',
  'ReleaseNote',
  'Business',
] as const;

/**
 * Mereset database ke kondisi bersih operasional BentoCat dari snapshot ZIP,
 * sambil mempertahankan seluruh migrasi dan trigger Postgres.
 */
async function resetCleanBentoCat() {
  const zipArg = process.argv.find((a) => !a.startsWith('--') && a.endsWith('.zip'));
  const zipPath = path.resolve(
    process.cwd(),
    zipArg || path.join('exports', 'omnicat-export-business-BENTOCAT.zip')
  );

  if (!fs.existsSync(zipPath)) {
    throw new Error(`Snapshot ZIP BentoCat tidak ditemukan: ${zipPath}`);
  }

  const saUsername = (process.env.E2E_SUPERADMIN_USERNAME || env.SEED_SUPERADMIN_USERNAME || 'superadmin')
    .trim()
    .toLowerCase();
  const saPassword = process.env.E2E_SUPERADMIN_PASSWORD || env.SEED_SUPERADMIN_PASSWORD;
  if (!saPassword) {
    throw new Error('Wajib setel E2E_SUPERADMIN_PASSWORD atau SEED_SUPERADMIN_PASSWORD di environment / .env');
  }

  console.log('================================================================');
  console.log('🧹 RESET DATABASE BERSIH & RE-IMPOR SNAPSHOT BENTOCAT');
  console.log('================================================================');
  console.log(`Snapshot : ${zipPath}`);

  const tableListSql = ALL_TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableListSql} RESTART IDENTITY CASCADE;`);
  console.log(`✅ Seluruh ${ALL_TABLES.length} tabel database berhasil dibersihkan (TRUNCATE CASCADE).`);

  const superAdmin = await seedSuperAdmin({
    username: saUsername,
    password: saPassword,
  });
  await prisma.user.update({
    where: { id: superAdmin.id },
    data: { mustChangePassword: false },
  });
  console.log(`✅ Akun SuperAdmin (${superAdmin.username}) siap dengan status aktif & mustChangePassword=false.`);

  const zipBytes = fs.readFileSync(zipPath);
  const report = await importData(zipBytes, {
    dryRun: false,
    overwrite: false,
    replaceSeedSuperadmin: false,
    actor: null,
    uploadDir: env.UPLOAD_DIR,
  });

  if (!report.ok) {
    throw new Error(`Impor snapshot gagal: ${report.errors.join(' | ')}`);
  }

  const activeBiz = await prisma.business.findFirst({
    where: { deletedAt: null },
    select: { id: true, code: true },
  });
  const businessId = activeBiz?.id || '';

  const [
    businesses,
    users,
    customers,
    products,
    vendors,
    orders,
    pos,
    creditNotes,
    catalogs,
    auditLogRows,
    notificationRows,
    triggers,
  ] = await Promise.all([
    prisma.business.count(),
    prisma.user.count(),
    businessId ? prisma.customer.count({ where: { businessId } }) : Promise.resolve(0),
    businessId ? prisma.product.count({ where: { businessId } }) : Promise.resolve(0),
    businessId ? prisma.vendor.count({ where: { businessId } }) : Promise.resolve(0),
    businessId ? prisma.order.count({ where: { businessId } }) : Promise.resolve(0),
    businessId ? prisma.purchaseOrder.count({ where: { businessId } }) : Promise.resolve(0),
    businessId ? prisma.creditNote.count({ where: { businessId } }) : Promise.resolve(0),
    businessId ? prisma.catalog.count({ where: { businessId } }) : Promise.resolve(0),
    prisma.$queryRawUnsafe<Array<{ cnt: number }>>('SELECT COUNT(*)::int AS cnt FROM "AuditLog";'),
    prisma.$queryRawUnsafe<Array<{ cnt: number }>>('SELECT COUNT(*)::int AS cnt FROM "Notification";'),
    prisma.$queryRawUnsafe<Array<{ tgname: string }>>(
      'SELECT tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname;'
    ),
  ]);

  console.log('\n📊 RINGKASAN STATUS DATABASE BERSIH:');
  console.log(
    JSON.stringify(
      {
        businessCode: activeBiz?.code || null,
        businesses,
        users,
        customers,
        products,
        vendors,
        orders,
        pos,
        creditNotes,
        catalogs,
        auditLogs: auditLogRows[0]?.cnt ?? 0,
        notifications: notificationRows[0]?.cnt ?? 0,
        triggers: triggers.map((t) => t.tgname),
      },
      null,
      2
    )
  );
  console.log('================================================================');
}

resetCleanBentoCat()
  .catch((err) => {
    console.error('❌ GAGAL RESET DATABASE BENTOCAT:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
