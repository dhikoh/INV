import fs from 'fs';
import path from 'path';

export type TableScope = 'business-pk' | 'business-id' | 'via-parent' | 'system-only';

export interface TableSpec {
  model: string;
  delegate: string;
  scope: TableScope;
  parentRelation?: string;
}

export const TABLES: TableSpec[] = [
  { model: 'Business', delegate: 'business', scope: 'business-pk' },
  { model: 'BankAccount', delegate: 'bankAccount', scope: 'business-id' },
  { model: 'User', delegate: 'user', scope: 'business-id' },
  { model: 'Category', delegate: 'category', scope: 'business-id' },
  { model: 'Vendor', delegate: 'vendor', scope: 'business-id' },
  { model: 'Product', delegate: 'product', scope: 'business-id' },
  { model: 'ProductImage', delegate: 'productImage', scope: 'business-id' },
  { model: 'PriceHistory', delegate: 'priceHistory', scope: 'business-id' },
  { model: 'Customer', delegate: 'customer', scope: 'business-id' },
  { model: 'CustomerMinPrice', delegate: 'customerMinPrice', scope: 'business-id' },
  { model: 'CustomerPromo', delegate: 'customerPromo', scope: 'business-id' },
  { model: 'CrmInteraction', delegate: 'crmInteraction', scope: 'business-id' },
  { model: 'CrmTask', delegate: 'crmTask', scope: 'business-id' },
  { model: 'OwnerSalesNote', delegate: 'ownerSalesNote', scope: 'business-id' },
  { model: 'SalesTarget', delegate: 'salesTarget', scope: 'business-id' },
  { model: 'CommissionTier', delegate: 'commissionTier', scope: 'business-id' },
  { model: 'Order', delegate: 'order', scope: 'business-id' },
  { model: 'OrderItem', delegate: 'orderItem', scope: 'business-id' },
  { model: 'OrderCost', delegate: 'orderCost', scope: 'business-id' },
  { model: 'Invoice', delegate: 'invoice', scope: 'business-id' },
  { model: 'Payment', delegate: 'payment', scope: 'business-id' },
  { model: 'Shipment', delegate: 'shipment', scope: 'business-id' },
  { model: 'CreditNote', delegate: 'creditNote', scope: 'business-id' },
  { model: 'CreditNoteItem', delegate: 'creditNoteItem', scope: 'via-parent', parentRelation: 'creditNote' },
  { model: 'CustomerCreditEntry', delegate: 'customerCreditEntry', scope: 'business-id' },
  { model: 'PurchaseOrder', delegate: 'purchaseOrder', scope: 'business-id' },
  { model: 'PurchaseOrderItem', delegate: 'purchaseOrderItem', scope: 'via-parent', parentRelation: 'purchaseOrder' },
  { model: 'VendorPayment', delegate: 'vendorPayment', scope: 'business-id' },
  { model: 'StockMovement', delegate: 'stockMovement', scope: 'business-id' },
  { model: 'CommissionEntry', delegate: 'commissionEntry', scope: 'business-id' },
  { model: 'Reminder', delegate: 'reminder', scope: 'business-id' },
  { model: 'Catalog', delegate: 'catalog', scope: 'business-id' },
  { model: 'CatalogItem', delegate: 'catalogItem', scope: 'via-parent', parentRelation: 'catalog' },
  { model: 'DocumentCounter', delegate: 'documentCounter', scope: 'business-id' },
  { model: 'AuditLog', delegate: 'auditLog', scope: 'business-id' },
  { model: 'ReleaseNote', delegate: 'releaseNote', scope: 'system-only' },
];

export const EXCLUDED_MODELS = [
  'Session',
  'LoginAttempt',
  'TelegramLinkCode',
  'Notification',
];

/**
 * Membangun filter Prisma `where` berdasarkan spesifikasi tabel dan cakupan ekspor.
 */
export function buildWhere(
  spec: TableSpec,
  scope: 'system' | 'business',
  businessId?: string
): Record<string, unknown> | undefined {
  if (scope === 'system') {
    return undefined;
  }

  if (!businessId) {
    throw new Error('businessId wajib diisi untuk mode ekspor business');
  }

  switch (spec.scope) {
    case 'business-pk':
      return { id: businessId };
    case 'business-id':
      return { businessId };
    case 'via-parent':
      if (!spec.parentRelation) {
        throw new Error(`parentRelation tidak ditentukan untuk tabel via-parent: ${spec.model}`);
      }
      return { [spec.parentRelation]: { businessId } };
    case 'system-only':
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Helper untuk mengekstrak metadata kolom Json dan kolom nullable ber-@default
 * langsung dari schema.prisma secara otomatis (ADR 0008 & Bagian 3.8).
 */
export interface ModelSchemaMeta {
  jsonColumns: string[];
  nullableWithDefaultColumns: string[];
}

let cachedSchemaMeta: Record<string, ModelSchemaMeta> | null = null;

export function getSchemaMetadata(schemaPath?: string): Record<string, ModelSchemaMeta> {
  if (cachedSchemaMeta && !schemaPath) {
    return cachedSchemaMeta;
  }

  const resolvedPath =
    schemaPath ||
    path.resolve(process.cwd(), 'prisma/schema.prisma');

  const result: Record<string, ModelSchemaMeta> = {};
  if (!fs.existsSync(resolvedPath)) {
    return result;
  }

  const content = fs.readFileSync(resolvedPath, 'utf8');
  let currentModel: string | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    const modelMatch = trimmed.match(/^model\s+(\w+)\s+\{/);
    if (modelMatch) {
      currentModel = modelMatch[1];
      result[currentModel] = { jsonColumns: [], nullableWithDefaultColumns: [] };
      continue;
    }

    if (trimmed.startsWith('}')) {
      currentModel = null;
      continue;
    }

    if (!currentModel) continue;

    const fieldMatch = trimmed.match(/^(\w+)\s+(\w+)(\??)(\s+.*)?$/);
    if (fieldMatch) {
      const [, name, type, optionalFlag, attributes] = fieldMatch;
      if (type === 'Json') {
        result[currentModel].jsonColumns.push(name);
      }
      if (optionalFlag === '?' && attributes && attributes.includes('@default')) {
        result[currentModel].nullableWithDefaultColumns.push(name);
      }
    }
  }

  if (!schemaPath) {
    cachedSchemaMeta = result;
  }
  return result;
}

