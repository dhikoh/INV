import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import {
  nextSeq,
  allocateCustomerOrderSeq,
  allocateVendorPoSeq,
  allocateCustomerCreditNoteSeq,
  CounterScope,
  QueryRawExecutor,
} from '@/lib/services/counter';
import {
  orderNumber,
  invoiceNumber,
  suratJalanNumber,
  creditNoteNumber,
  purchaseOrderNumber,
} from '@/lib/domain/numbering';
import { Prisma } from '@prisma/client';

/**
 * Adapter lightweight yang mengonversi template string atau Prisma.Sql menjadi
 * query parameterized PostgreSQL ($1, $2, ...) yang kompatibel dengan PGlite.
 */
function createPgliteTxAdapter(pgliteOrTx: {
  query: (q: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}): QueryRawExecutor {
  return {
    async $queryRaw<T = unknown>(
      query: TemplateStringsArray | Prisma.Sql,
      ...values: unknown[]
    ): Promise<T> {
      let strings: readonly string[];
      let vals: unknown[];

      if (query && typeof query === 'object' && 'strings' in query) {
        strings = (query as { strings: string[] }).strings;
        vals = (query as { values: unknown[] }).values;
      } else {
        strings = query as TemplateStringsArray;
        vals = values;
      }

      let sql = strings[0];
      for (let i = 0; i < vals.length; i++) {
        sql += `$${i + 1}` + strings[i + 1];
      }

      const res = await pgliteOrTx.query(sql, vals);
      return res.rows as T;
    },
  };
}

describe('Penomoran Dokumen & DocumentCounter (T2.4, 7.8, 17.3 nomor 5)', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();

    const initSqlPath = path.resolve(
      __dirname,
      '../../prisma/migrations/20261107000001_init/migration.sql'
    );
    const initSql = fs.readFileSync(initSqlPath, 'utf-8');
    await db.exec(initSql);

    // Seed dummy businesses & customers
    await db.query(`
      INSERT INTO "Business" ("id", "code", "name", "updatedAt") 
      VALUES ('biz_alpha', 'ALP', 'Usaha Alpha', NOW()),
             ('biz_beta', 'BET', 'Usaha Beta', NOW());
    `);
  });

  it('20 alokasi serentak (Promise.all) untuk customer yang sama menghasilkan urutan 1–20 unik tanpa lubang (17.3 nomor 5)', async () => {
    const businessId = 'biz_alpha';
    const customerId = 'cust_simultaneous_20';
    const scope = CounterScope.ORDER_SEQ;

    // Jalankan 20 alokasi serentak menggunakan Promise.all di dalam transaksi masing-masing
    const promises = Array.from({ length: 20 }, async () => {
      return db.transaction(async (tx) => {
        const txAdapter = createPgliteTxAdapter(tx);
        return await nextSeq(txAdapter, businessId, scope, customerId);
      });
    });

    const results = await Promise.all(promises);

    // Verifikasi jumlah hasil tepat 20
    expect(results).toHaveLength(20);

    // Verifikasi semua hasil unik tanpa duplikat
    const uniqueSet = new Set(results);
    expect(uniqueSet.size).toBe(20);

    // Verifikasi urutan lengkap 1 s.d. 20 tanpa celah
    const sorted = [...results].sort((a, b) => a - b);
    const expected = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(sorted).toEqual(expected);
  });

  it('dua customer berbeda memiliki urutan sendiri-sendiri secara paralel (17.3 nomor 5)', async () => {
    const businessId = 'biz_alpha';
    const customerA = 'cust_parallel_A';
    const customerB = 'cust_parallel_B';
    const scope = CounterScope.ORDER_SEQ;

    // 10 alokasi untuk customer A dan 10 alokasi untuk customer B dijalankan serentak bersamaan
    const promisesA = Array.from({ length: 10 }, async () => {
      return db.transaction(async (tx) => {
        const txAdapter = createPgliteTxAdapter(tx);
        return await nextSeq(txAdapter, businessId, scope, customerA);
      });
    });

    const promisesB = Array.from({ length: 10 }, async () => {
      return db.transaction(async (tx) => {
        const txAdapter = createPgliteTxAdapter(tx);
        return await nextSeq(txAdapter, businessId, scope, customerB);
      });
    });

    const [resultsA, resultsB] = await Promise.all([
      Promise.all(promisesA),
      Promise.all(promisesB),
    ]);

    expect(resultsA).toHaveLength(10);
    expect(resultsB).toHaveLength(10);

    // Masing-masing customer harus memiliki urutan 1..10 sendiri tanpa saling mengganggu
    const sortedA = [...resultsA].sort((a, b) => a - b);
    const sortedB = [...resultsB].sort((a, b) => a - b);
    const expected10 = Array.from({ length: 10 }, (_, i) => i + 1);

    expect(sortedA).toEqual(expected10);
    expect(sortedB).toEqual(expected10);
  });

  it('urutan terisolasi antar unit usaha (multi-tenant isolation) dengan scopeId yang sama', async () => {
    const scope = CounterScope.ORDER_SEQ;
    const sameCustomerId = 'shared_cust_id_across_biz';

    const adapter = createPgliteTxAdapter(db);

    const seqBizAlpha1 = await nextSeq(adapter, 'biz_alpha', scope, sameCustomerId);
    const seqBizAlpha2 = await nextSeq(adapter, 'biz_alpha', scope, sameCustomerId);

    const seqBizBeta1 = await nextSeq(adapter, 'biz_beta', scope, sameCustomerId);
    const seqBizBeta2 = await nextSeq(adapter, 'biz_beta', scope, sameCustomerId);

    expect(seqBizAlpha1).toBe(1);
    expect(seqBizAlpha2).toBe(2);

    expect(seqBizBeta1).toBe(1);
    expect(seqBizBeta2).toBe(2);
  });

  it('urutan terisolasi antar scope berbeda (ORDER_SEQ vs CREDIT_NOTE_SEQ) pada customer yang sama', async () => {
    const businessId = 'biz_alpha';
    const customerId = 'cust_multi_scope';
    const adapter = createPgliteTxAdapter(db);

    const orderSeq1 = await allocateCustomerOrderSeq(adapter, businessId, customerId);
    const orderSeq2 = await allocateCustomerOrderSeq(adapter, businessId, customerId);

    const cnSeq1 = await allocateCustomerCreditNoteSeq(adapter, businessId, customerId);
    const cnSeq2 = await allocateCustomerCreditNoteSeq(adapter, businessId, customerId);

    expect(orderSeq1).toBe(1);
    expect(orderSeq2).toBe(2);

    // Credit Note memiliki counter independen sendiri
    expect(cnSeq1).toBe(1);
    expect(cnSeq2).toBe(2);
  });

  it('persetujuan/alokasi yang gagal di tengah transaksi (rollback) tidak menghanguskan nomor (17.3 nomor 5)', async () => {
    const businessId = 'biz_alpha';
    const customerId = 'cust_rollback_test';
    const scope = CounterScope.ORDER_SEQ;

    // Transaksi 1 berhasil: nomor urut 1
    const seq1 = await db.transaction(async (tx) => {
      const txAdapter = createPgliteTxAdapter(tx);
      return await nextSeq(txAdapter, businessId, scope, customerId);
    });
    expect(seq1).toBe(1);

    // Transaksi 2 gagal di tengah jalan (simulasi error approval/reservasi stok)
    await expect(
      db.transaction(async (tx) => {
        const txAdapter = createPgliteTxAdapter(tx);
        await nextSeq(txAdapter, businessId, scope, customerId);
        throw new Error('Simulasi pembatalan approval order');
      })
    ).rejects.toThrowError(/Simulasi pembatalan/);

    // Transaksi 3 berhasil: nomor urut harus 2, BUKAN 3 (nomor tidak hangus!)
    const seq2 = await db.transaction(async (tx) => {
      const txAdapter = createPgliteTxAdapter(tx);
      return await nextSeq(txAdapter, businessId, scope, customerId);
    });
    expect(seq2).toBe(2);
  });

  it('alokasi nomor PO vendor (allocateVendorPoSeq) berjalan terpisah dan konsisten', async () => {
    const businessId = 'biz_alpha';
    const vendorId = 'vend_tepung_terigu';
    const adapter = createPgliteTxAdapter(db);

    const po1 = await allocateVendorPoSeq(adapter, businessId, vendorId);
    const po2 = await allocateVendorPoSeq(adapter, businessId, vendorId);

    expect(po1).toBe(1);
    expect(po2).toBe(2);
  });

  it('integrasi penomoran dokumen lengkap (formatDocNumber & invoiceNumber)', async () => {
    const businessId = 'biz_alpha';
    const customerId = 'cust_doc_format_test';
    const customerCode = 'TEROBOS';
    const adapter = createPgliteTxAdapter(db);

    const seq = await allocateCustomerOrderSeq(adapter, businessId, customerId);
    const allocDate = new Date('2026-11-05T03:00:00Z'); // 10:00 WIB

    // 1. Order Number (KODE/INV/DD/MM/YYYY/NNNN)
    const orderNo = orderNumber(customerCode, allocDate, seq);
    expect(orderNo).toBe('TEROBOS/INV/05/11/2026/0001');

    // 2. Invoice DP (-DP)
    const invDp = invoiceNumber(orderNo, 'DP', 1);
    expect(invDp).toBe('TEROBOS/INV/05/11/2026/0001-DP');

    // 3. Invoice Pelunasan (-LNS)
    const invLns = invoiceNumber(orderNo, 'FINAL', 1);
    expect(invLns).toBe('TEROBOS/INV/05/11/2026/0001-LNS');

    // 4. Invoice Revisi (-DP-R1, -LNS-R2)
    const invDpRev = invoiceNumber(orderNo, 'DP', 2);
    expect(invDpRev).toBe('TEROBOS/INV/05/11/2026/0001-DP-R1');

    const invLnsRev = invoiceNumber(orderNo, 'FINAL', 3);
    expect(invLnsRev).toBe('TEROBOS/INV/05/11/2026/0001-LNS-R2');

    // 5. Surat Jalan (KODE/SJ/DD/MM/YYYY/NNNN) menggunakan seq yang sama dengan order
    const sjNo = suratJalanNumber(customerCode, allocDate, seq);
    expect(sjNo).toBe('TEROBOS/SJ/05/11/2026/0001');

    // 6. Credit note (KODE/CN/...)
    const cnSeq = await allocateCustomerCreditNoteSeq(adapter, businessId, customerId);
    const cnNo = creditNoteNumber(customerCode, allocDate, cnSeq);
    expect(cnNo).toBe('TEROBOS/CN/05/11/2026/0001');

    // 7. PO Vendor (KODEVENDOR/PO/...)
    const vendorCode = 'INDM';
    const poSeq = await allocateVendorPoSeq(adapter, businessId, 'vend_indofood');
    const poNo = purchaseOrderNumber(vendorCode, allocDate, poSeq);
    expect(poNo).toBe('INDM/PO/05/11/2026/0001');
  });

  it('stress test: 50 alokasi serentak (Promise.all) menghasilkan urutan 1–50 tanpa tabrakan', async () => {
    const businessId = 'biz_alpha';
    const customerId = 'cust_stress_50';
    const scope = CounterScope.ORDER_SEQ;

    const promises = Array.from({ length: 50 }, async () => {
      return db.transaction(async (tx) => {
        const txAdapter = createPgliteTxAdapter(tx);
        return await nextSeq(txAdapter, businessId, scope, customerId);
      });
    });

    const results = await Promise.all(promises);
    expect(results).toHaveLength(50);
    expect(new Set(results).size).toBe(50);

    const sorted = [...results].sort((a, b) => a - b);
    const expected = Array.from({ length: 50 }, (_, i) => i + 1);
    expect(sorted).toEqual(expected);
  });

  it('menolak (throw Error) jika businessId, scope, atau scopeId bernilai kosong', async () => {
    const adapter = createPgliteTxAdapter(db);

    await expect(nextSeq(adapter, '', 'ORDER_SEQ', 'cust_1')).rejects.toThrowError(
      /businessId wajib diisi/
    );
    await expect(nextSeq(adapter, 'biz_1', '', 'cust_1')).rejects.toThrowError(
      /scope wajib diisi/
    );
    await expect(nextSeq(adapter, 'biz_1', 'ORDER_SEQ', '')).rejects.toThrowError(
      /scopeId wajib diisi/
    );
  });
});
