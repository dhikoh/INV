/**
 * Helper utilitas sisi klien (Frontend) untuk membaca struktur data respons API secara aman dan konsisten.
 * Mencegah bug ketidakcocokan kontrak (seperti array langsung `data: T[]` vs `data: { items: T[] }`).
 */

export function unwrapList<T>(json: unknown): T[] {
  if (!json || typeof json !== 'object') return [];

  const raw = json as Record<string, unknown>;

  // Bila API mengembalikan { data: [...] }
  if (Array.isArray(raw.data)) {
    return raw.data as T[];
  }

  // Bila API mengembalikan { data: { items: [...] } }
  if (raw.data && typeof raw.data === 'object') {
    const dataObj = raw.data as Record<string, unknown>;
    if (Array.isArray(dataObj.items)) {
      return dataObj.items as T[];
    }
  }

  // Bila API mengembalikan { items: [...] } langsung
  if (Array.isArray(raw.items)) {
    return raw.items as T[];
  }

  // Bila respons adalah array langsung [...]
  if (Array.isArray(json)) {
    return json as T[];
  }

  return [];
}
