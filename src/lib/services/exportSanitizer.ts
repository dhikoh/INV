/**
 * Mitigasi Spreadsheet / CSV Formula Injection (Seksi 16.4 Dokumen Spesifikasi).
 *
 * Mengamankan teks sel yang diawali karakter formula spreadsheet (=, +, -, @)
 * dengan menambahkan awalan tanda petik tunggal (') agar aplikasi spreadsheet
 * (Microsoft Excel, LibreOffice Calc, Google Sheets) memperlakukannya sebagai teks mentah
 * dan tidak mengeksekusinya sebagai formula atau perintah eksternal (CWE-1236).
 */
export function sanitizeFormulaInjection(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0 && /^[=+\-@]/.test(trimmed)) {
      return `'${value}`;
    }
    return value;
  }
  return value;
}

/**
 * Sanitasi seluruh properti objek / baris sebelum dimasukkan ke berkas spreadsheet.
 */
export function sanitizeRow<T extends Record<string, unknown>>(row: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    result[key] = sanitizeFormulaInjection(val);
  }
  return result as T;
}
