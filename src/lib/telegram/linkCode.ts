import crypto from 'crypto';

// Alfabet 32 karakter tanpa karakter membingungkan (tanpa 0, O, 1, I)
export const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateLinkCode(length = 8): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, LINK_CODE_ALPHABET.length);
    result += LINK_CODE_ALPHABET[randomIndex];
  }
  return result;
}

export function hashLinkCode(code: string): string {
  return crypto
    .createHash('sha256')
    .update(code.trim().toUpperCase())
    .digest('hex');
}
