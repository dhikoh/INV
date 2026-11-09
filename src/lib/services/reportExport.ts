import ExcelJS from 'exceljs';
import { Role, CommissionStatus } from '@prisma/client';
import { Ctx, requireBusiness } from '@/lib/auth/context';
import { DomainError, formatRupiah } from '@/lib/domain/money';
import { renderHtmlToPdf } from '@/lib/pdf/engine';
import { sanitizeFormulaInjection } from '@/lib/services/exportSanitizer';

// Import domain services
import { getReceivablesAgingReport } from './receivablesAging';
import { getCrmReport } from './reportCrm';
import { getMarginReport, MarginOrderRow, MarginProductRow } from './reportMargin';
import { MarginReportQuery } from '@/lib/validation/report';
import { getSalesPerformanceReport, getCommissionReport } from './salesEvaluation';
import { SalesPerformanceQuery, CommissionReportQuery } from '@/lib/validation/salesEvaluation';

export type ExportReportType =
  | 'receivables-aging'
  | 'crm'
  | 'margin'
  | 'sales-performance'
  | 'commissions';

export type ExportFormat = 'xlsx' | 'pdf';

export interface ReportExportQuery {
  type: ExportReportType;
  format?: ExportFormat;
  month?: string;
  from?: string;
  to?: string;
  salesId?: string;
  customerId?: string;
  productId?: string;
  groupBy?: 'order' | 'product' | 'sales' | 'business';
  status?: string;
}

export interface ExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

/**
 * Menghasilkan berkas ekspor laporan (Excel XLSX / PDF).
 *
 * Rujukan: Seksi 16.4 & Table 11 Dokumen Spesifikasi.
 * Menggunakan ExcelJS dengan sanitasi Formula Injection (sel berawalan =, +, -, @ di-escape dengan awalan ').
 */
export async function exportReport(
  ctx: Ctx,
  query: ReportExportQuery
): Promise<ExportResult> {
  const type = query.type;
  const format: ExportFormat = query.format === 'pdf' ? 'pdf' : 'xlsx';

  // 1. Otorisasi (Seksi 16.2 & Zero-Leakage)
  // Hanya tipe 'crm' yang boleh diakses oleh role SALES
  if (type !== 'crm' && ctx.user.role === Role.SALES) {
    throw new DomainError('FORBIDDEN', 'Hanya Super Admin yang berhak mengekspor laporan keuangan', 403);
  }

  requireBusiness(ctx);

  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  if (format === 'xlsx') {
    return generateXlsxExport(ctx, query, timestamp);
  } else {
    return generatePdfExport(ctx, query, timestamp);
  }
}

/**
 * Generator Berkas Excel (XLSX) dengan ExcelJS & Proteksi Formula Injection (Seksi 16.4)
 */
async function generateXlsxExport(
  ctx: Ctx,
  query: ReportExportQuery,
  timestamp: string
): Promise<ExportResult> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BentoCat ERP';
  workbook.created = new Date();

  let filename = `laporan_${query.type}_${timestamp}.xlsx`;

  switch (query.type) {
    case 'receivables-aging': {
      filename = `laporan_umur_piutang_${timestamp}.xlsx`;
      const report = await getReceivablesAgingReport(ctx, {
        customerId: query.customerId,
        salesId: query.salesId,
      });

      const ws = workbook.addWorksheet('Umur Piutang');
      ws.columns = [
        { header: 'No. Invoice', key: 'invoiceNo', width: 22 },
        { header: 'No. Order', key: 'orderNo', width: 22 },
        { header: 'Pelanggan', key: 'customerName', width: 28 },
        { header: 'Staf Sales', key: 'salesName', width: 20 },
        { header: 'Tgl Jatuh Tempo', key: 'dueDate', width: 16 },
        { header: 'Hari Terlambat', key: 'daysOverdue', width: 16 },
        { header: 'Kategori Umur', key: 'bucketLabel', width: 22 },
        { header: 'Total Tagihan', key: 'amount', width: 18 },
        { header: 'Sudah Dibayar', key: 'paidAmount', width: 18 },
        { header: 'Sisa Piutang', key: 'remainingAmount', width: 18 },
      ];

      styleHeaderRow(ws);

      for (const item of report.items) {
        ws.addRow({
          invoiceNo: sanitizeFormulaInjection(item.invoiceNo),
          orderNo: sanitizeFormulaInjection(item.orderNo),
          customerName: sanitizeFormulaInjection(item.customerName),
          salesName: sanitizeFormulaInjection(item.salesName),
          dueDate: item.dueDate.slice(0, 10),
          daysOverdue: item.daysOverdue,
          bucketLabel: sanitizeFormulaInjection(item.bucketLabel),
          amount: item.amount,
          paidAmount: item.paidAmount,
          remainingAmount: item.remainingAmount,
        });
      }

      applyCurrencyFormatting(ws, ['amount', 'paidAmount', 'remainingAmount']);
      break;
    }

    case 'crm': {
      filename = `laporan_crm_${timestamp}.xlsx`;
      const report = await getCrmReport(ctx, {
        month: query.month,
        salesId: query.salesId,
      });

      // Sheet 1: Aktivitas CRM
      const ws = workbook.addWorksheet('Aktivitas CRM');
      ws.columns = [
        { header: 'Waktu', key: 'date', width: 16 },
        { header: 'Jenis', key: 'kind', width: 16 },
        { header: 'Tipe / Kategori', key: 'type', width: 18 },
        { header: 'Pelanggan', key: 'customerName', width: 28 },
        { header: 'Staf Sales', key: 'salesName', width: 20 },
        { header: 'Ringkasan Aktivitas', key: 'summary', width: 45 },
        { header: 'Status', key: 'status', width: 16 },
      ];
      styleHeaderRow(ws);

      for (const act of report.recentActivities) {
        ws.addRow({
          date: act.date.slice(0, 10),
          kind: act.kind,
          type: sanitizeFormulaInjection(act.type),
          customerName: sanitizeFormulaInjection(act.customerName),
          salesName: sanitizeFormulaInjection(act.salesName),
          summary: sanitizeFormulaInjection(act.summary),
          status: act.status || 'DONE',
        });
      }

      // Sheet 2: Ringkasan Pipeline
      const wsPipeline = workbook.addWorksheet('Ringkasan Pipeline');
      wsPipeline.columns = [
        { header: 'Tahapan Pipeline', key: 'stage', width: 25 },
        { header: 'Jumlah Pelanggan', key: 'count', width: 20 },
      ];
      styleHeaderRow(wsPipeline);

      const p = report.summary.pipeline;
      wsPipeline.addRow({ stage: 'Lead (Prospek Awal)', count: p.lead });
      wsPipeline.addRow({ stage: 'Prospect (Sedang Negosiasi)', count: p.prospect });
      wsPipeline.addRow({ stage: 'Deal (Closing Pertama)', count: p.deal });
      wsPipeline.addRow({ stage: 'Repeat (Langganan)', count: p.repeat });
      wsPipeline.addRow({ stage: 'Lost (Batal / Tidak Aktif)', count: p.lost });
      break;
    }

    case 'margin': {
      filename = `laporan_margin_${timestamp}.xlsx`;
      const report = await getMarginReport(ctx, {
        groupBy: query.groupBy || 'order',
        from: query.from,
        to: query.to,
        salesId: query.salesId,
        productId: query.productId,
      } as MarginReportQuery);

      const ws = workbook.addWorksheet('Laporan Margin');
      if (query.groupBy === 'product') {
        ws.columns = [
          { header: 'Nama Produk', key: 'productName', width: 30 },
          { header: 'SKU', key: 'sku', width: 16 },
          { header: 'Qty Terjual', key: 'qtySold', width: 14 },
          { header: 'Omzet Bersih', key: 'revenue', width: 18 },
          { header: 'HPP Modal', key: 'costPrice', width: 18 },
          { header: 'Laba Kotor', key: 'profit', width: 18 },
          { header: 'Margin (%)', key: 'marginPercent', width: 14 },
        ];
        styleHeaderRow(ws);

        for (const r of report.items as MarginProductRow[]) {
          ws.addRow({
            productName: sanitizeFormulaInjection(r.name),
            sku: sanitizeFormulaInjection(r.sku),
            qtySold: r.qtySold,
            revenue: r.grossRevenue,
            costPrice: r.cogs,
            profit: r.profit,
            marginPercent: `${(r.marginBps / 100).toFixed(1)}%`,
          });
        }
        applyCurrencyFormatting(ws, ['revenue', 'costPrice', 'profit']);
      } else {
        // default / order mode
        ws.columns = [
          { header: 'No. Order', key: 'orderNo', width: 22 },
          { header: 'Pelanggan', key: 'customerName', width: 28 },
          { header: 'Staf Sales', key: 'salesName', width: 20 },
          { header: 'Tgl Order', key: 'orderDate', width: 16 },
          { header: 'Omzet', key: 'revenue', width: 18 },
          { header: 'HPP Modal', key: 'costPrice', width: 18 },
          { header: 'Ongkir Aktual', key: 'actualShippingCost', width: 16 },
          { header: 'Biaya Lain', key: 'extraCosts', width: 16 },
          { header: 'Laba Bersih', key: 'profit', width: 18 },
          { header: 'Margin (%)', key: 'marginPercent', width: 14 },
        ];
        styleHeaderRow(ws);

        for (const r of report.items as MarginOrderRow[]) {
          ws.addRow({
            orderNo: sanitizeFormulaInjection(r.orderNo),
            customerName: sanitizeFormulaInjection(r.customerName),
            salesName: sanitizeFormulaInjection(r.salesName),
            orderDate: r.orderDate?.slice(0, 10) || '-',
            revenue: r.revenue,
            costPrice: r.cogs,
            actualShippingCost: r.shippingActualCost,
            extraCosts: r.extraCosts,
            profit: r.profit,
            marginPercent: `${(r.marginBps / 100).toFixed(1)}%`,
          });
        }
        applyCurrencyFormatting(ws, [
          'revenue',
          'costPrice',
          'actualShippingCost',
          'extraCosts',
          'profit',
        ]);
      }
      break;
    }

    case 'sales-performance': {
      filename = `laporan_evaluasi_sales_${timestamp}.xlsx`;
      const report = await getSalesPerformanceReport(ctx, {
        month: query.month,
        salesId: query.salesId,
      } as SalesPerformanceQuery);

      const ws = workbook.addWorksheet('Kinerja Sales');
      ws.columns = [
        { header: 'Nama Sales', key: 'salesName', width: 24 },
        { header: 'Username', key: 'username', width: 16 },
        { header: 'Target Omzet', key: 'targetRevenue', width: 18 },
        { header: 'Capaian Omzet', key: 'revenue', width: 18 },
        { header: 'Capaian (%)', key: 'achievementPercent', width: 14 },
        { header: 'Profit Usaha', key: 'profit', width: 18 },
        { header: 'Margin (%)', key: 'marginPercent', width: 14 },
        { header: 'Deal Orders', key: 'orderCount', width: 14 },
        { header: 'Order Ditolak', key: 'rejectedOrderCount', width: 14 },
        { header: 'Komisi Berhak', key: 'earnedCommission', width: 18 },
        { header: 'Komisi Dibayar', key: 'paidCommission', width: 18 },
      ];
      styleHeaderRow(ws);

      for (const s of report.items) {
        ws.addRow({
          salesName: sanitizeFormulaInjection(s.salesName),
          username: sanitizeFormulaInjection(s.username),
          targetRevenue: s.targetRevenue || 0,
          revenue: s.revenue,
          achievementPercent: s.achievementPercent !== null ? `${s.achievementPercent}%` : '-',
          profit: s.profit,
          marginPercent: `${(s.marginBps / 100).toFixed(1)}%`,
          orderCount: s.orderCount,
          rejectedOrderCount: s.rejectedOrderCount,
          earnedCommission: s.earnedCommission,
          paidCommission: s.paidCommission,
        });
      }
      applyCurrencyFormatting(ws, ['targetRevenue', 'revenue', 'profit', 'earnedCommission', 'paidCommission']);
      break;
    }

    case 'commissions': {
      filename = `laporan_komisi_${timestamp}.xlsx`;
      const report = await getCommissionReport(ctx, {
        month: query.month,
        salesId: query.salesId,
        status: query.status as CommissionStatus | undefined,
        limit: 500,
      } as CommissionReportQuery);

      const ws = workbook.addWorksheet('Laporan Komisi');
      ws.columns = [
        { header: 'No. Order', key: 'orderNo', width: 22 },
        { header: 'Pelanggan', key: 'customerName', width: 28 },
        { header: 'Staf Sales', key: 'salesName', width: 20 },
        { header: 'Nilai Basis', key: 'basisAmount', width: 18 },
        { header: 'Rate (%)', key: 'ratePercent', width: 12 },
        { header: 'Nominal Komisi', key: 'amount', width: 18 },
        { header: 'Status Komisi', key: 'status', width: 18 },
        { header: 'Perlu Dikembalikan?', key: 'needsReturn', width: 22 },
        { header: 'Tgl Diperoleh', key: 'earnedAt', width: 16 },
        { header: 'Tgl Dibayar', key: 'paidAt', width: 16 },
      ];
      styleHeaderRow(ws);

      for (const c of report.data) {
        ws.addRow({
          orderNo: sanitizeFormulaInjection(c.orderNo),
          customerName: sanitizeFormulaInjection(c.customerName),
          salesName: sanitizeFormulaInjection(c.salesName),
          basisAmount: c.basisAmount,
          ratePercent: `${(c.rateBps / 100).toFixed(2)}%`,
          amount: c.amount,
          status: c.status,
          needsReturn: c.needsReturn ? 'YA (PERLU DIKEMBALIKAN)' : 'TIDAK',
          earnedAt: c.earnedAt.slice(0, 10),
          paidAt: c.paidAt ? c.paidAt.slice(0, 10) : '-',
        });
      }
      applyCurrencyFormatting(ws, ['basisAmount', 'amount']);
      break;
    }
  }

  const uint8 = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(uint8);

  return {
    buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename,
  };
}

/**
 * Generator Berkas PDF Laporan
 */
async function generatePdfExport(
  ctx: Ctx,
  query: ReportExportQuery,
  timestamp: string
): Promise<ExportResult> {
  const filename = `laporan_${query.type}_${timestamp}.pdf`;
  let title = 'Laporan Operasional BentoCat';
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];

  switch (query.type) {
    case 'receivables-aging': {
      title = 'Laporan Umur Piutang Usaha';
      const report = await getReceivablesAgingReport(ctx, {
        customerId: query.customerId,
        salesId: query.salesId,
      });

      tableHeaders = ['No. Inv', 'Pelanggan', 'Sales', 'Jatuh Tempo', 'Hari', 'Kategori', 'Sisa Piutang'];
      tableRows = report.items.map((i) => [
        i.invoiceNo,
        i.customerName,
        i.salesName,
        i.dueDate.slice(0, 10),
        String(i.daysOverdue),
        i.bucketLabel,
        formatRupiah(i.remainingAmount),
      ]);
      break;
    }
    case 'crm': {
      title = 'Laporan Aktivitas & Pipeline CRM';
      const report = await getCrmReport(ctx, {
        month: query.month,
        salesId: query.salesId,
      });

      tableHeaders = ['Tanggal', 'Jenis', 'Tipe', 'Pelanggan', 'Sales', 'Ringkasan'];
      tableRows = report.recentActivities.slice(0, 50).map((a) => [
        a.date.slice(0, 10),
        a.kind,
        a.type,
        a.customerName,
        a.salesName,
        a.summary,
      ]);
      break;
    }
    case 'margin': {
      title = 'Laporan Margin & Profitabilitas';
      const report = await getMarginReport(ctx, {
        groupBy: query.groupBy || 'order',
        from: query.from,
        to: query.to,
        salesId: query.salesId,
        productId: query.productId,
      } as MarginReportQuery);

      tableHeaders = ['No. Order', 'Pelanggan', 'Sales', 'Omzet', 'HPP Modal', 'Profit', 'Margin'];
      tableRows = (report.items as MarginOrderRow[]).map((r) => [
        r.orderNo,
        r.customerName,
        r.salesName,
        formatRupiah(r.revenue),
        formatRupiah(r.cogs),
        formatRupiah(r.profit),
        `${(r.marginBps / 100).toFixed(1)}%`,
      ]);
      break;
    }
    case 'sales-performance': {
      title = 'Laporan Kinerja Staf Sales';
      const report = await getSalesPerformanceReport(ctx, {
        month: query.month,
        salesId: query.salesId,
      } as SalesPerformanceQuery);

      tableHeaders = ['Sales', 'Omzet Riil', 'Target', 'Capaian', 'Profit Usaha', 'Deal', 'Komisi'];
      tableRows = report.items.map((s) => [
        s.salesName,
        formatRupiah(s.revenue),
        formatRupiah(s.targetRevenue ?? 0),
        s.achievementPercent !== null ? `${s.achievementPercent}%` : '-',
        formatRupiah(s.profit),
        String(s.orderCount),
        formatRupiah(s.earnedCommission),
      ]);
      break;
    }
    case 'commissions': {
      title = 'Laporan Komisi Staf Sales';
      const report = await getCommissionReport(ctx, {
        month: query.month,
        salesId: query.salesId,
        status: query.status as CommissionStatus | undefined,
        limit: 100,
      } as CommissionReportQuery);

      tableHeaders = ['No. Order', 'Pelanggan', 'Sales', 'Basis', 'Rate', 'Komisi', 'Status'];
      tableRows = report.data.map((c) => [
        c.orderNo,
        c.customerName,
        c.salesName,
        formatRupiah(c.basisAmount),
        `${(c.rateBps / 100).toFixed(2)}%`,
        formatRupiah(c.amount),
        c.needsReturn ? 'PERLU DIKEMBALIKAN' : c.status,
      ]);
      break;
    }
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 11px; color: #1e293b; margin: 0; padding: 10px; }
          .header { margin-bottom: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; }
          h1 { margin: 0 0 4px 0; font-size: 16px; color: #0f172a; }
          .sub { color: #64748b; font-size: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th { background: #f8fafc; color: #334155; font-size: 10px; text-transform: uppercase; padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; }
          td { padding: 6px 8px; border: 1px solid #e2e8f0; font-size: 10px; }
          tr:nth-child(even) { background: #f8fafc; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${title}</h1>
          <div class="sub">Dicetak pada: ${new Date().toLocaleString('id-ID')} &bull; BentoCat ERP</div>
        </div>
        <table>
          <thead>
            <tr>${tableHeaders.map((h) => `<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${tableRows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </body>
    </html>
  `;

  const buffer = await renderHtmlToPdf(html);

  return {
    buffer,
    contentType: 'application/pdf',
    filename,
  };
}

function styleHeaderRow(ws: ExcelJS.Worksheet): void {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }, // Slate 800
  };
  row.height = 24;
  row.alignment = { vertical: 'middle' };
}

function applyCurrencyFormatting(ws: ExcelJS.Worksheet, columnKeys: string[]): void {
  for (const key of columnKeys) {
    const col = ws.getColumn(key);
    col.numFmt = '#,##0';
    col.alignment = { horizontal: 'right' };
  }
}
