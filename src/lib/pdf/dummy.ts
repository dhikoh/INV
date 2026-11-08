import { InvoiceSnapshot } from './snapshot';
import { InvoiceTheme } from '@prisma/client';

export function getDummySnapshot(
  theme: InvoiceTheme = 'PROFESIONAL',
  businessData?: Partial<InvoiceSnapshot['business']>
): InvoiceSnapshot {
  return {
    schemaVersion: 1,
    number: 'INV/2026/04/0001',
    type: 'FINAL',
    issueDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    theme: theme as InvoiceSnapshot['theme'],
    business: {
      name: businessData?.name || 'PT BentoCat Distribusi Nusantara',
      legalName: businessData?.legalName || 'PT BentoCat Distribusi Nusantara Tbk',
      address: businessData?.address || 'Jl. Perdagangan Raya No. 45, Kebayoran Baru, Jakarta Selatan 12160',
      phone: businessData?.phone || '+62 21 555-0199',
      email: businessData?.email || 'finance@bentocat.co.id',
      npwp: businessData?.npwp || '01.234.567.8-012.000',
      logoPath: businessData?.logoPath || null,
    },
    customer: {
      code: 'CUST-001',
      name: 'Toko Berkah Abadi',
      contactName: 'Bapak H. Rahardian',
      billingAddress: 'Jl. Surya Kencana No. 88, Bogor Tengah, Jawa Barat 16123',
      shippingAddress: 'Gudang Berkah, Kawasan Industri Sentul Kav. 12, Bogor 16810',
      npwp: '02.987.654.3-432.000',
    },
    items: [
      {
        no: 1,
        name: 'Beras Premium Ramos 10kg',
        sku: 'BRS-RMS-10KG',
        qty: 50,
        unit: 'sak',
        unitPrice: 135000,
        lineDiscount: 250000,
        lineNet: 6500000,
      },
      {
        no: 2,
        name: 'Minyak Goreng Sawit Pouch 2L',
        sku: 'MYK-SWT-2L',
        qty: 100,
        unit: 'pouch',
        unitPrice: 34000,
        lineDiscount: 0,
        lineNet: 3400000,
      },
      {
        no: 3,
        name: 'Gula Pasir Kristal Putih 1kg',
        sku: 'GLA-PST-1KG',
        qty: 120,
        unit: 'kg',
        unitPrice: 17500,
        lineDiscount: 100000,
        lineNet: 2000000,
      },
    ],
    totals: {
      subtotal: 12250000,
      discountTotal: 350000,
      shippingCharge: 150000,
      ppnEnabled: true,
      ppnRateBps: 1100,
      ppnAmount: 1325500,
      grandTotal: 13375500,
    },
    billing: {
      dpBps: 0,
      dpAmount: 0,
      amountDue: 13375500,
      dpInvoiceNumber: null,
      dpPaid: 0,
    },
    banks: [
      {
        bankName: 'BCA (Bank Central Asia)',
        accountNumber: '883-091-2345',
        accountHolder: 'PT BentoCat Distribusi Nusantara',
      },
      {
        bankName: 'Bank Mandiri',
        accountNumber: '122-00-9876543-1',
        accountHolder: 'PT BentoCat Distribusi Nusantara',
      },
    ],
    note: 'Terima kasih atas kerja samanya. Pembayaran mohon ditransfer sesuai rekening di atas sebelum jatuh tempo.',
  };
}
