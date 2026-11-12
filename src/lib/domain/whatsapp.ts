import { formatRupiah } from './money';
import { formatDateId } from '@/lib/format/date';

/**
 * Menormalkan nomor telepon Indonesia/internasional menjadi format digit WhatsApp (628...).
 */
export function normalizeWaPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`;
  }
  return digits;
}

/**
 * Membuat tautan wa.me lengkap dengan pesan teks pre-filled jika nomor telepon tersedia.
 */
export function buildWaUrl(
  phone: string | null | undefined,
  message: string
): string | null {
  const normalized = normalizeWaPhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/**
 * Membuat tautan share wa.me dengan atau tanpa nomor tujuan.
 */
export function buildWaShareUrl(
  message: string,
  phone?: string | null
): string {
  const normalized = normalizeWaPhone(phone);
  if (normalized) {
    return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function buildRepeatReminderWaMessage(params: {
  customerName: string;
  intervalDays: number;
  lastOrderDate?: string | Date | null;
}): string {
  const lastStr = params.lastOrderDate
    ? formatDateId(params.lastOrderDate)
    : '-';
  return `Halo ${params.customerName}, kami ingin menyapa dan mengingatkan estimasi stok rutin Anda (siklus ${params.intervalDays} hari, order terakhir ${lastStr}). Apakah ada kebutuhan repeat order minggu ini? Terima kasih.`;
}

export function buildCrmTaskWaMessage(params: {
  customerName: string;
  taskTitle: string;
}): string {
  return `Halo ${params.customerName}, kami menindaklanjuti agenda "${params.taskTitle}". Mohon informasinya bila ada yang dapat kami bantu. Terima kasih.`;
}

export function buildInvoiceWaMessage(params: {
  customerName: string;
  invoiceNumber: string;
  type: 'DP' | 'FINAL' | string;
  remainingAmount: number;
  grandTotal?: number;
  verifyUrl?: string | null;
}): string {
  const label = params.type === 'DP' ? 'Faktur DP Resmi' : 'Faktur Penjualan Resmi';
  const parts = [
    `Halo ${params.customerName}, berikut informasi ${label} #${params.invoiceNumber}.`,
    params.remainingAmount > 0
      ? `Sisa tagihan: ${formatRupiah(params.remainingAmount)}.`
      : `Status tagihan: Lunas (${formatRupiah(params.grandTotal ?? 0)}).`,
  ];
  if (params.verifyUrl) {
    parts.push(`Cek keaslian dokumen resmi: ${params.verifyUrl}`);
  }
  parts.push('Terima kasih.');
  return parts.join(' ');
}

