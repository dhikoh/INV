const SATUAN = [
  '',
  'satu',
  'dua',
  'tiga',
  'empat',
  'lima',
  'enam',
  'tujuh',
  'delapan',
  'sembilan',
  'sepuluh',
  'sebelas',
];

function words(n: number): string {
  if (n < 12) return SATUAN[n];
  if (n < 20) return words(n - 10) + ' belas';
  if (n < 100) return words(Math.floor(n / 10)) + ' puluh ' + words(n % 10);
  if (n < 200) return 'seratus ' + words(n - 100);
  if (n < 1000) return words(Math.floor(n / 100)) + ' ratus ' + words(n % 100);
  if (n < 2000) return 'seribu ' + words(n - 1000);
  if (n < 1_000_000)
    return words(Math.floor(n / 1000)) + ' ribu ' + words(n % 1000);
  if (n < 1_000_000_000)
    return words(Math.floor(n / 1_000_000)) + ' juta ' + words(n % 1_000_000);
  if (n < 1_000_000_000_000)
    return (
      words(Math.floor(n / 1_000_000_000)) +
      ' miliar ' +
      words(n % 1_000_000_000)
    );
  return (
    words(Math.floor(n / 1_000_000_000_000)) +
    ' triliun ' +
    words(n % 1_000_000_000_000)
  );
}

export function terbilang(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error('terbilang hanya untuk bilangan bulat non-negatif');
  }
  if (n === 0) return 'nol';
  return words(n).split(' ').filter(Boolean).join(' ');
}
