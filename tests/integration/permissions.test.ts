import { describe, it, expect, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import * as sessionModule from '@/lib/auth/session';

// Handlers to test
import {
  GET as getUsersHandler,
  POST as createUserHandler,
} from '@/app/api/v1/users/route';
import {
  GET as getUserDetailHandler,
  PATCH as updateUserHandler,
  DELETE as deleteUserHandler,
} from '@/app/api/v1/users/[id]/route';
import { POST as resetPasswordHandler } from '@/app/api/v1/users/[id]/reset-password/route';
import { POST as deactivateUserHandler } from '@/app/api/v1/users/[id]/deactivate/route';
import { POST as activateUserHandler } from '@/app/api/v1/users/[id]/activate/route';
import {
  GET as getBusinessesHandler,
  POST as createBusinessHandler,
} from '@/app/api/v1/businesses/route';
import {
  PATCH as updateBusinessHandler,
  DELETE as deleteBusinessHandler,
} from '@/app/api/v1/businesses/[id]/route';
import {
  GET as getBankAccountsHandler,
  POST as createBankAccountHandler,
} from '@/app/api/v1/businesses/[id]/bank-accounts/route';
import {
  PATCH as updateBankAccountHandler,
  DELETE as deleteBankAccountHandler,
} from '@/app/api/v1/bank-accounts/[id]/route';
import { POST as uploadLogoHandler } from '@/app/api/v1/businesses/[id]/logo/route';
import { POST as switchBusinessHandler } from '@/app/api/v1/session/business/route';
import { POST as createCategoryHandler } from '@/app/api/v1/categories/route';
import {
  PATCH as updateCategoryHandler,
  DELETE as deleteCategoryHandler,
} from '@/app/api/v1/categories/[id]/route';
import { POST as createProductHandler } from '@/app/api/v1/products/route';
import {
  PATCH as updateProductHandler,
  DELETE as deleteProductHandler,
} from '@/app/api/v1/products/[id]/route';
import { POST as uploadImagesHandler } from '@/app/api/v1/products/[id]/images/route';
import {
  PATCH as updateImageHandler,
  DELETE as deleteImageHandler,
} from '@/app/api/v1/products/[id]/images/[imageId]/route';
import { GET as getPriceHistoryHandler } from '@/app/api/v1/products/[id]/price-history/route';
import {
  GET as getVendorsHandler,
  POST as createVendorHandler,
} from '@/app/api/v1/vendors/route';
import {
  GET as getVendorDetailHandler,
  PATCH as updateVendorHandler,
  DELETE as deleteVendorHandler,
} from '@/app/api/v1/vendors/[id]/route';
import { POST as createUpdateHandler } from '@/app/api/v1/updates/route';
import {
  PATCH as updateUpdateHandler,
  DELETE as deleteUpdateHandler,
} from '@/app/api/v1/updates/[id]/route';
import { POST as publishUpdateHandler } from '@/app/api/v1/updates/[id]/publish/route';
import { POST as reassignCustomerHandler } from '@/app/api/v1/customers/[id]/reassign/route';
import {
  GET as getCustomerMinPricesHandler,
  PUT as setCustomerMinPriceHandler,
  DELETE as deleteCustomerMinPriceHandler,
} from '@/app/api/v1/customers/[id]/min-prices/route';
import {
  GET as getCustomerPromosHandler,
  POST as createCustomerPromoHandler,
} from '@/app/api/v1/customers/[id]/promos/route';
import {
  GET as getCustomerPromoDetailHandler,
  PATCH as updateCustomerPromoHandler,
  DELETE as deleteCustomerPromoHandler,
} from '@/app/api/v1/customer-promos/[id]/route';
import { GET as getCustomerPriceHistoryHandler } from '@/app/api/v1/customers/[id]/price-history/route';
import { DELETE as deleteOrderHandler } from '@/app/api/v1/orders/[id]/route';
import { GET as getStockHandler } from '@/app/api/v1/stock/route';
import { GET as getStockMovementsHandler } from '@/app/api/v1/stock/movements/route';
import { POST as adjustStockHandler } from '@/app/api/v1/stock/adjust/route';
import { POST as opnameStockHandler } from '@/app/api/v1/stock/opname/route';
import {
  GET as getPurchaseOrdersHandler,
  POST as createPurchaseOrderHandler,
} from '@/app/api/v1/purchase-orders/route';
import {
  GET as getPurchaseOrderDetailHandler,
  PATCH as updatePurchaseOrderHandler,
} from '@/app/api/v1/purchase-orders/[id]/route';
import { POST as orderPurchaseOrderHandler } from '@/app/api/v1/purchase-orders/[id]/order/route';
import { POST as receivePurchaseOrderHandler } from '@/app/api/v1/purchase-orders/[id]/receive/route';
import { POST as cancelPurchaseOrderHandler } from '@/app/api/v1/purchase-orders/[id]/cancel/route';
import { POST as createVendorPaymentHandler } from '@/app/api/v1/vendors/[id]/payments/route';
import { GET as getVendorTransactionsHandler } from '@/app/api/v1/vendors/[id]/transactions/route';
import { GET as getApprovalsHandler } from '@/app/api/v1/approvals/route';
import { POST as approveInvoiceHandler } from '@/app/api/v1/invoices/[id]/approve/route';
import { POST as rejectInvoiceHandler } from '@/app/api/v1/invoices/[id]/reject/route';
import { POST as voidInvoiceHandler } from '@/app/api/v1/invoices/[id]/void/route';
import { GET as getPaymentsQueueHandler } from '@/app/api/v1/payments/route';
import { POST as verifyPaymentHandler } from '@/app/api/v1/payments/[id]/verify/route';
import { POST as rejectPaymentHandler } from '@/app/api/v1/payments/[id]/reject/route';
import { POST as voidPaymentHandler } from '@/app/api/v1/payments/[id]/void/route';

describe('Matriks Hak Akses Berbasis Tabel (Seksi 5.1 & 17.4 b)', () => {
  const APP_URL = 'http://localhost:3000';

  const salesContext = {
    user: {
      id: 'sales_user_1',
      role: Role.SALES,
      name: 'Sales Lapangan',
      businessId: 'biz_1',
    },
    sessionId: 'sess_sales_1',
    role: Role.SALES,
    businessId: 'biz_1',
    ip: '127.0.0.1',
  };

  interface PermissionTestCase {
    name: string;
    method: string;
    path: string;
    handler: (req: NextRequest, route?: any) => Promise<NextResponse>;
    params?: any;
    body?: any;
  }

  const superAdminOnlyCases: PermissionTestCase[] = [
    {
      name: 'GET /api/v1/users',
      method: 'GET',
      path: '/api/v1/users',
      handler: (req) => getUsersHandler(req),
    },
    {
      name: 'POST /api/v1/users',
      method: 'POST',
      path: '/api/v1/users',
      handler: (req) => createUserHandler(req),
      body: { username: 'test', password: 'password12345', name: 'Test', businessId: 'biz_1' },
    },
    {
      name: 'GET /api/v1/users/:id',
      method: 'GET',
      path: '/api/v1/users/usr_1',
      handler: (req, r) => getUserDetailHandler(req, r),
      params: { id: 'usr_1' },
    },
    {
      name: 'PATCH /api/v1/users/:id',
      method: 'PATCH',
      path: '/api/v1/users/usr_1',
      handler: (req, r) => updateUserHandler(req, r),
      params: { id: 'usr_1' },
      body: { name: 'New Name' },
    },
    {
      name: 'DELETE /api/v1/users/:id',
      method: 'DELETE',
      path: '/api/v1/users/usr_1',
      handler: (req, r) => deleteUserHandler(req, r),
      params: { id: 'usr_1' },
    },
    {
      name: 'POST /api/v1/users/:id/reset-password',
      method: 'POST',
      path: '/api/v1/users/usr_1/reset-password',
      handler: (req, r) => resetPasswordHandler(req, r),
      params: { id: 'usr_1' },
      body: { password: 'newpassword12345' },
    },
    {
      name: 'POST /api/v1/users/:id/deactivate',
      method: 'POST',
      path: '/api/v1/users/usr_1/deactivate',
      handler: (req, r) => deactivateUserHandler(req, r),
      params: { id: 'usr_1' },
    },
    {
      name: 'POST /api/v1/users/:id/activate',
      method: 'POST',
      path: '/api/v1/users/usr_1/activate',
      handler: (req, r) => activateUserHandler(req, r),
      params: { id: 'usr_1' },
    },
    {
      name: 'GET /api/v1/businesses',
      method: 'GET',
      path: '/api/v1/businesses',
      handler: (req) => getBusinessesHandler(req),
    },
    {
      name: 'POST /api/v1/businesses',
      method: 'POST',
      path: '/api/v1/businesses',
      handler: (req) => createBusinessHandler(req),
      body: { code: 'ABC', name: 'Biz ABC' },
    },
    {
      name: 'PATCH /api/v1/businesses/:id',
      method: 'PATCH',
      path: '/api/v1/businesses/biz_1',
      handler: (req, r) => updateBusinessHandler(req, r),
      params: { id: 'biz_1' },
      body: { name: 'Updated' },
    },
    {
      name: 'DELETE /api/v1/businesses/:id',
      method: 'DELETE',
      path: '/api/v1/businesses/biz_1',
      handler: (req, r) => deleteBusinessHandler(req, r),
      params: { id: 'biz_1' },
    },
    {
      name: 'GET /api/v1/businesses/:id/bank-accounts',
      method: 'GET',
      path: '/api/v1/businesses/biz_1/bank-accounts',
      handler: (req, r) => getBankAccountsHandler(req, r),
      params: { id: 'biz_1' },
    },
    {
      name: 'POST /api/v1/businesses/:id/bank-accounts',
      method: 'POST',
      path: '/api/v1/businesses/biz_1/bank-accounts',
      handler: (req, r) => createBankAccountHandler(req, r),
      params: { id: 'biz_1' },
      body: { bankName: 'BCA', accountNumber: '123456', accountHolder: 'A' },
    },
    {
      name: 'PATCH /api/v1/bank-accounts/:id',
      method: 'PATCH',
      path: '/api/v1/bank-accounts/acc_1',
      handler: (req, r) => updateBankAccountHandler(req, r),
      params: { id: 'acc_1' },
      body: { accountHolder: 'New A' },
    },
    {
      name: 'DELETE /api/v1/bank-accounts/:id',
      method: 'DELETE',
      path: '/api/v1/bank-accounts/acc_1',
      handler: (req, r) => deleteBankAccountHandler(req, r),
      params: { id: 'acc_1' },
    },
    {
      name: 'POST /api/v1/businesses/:id/logo',
      method: 'POST',
      path: '/api/v1/businesses/biz_1/logo',
      handler: (req, r) => uploadLogoHandler(req, r),
      params: { id: 'biz_1' },
    },
    {
      name: 'POST /api/v1/session/business',
      method: 'POST',
      path: '/api/v1/session/business',
      handler: (req) => switchBusinessHandler(req),
      body: { businessId: 'biz_2' },
    },
    {
      name: 'POST /api/v1/categories',
      method: 'POST',
      path: '/api/v1/categories',
      handler: (req) => createCategoryHandler(req),
      body: { name: 'Kategori Baru' },
    },
    {
      name: 'PATCH /api/v1/categories/:id',
      method: 'PATCH',
      path: '/api/v1/categories/cat_1',
      handler: (req, r) => updateCategoryHandler(req, r),
      params: { id: 'cat_1' },
      body: { name: 'Kategori Update' },
    },
    {
      name: 'DELETE /api/v1/categories/:id',
      method: 'DELETE',
      path: '/api/v1/categories/cat_1',
      handler: (req, r) => deleteCategoryHandler(req, r),
      params: { id: 'cat_1' },
    },
    {
      name: 'POST /api/v1/products',
      method: 'POST',
      path: '/api/v1/products',
      handler: (req) => createProductHandler(req),
      body: {
        sku: 'P-1',
        name: 'Produk Baru',
        unit: 'PCS',
        basePrice: 10000,
        minPrice: 8000,
        costPrice: 5000,
      },
    },
    {
      name: 'PATCH /api/v1/products/:id',
      method: 'PATCH',
      path: '/api/v1/products/prod_1',
      handler: (req, r) => updateProductHandler(req, r),
      params: { id: 'prod_1' },
      body: { name: 'Produk Update', rev: 1 },
    },
    {
      name: 'DELETE /api/v1/products/:id',
      method: 'DELETE',
      path: '/api/v1/products/prod_1',
      handler: (req, r) => deleteProductHandler(req, r),
      params: { id: 'prod_1' },
      body: { confirm: 'Produk Update' },
    },
    {
      name: 'POST /api/v1/products/:id/images',
      method: 'POST',
      path: '/api/v1/products/prod_1/images',
      handler: (req, r) => uploadImagesHandler(req, r),
      params: { id: 'prod_1' },
    },
    {
      name: 'PATCH /api/v1/products/:id/images/:imageId',
      method: 'PATCH',
      path: '/api/v1/products/prod_1/images/img_1',
      handler: (req, r) => updateImageHandler(req, r),
      params: { id: 'prod_1', imageId: 'img_1' },
      body: { isPrimary: true },
    },
    {
      name: 'DELETE /api/v1/products/:id/images/:imageId',
      method: 'DELETE',
      path: '/api/v1/products/prod_1/images/img_1',
      handler: (req, r) => deleteImageHandler(req, r),
      params: { id: 'prod_1', imageId: 'img_1' },
    },
    {
      name: 'GET /api/v1/products/:id/price-history',
      method: 'GET',
      path: '/api/v1/products/prod_1/price-history',
      handler: (req, r) => getPriceHistoryHandler(req, r),
      params: { id: 'prod_1' },
    },
    {
      name: 'GET /api/v1/vendors',
      method: 'GET',
      path: '/api/v1/vendors',
      handler: (req) => getVendorsHandler(req),
    },
    {
      name: 'POST /api/v1/vendors',
      method: 'POST',
      path: '/api/v1/vendors',
      handler: (req) => createVendorHandler(req),
      body: { code: 'V-1', name: 'Vendor Baru' },
    },
    {
      name: 'GET /api/v1/vendors/:id',
      method: 'GET',
      path: '/api/v1/vendors/vnd_1',
      handler: (req, r) => getVendorDetailHandler(req, r),
      params: { id: 'vnd_1' },
    },
    {
      name: 'PATCH /api/v1/vendors/:id',
      method: 'PATCH',
      path: '/api/v1/vendors/vnd_1',
      handler: (req, r) => updateVendorHandler(req, r),
      params: { id: 'vnd_1' },
      body: { name: 'Vendor Update' },
    },
    {
      name: 'DELETE /api/v1/vendors/:id',
      method: 'DELETE',
      path: '/api/v1/vendors/vnd_1',
      handler: (req, r) => deleteVendorHandler(req, r),
      params: { id: 'vnd_1' },
    },
    {
      name: 'POST /api/v1/updates',
      method: 'POST',
      path: '/api/v1/updates',
      handler: (req) => createUpdateHandler(req),
      body: { version: 'v0.2.0', title: 'Test Rilis', bodyMarkdown: 'Konten' },
    },
    {
      name: 'PATCH /api/v1/updates/:id',
      method: 'PATCH',
      path: '/api/v1/updates/upd_1',
      handler: (req, r) => updateUpdateHandler(req, r),
      params: { id: 'upd_1' },
      body: { title: 'Update Title' },
    },
    {
      name: 'POST /api/v1/updates/:id/publish',
      method: 'POST',
      path: '/api/v1/updates/upd_1/publish',
      handler: (req, r) => publishUpdateHandler(req, r),
      params: { id: 'upd_1' },
      body: { broadcast: false },
    },
    {
      name: 'DELETE /api/v1/updates/:id',
      method: 'DELETE',
      path: '/api/v1/updates/upd_1',
      handler: (req, r) => deleteUpdateHandler(req, r),
      params: { id: 'upd_1' },
    },
    {
      name: 'POST /api/v1/customers/:id/reassign',
      method: 'POST',
      path: '/api/v1/customers/cust_1/reassign',
      handler: (req, r) => reassignCustomerHandler(req, r),
      params: { id: 'cust_1' },
      body: { salesId: 'sales_2' },
    },
    {
      name: 'GET /api/v1/customers/:id/min-prices',
      method: 'GET',
      path: '/api/v1/customers/cust_1/min-prices',
      handler: (req, r) => getCustomerMinPricesHandler(req, r),
      params: { id: 'cust_1' },
    },
    {
      name: 'PUT /api/v1/customers/:id/min-prices',
      method: 'PUT',
      path: '/api/v1/customers/cust_1/min-prices',
      handler: (req, r) => setCustomerMinPriceHandler(req, r),
      params: { id: 'cust_1' },
      body: { productId: 'p1', minPrice: 50000, reason: 'Alasan diskon' },
    },
    {
      name: 'DELETE /api/v1/customers/:id/min-prices',
      method: 'DELETE',
      path: '/api/v1/customers/cust_1/min-prices',
      handler: (req, r) => deleteCustomerMinPriceHandler(req, r),
      params: { id: 'cust_1' },
      body: { productId: 'p1', reason: 'Alasan reset' },
    },
    {
      name: 'GET /api/v1/customers/:id/promos',
      method: 'GET',
      path: '/api/v1/customers/cust_1/promos',
      handler: (req, r) => getCustomerPromosHandler(req, r),
      params: { id: 'cust_1' },
    },
    {
      name: 'POST /api/v1/customers/:id/promos',
      method: 'POST',
      path: '/api/v1/customers/cust_1/promos',
      handler: (req, r) => createCustomerPromoHandler(req, r),
      params: { id: 'cust_1' },
      body: { label: 'Promo', source: 'PROMO', type: 'PERCENT', valueBps: 500, validFrom: new Date() },
    },
    {
      name: 'GET /api/v1/customer-promos/:id',
      method: 'GET',
      path: '/api/v1/customer-promos/promo_1',
      handler: (req, r) => getCustomerPromoDetailHandler(req, r),
      params: { id: 'promo_1' },
    },
    {
      name: 'PATCH /api/v1/customer-promos/:id',
      method: 'PATCH',
      path: '/api/v1/customer-promos/promo_1',
      handler: (req, r) => updateCustomerPromoHandler(req, r),
      params: { id: 'promo_1' },
      body: { label: 'Ubah' },
    },
    {
      name: 'DELETE /api/v1/customer-promos/:id',
      method: 'DELETE',
      path: '/api/v1/customer-promos/promo_1',
      handler: (req, r) => deleteCustomerPromoHandler(req, r),
      params: { id: 'promo_1' },
    },
    {
      name: 'GET /api/v1/customers/:id/price-history',
      method: 'GET',
      path: '/api/v1/customers/cust_1/price-history',
      handler: (req, r) => getCustomerPriceHistoryHandler(req, r),
      params: { id: 'cust_1' },
    },
    {
      name: 'DELETE /api/v1/orders/:id',
      method: 'DELETE',
      path: '/api/v1/orders/ord_1',
      handler: (req, r) => deleteOrderHandler(req, r),
      params: { id: 'ord_1' },
      body: { confirm: 'ord_1' },
    },
    {
      name: 'GET /api/v1/stock',
      method: 'GET',
      path: '/api/v1/stock',
      handler: (req) => getStockHandler(req),
    },
    {
      name: 'GET /api/v1/stock/movements',
      method: 'GET',
      path: '/api/v1/stock/movements',
      handler: (req) => getStockMovementsHandler(req),
    },
    {
      name: 'POST /api/v1/stock/adjust',
      method: 'POST',
      path: '/api/v1/stock/adjust',
      handler: (req) => adjustStockHandler(req),
      body: { productId: 'p1', qtyDelta: 5, reason: 'Alasan penyesuaian stok' },
    },
    {
      name: 'POST /api/v1/stock/opname',
      method: 'POST',
      path: '/api/v1/stock/opname',
      handler: (req) => opnameStockHandler(req),
      body: { productId: 'p1', countedQty: 10, reason: 'Alasan stock opname' },
    },
    {
      name: 'GET /api/v1/purchase-orders',
      method: 'GET',
      path: '/api/v1/purchase-orders',
      handler: (req) => getPurchaseOrdersHandler(req),
    },
    {
      name: 'POST /api/v1/purchase-orders',
      method: 'POST',
      path: '/api/v1/purchase-orders',
      handler: (req) => createPurchaseOrderHandler(req),
      body: {
        vendorId: 'v1',
        orderDate: '2026-11-10',
        items: [{ productId: 'p1', qty: 10, unitCost: 50000 }],
      },
    },
    {
      name: 'GET /api/v1/purchase-orders/:id',
      method: 'GET',
      path: '/api/v1/purchase-orders/po_1',
      handler: (req, r) => getPurchaseOrderDetailHandler(req, r),
      params: { id: 'po_1' },
    },
    {
      name: 'PATCH /api/v1/purchase-orders/:id',
      method: 'PATCH',
      path: '/api/v1/purchase-orders/po_1',
      handler: (req, r) => updatePurchaseOrderHandler(req, r),
      params: { id: 'po_1' },
      body: { notes: 'Catatan' },
    },
    {
      name: 'POST /api/v1/purchase-orders/:id/order',
      method: 'POST',
      path: '/api/v1/purchase-orders/po_1/order',
      handler: (req, r) => orderPurchaseOrderHandler(req, r),
      params: { id: 'po_1' },
    },
    {
      name: 'POST /api/v1/purchase-orders/:id/receive',
      method: 'POST',
      path: '/api/v1/purchase-orders/po_1/receive',
      handler: (req, r) => receivePurchaseOrderHandler(req, r),
      params: { id: 'po_1' },
      body: { items: [{ itemId: 'item_1', qty: 5 }] },
    },
    {
      name: 'POST /api/v1/purchase-orders/:id/cancel',
      method: 'POST',
      path: '/api/v1/purchase-orders/po_1/cancel',
      handler: (req, r) => cancelPurchaseOrderHandler(req, r),
      params: { id: 'po_1' },
      body: { reason: 'Alasan pembatalan' },
    },
    {
      name: 'POST /api/v1/vendors/:id/payments',
      method: 'POST',
      path: '/api/v1/vendors/v1/payments',
      handler: (req, r) => createVendorPaymentHandler(req, r),
      params: { id: 'v1' },
      body: { amount: 100000, paidAt: '2026-11-10', method: 'TRANSFER' },
    },
    {
      name: 'GET /api/v1/vendors/:id/transactions',
      method: 'GET',
      path: '/api/v1/vendors/v1/transactions',
      handler: (req, r) => getVendorTransactionsHandler(req, r),
      params: { id: 'v1' },
    },
    {
      name: 'GET /api/v1/approvals',
      method: 'GET',
      path: '/api/v1/approvals',
      handler: (req) => getApprovalsHandler(req),
    },
    {
      name: 'POST /api/v1/invoices/:id/approve',
      method: 'POST',
      path: '/api/v1/invoices/inv_1/approve',
      handler: (req, r) => approveInvoiceHandler(req, r),
      params: { id: 'inv_1' },
      body: {},
    },
    {
      name: 'POST /api/v1/invoices/:id/reject',
      method: 'POST',
      path: '/api/v1/invoices/inv_1/reject',
      handler: (req, r) => rejectInvoiceHandler(req, r),
      params: { id: 'inv_1' },
      body: { reason: 'Data pesanan perlu diperbaiki' },
    },
    {
      name: 'POST /api/v1/invoices/:id/void',
      method: 'POST',
      path: '/api/v1/invoices/inv_1/void',
      handler: (req, r) => voidInvoiceHandler(req, r),
      params: { id: 'inv_1' },
      body: { reason: 'Dibatalkan atas permintaan pelanggan' },
    },
    {
      name: 'GET /api/v1/payments',
      method: 'GET',
      path: '/api/v1/payments',
      handler: (req) => getPaymentsQueueHandler(req),
    },
    {
      name: 'POST /api/v1/payments/:id/verify',
      method: 'POST',
      path: '/api/v1/payments/pay_1/verify',
      handler: (req, r) => verifyPaymentHandler(req, r),
      params: { id: 'pay_1' },
    },
    {
      name: 'POST /api/v1/payments/:id/reject',
      method: 'POST',
      path: '/api/v1/payments/pay_1/reject',
      handler: (req, r) => rejectPaymentHandler(req, r),
      params: { id: 'pay_1' },
      body: { reason: 'Bukti transfer tidak valid' },
    },
    {
      name: 'POST /api/v1/payments/:id/void',
      method: 'POST',
      path: '/api/v1/payments/pay_1/void',
      handler: (req, r) => voidPaymentHandler(req, r),
      params: { id: 'pay_1' },
      body: { reason: 'Dana ditarik kembali oleh bank' },
    },
  ];

  for (const tc of superAdminOnlyCases) {
    it(`MENOLAK role Sales mengakses endpoint Super Admin: ${tc.method} ${tc.name} (403 FORBIDDEN)`, async () => {
      vi.spyOn(sessionModule, 'findValidSession').mockResolvedValueOnce({
        id: 'sess_sales_1',
        userId: 'sales_user_1',
        tokenHash: 'h',
        activeBusinessId: null,
        userAgent: null,
        ip: '127.0.0.1',
        createdAt: new Date(),
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
        user: {
          id: 'sales_user_1',
          role: Role.SALES,
          name: 'Sales Lapangan',
          businessId: 'biz_1',
          isActive: true,
          mustChangePassword: false,
          deletedAt: null,
        } as any,
      });

      const req = new NextRequest(`${APP_URL}${tc.path}`, {
        method: tc.method,
        headers: {
          origin: APP_URL,
          cookie: 'sid=sales_session_token',
          ...(tc.body ? { 'content-type': 'application/json' } : {}),
        },
        body: tc.body ? JSON.stringify(tc.body) : undefined,
      });

      const res = await tc.handler(req, {
        params: Promise.resolve(tc.params || {}),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('FORBIDDEN');
    });
  }
});
