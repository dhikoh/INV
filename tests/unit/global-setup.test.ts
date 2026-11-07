import { describe, it, expect } from 'vitest';
import { assertTestDbUrl } from '../setup/globalSetup';

describe('Test Infrastructure: globalSetup (T0.5, 17.1)', () => {
  it('berhasil bila TEST_DATABASE_URL berakhiran _test', () => {
    expect(() =>
      assertTestDbUrl('postgresql://app:app@localhost:5433/app_test')
    ).not.toThrow();

    expect(() =>
      assertTestDbUrl(
        'postgresql://app:app@localhost:5432/omnicat_production_test'
      )
    ).not.toThrow();
  });

  it('gagal (menolak) bila TEST_DATABASE_URL tidak berakhiran _test untuk mencegah wipe database riil', () => {
    expect(() =>
      assertTestDbUrl('postgresql://app:app@localhost:5432/app')
    ).toThrowError(
      /TEST_DATABASE_URL harus menunjuk database yang namanya berakhiran _test/
    );

    expect(() =>
      assertTestDbUrl('postgresql://app:app@localhost:5432/production_db')
    ).toThrowError(
      /TEST_DATABASE_URL harus menunjuk database yang namanya berakhiran _test/
    );

    expect(() => assertTestDbUrl('')).toThrowError(
      /TEST_DATABASE_URL harus menunjuk database yang namanya berakhiran _test/
    );
  });
});
