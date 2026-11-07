import * as argon2 from 'argon2';
import { DomainError } from '../domain/money';

export const OWASP_ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

// Valid pre-computed argon2id hash matching OWASP parameters for timing attack mitigation
export const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$XX967Ynqf8BAblv0pt26BA$zR8+E8viPMTQGN748bmCcsPac2IRb31GE677CbRLxUc';

export function validatePassword(password: string, username?: string): void {
  if (!password || password.length < 10 || password.length > 128) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'Password harus memiliki panjang 10 sampai 128 karakter',
      422
    );
  }
  if (username && password.toLowerCase() === username.trim().toLowerCase()) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'Password tidak boleh sama dengan username',
      422
    );
  }
}

export async function hashPassword(
  password: string,
  username?: string
): Promise<string> {
  validatePassword(password, username);
  return argon2.hash(password, { ...OWASP_ARGON2_OPTIONS, raw: false });
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function verifyDummyPassword(): Promise<boolean> {
  return verifyPassword('dummy-attempt-password', DUMMY_HASH);
}
