/**
 * Format teks untuk pesan Telegram (HTML Mode).
 * Rujukan: Seksi 12.4 & 12.5 Dokumen Spesifikasi.
 */

export function escapeHtml(s: string): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function prefix(businessCodeOrName: string, text: string): string {
  const safeCode = escapeHtml(businessCodeOrName || 'USAHA');
  return `<b>[${safeCode}]</b> ${text}`.slice(0, 4000);
}

