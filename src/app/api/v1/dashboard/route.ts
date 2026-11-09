import { withApi } from '@/lib/api/withApi';
import { Role } from '@prisma/client';
import { getDashboardData } from '@/lib/services/dashboard';

/**
 * GET /api/v1/dashboard
 *
 * Mengambil ringkasan operasional dan metrik dashboard bisnis.
 * DTO berbeda per role:
 * - Super Admin: antrean approval, verifikasi pembayaran, stok minus, piutang overdue, omzet, HPP, profit & leaderboard.
 * - Sales: fokus hari ini (pengingat, tugas CRM, status approval pesanan dengan alasan penolakan, piutang customernya), target, komisi, tanpa angka profit (Zero-Leakage).
 *
 * Rujukan: Seksi 11, Seksi 17.3 nomor 21, dan Seksi 17.4 a (Zero-Leakage) Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx }) => {
    const data = await getDashboardData(ctx);
    return { data };
  }
);

