export type DateIdPreset =
  | 'compact'
  | 'short'
  | 'shortPad'
  | 'long'
  | 'full'
  | 'dateTime';

const DATE_PRESET_OPTIONS: Record<
  DateIdPreset,
  Intl.DateTimeFormatOptions | undefined
> = {
  compact: undefined,
  short: { day: 'numeric', month: 'short', year: 'numeric' },
  shortPad: { day: '2-digit', month: 'short', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  dateTime: {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
};

/**
 * Memformat tanggal lokal Indonesia secara seragam di seluruh UI, PDF, WhatsApp, dan bot.
 */
export function formatDateId(
  value: Date | string | number,
  preset: DateIdPreset = 'short'
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '-';
  const options = DATE_PRESET_OPTIONS[preset];
  return options
    ? date.toLocaleDateString('id-ID', options)
    : date.toLocaleDateString('id-ID');
}

