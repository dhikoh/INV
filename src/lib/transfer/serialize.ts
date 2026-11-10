// BigInt dan Date diberi penanda agar bisa dipulihkan persis saat impor (ADR 0008).
export function toJsonLine(row: unknown): string {
  return JSON.stringify(row, function (this: Record<string, unknown>, key: string, value: unknown) {
    const raw = this[key]; // nilai asli sebelum toJSON bawaan Date
    if (typeof raw === 'bigint') return { $t: 'bigint', v: raw.toString() };
    if (raw instanceof Date) return { $t: 'date', v: raw.toISOString() };
    return value;
  });
}

export function fromJsonLine<T = Record<string, unknown>>(line: string): T {
  return JSON.parse(line, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length === 2 && '$t' in value && 'v' in value) {
        const tagged = value as { $t: string; v: string };
        if (tagged.$t === 'bigint') return BigInt(tagged.v);
        if (tagged.$t === 'date') return new Date(tagged.v);
      }
    }
    return value;
  }) as T;
}

