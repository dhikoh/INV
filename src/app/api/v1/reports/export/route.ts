import { NextRequest, NextResponse } from 'next/server';
import { requireContext } from '@/lib/auth/context';
import { toErrorResponse } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/domain/money';
import {
  exportReport,
  ExportReportType,
  ExportFormat,
} from '@/lib/services/reportExport';

const VALID_TYPES: ExportReportType[] = [
  'receivables-aging',
  'crm',
  'margin',
  'sales-performance',
  'commissions',
];

/**
 * GET /api/v1/reports/export
 *
 * Query params:
 * - type: 'receivables-aging' | 'crm' | 'margin' | 'sales-performance' | 'commissions' (wajib)
 * - format: 'xlsx' | 'pdf' (default 'xlsx')
 * - month: string YYYY-MM (opsional)
 * - from: string YYYY-MM-DD (opsional)
 * - to: string YYYY-MM-DD (opsional)
 * - salesId: string (opsional)
 * - customerId: string (opsional)
 * - productId: string (opsional)
 * - groupBy: 'order' | 'product' | 'sales' | 'business' (opsional)
 * - status: string (opsional)
 *
 * Rujukan: Seksi 16.2, 16.4 & Table 11 Dokumen Spesifikasi.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const ctx = await requireContext(req, [Role.SUPERADMIN, Role.SALES]);

    const url = new URL(req.url);
    const type = url.searchParams.get('type') as ExportReportType;
    const format = (url.searchParams.get('format') || 'xlsx') as ExportFormat;

    if (!type || !VALID_TYPES.includes(type)) {
      throw new DomainError('BAD_REQUEST', 'Parameter type laporan tidak valid', 400);
    }

    if (format !== 'xlsx' && format !== 'pdf') {
      throw new DomainError('BAD_REQUEST', 'Format ekspor harus xlsx atau pdf', 400);
    }

    const rawGroupBy = url.searchParams.get('groupBy');
    const groupBy: 'order' | 'product' | 'sales' | 'business' | undefined =
      rawGroupBy === 'order' ||
      rawGroupBy === 'product' ||
      rawGroupBy === 'sales' ||
      rawGroupBy === 'business'
        ? rawGroupBy
        : undefined;

    const query = {
      type,
      format,
      month: url.searchParams.get('month') || undefined,
      from: url.searchParams.get('from') || undefined,
      to: url.searchParams.get('to') || undefined,
      salesId: url.searchParams.get('salesId') || undefined,
      customerId: url.searchParams.get('customerId') || undefined,
      productId: url.searchParams.get('productId') || undefined,
      groupBy,
      status: url.searchParams.get('status') || undefined,
    };

    const result = await exportReport(ctx, query);

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err: unknown) {
    return toErrorResponse(err);
  }
}
