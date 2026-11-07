export function assertTestDbUrl(url: string): void {
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL harus menunjuk database yang namanya berakhiran _test'
    );
  }

  try {
    const parsed = new URL(url);
    if (!parsed.pathname.endsWith('_test')) {
      throw new Error(
        'TEST_DATABASE_URL harus menunjuk database yang namanya berakhiran _test'
      );
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('_test')) {
      throw err;
    }
    throw new Error(
      'TEST_DATABASE_URL harus menunjuk database yang namanya berakhiran _test'
    );
  }
}

export default async function setup() {
  const url =
    process.env.TEST_DATABASE_URL ??
    'postgresql://app:app@localhost:5433/app_test';
  assertTestDbUrl(url);
  process.env.DATABASE_URL = url;
}
