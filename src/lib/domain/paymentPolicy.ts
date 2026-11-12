/**
 * Kebijakan pembayaran, anti-fraud, dan klausul legal default pada dokumen usaha.
 * Digunakan bersama oleh pengaturan usaha, generator PDF (Proforma/Faktur), dan validasi pembayaran.
 */
export const DEFAULT_PAYMENT_LEGAL_NOTICE =
  'PERHATIAN: Pembayaran HANYA dinyatakan sah apabila ditransfer ke rekening resmi perusahaan yang tercantum pada dokumen ini. Perusahaan tidak bertanggung jawab atas pembayaran tunai maupun transfer ke rekening pribadi Sales/karyawan tanpa bukti verifikasi resmi perusahaan.';

export function resolvePaymentLegalNotice(customNotice: string | null | undefined): string {
  const trimmed = customNotice?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_PAYMENT_LEGAL_NOTICE;
}
