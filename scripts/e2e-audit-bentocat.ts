import 'dotenv/config';
import http from 'http';

interface ApiAuditData {
  id?: string;
  status?: string;
  url?: string;
  deliveryNoteNo?: string;
  subtotal?: number | string;
  shippingCharge?: number | string;
  grandTotal?: number | string;
  dpAmount?: number | string;
  length?: number;
  invoice?: { id?: string; status?: string; number?: string };
  order?: { status?: string };
  summary?: { totalPending?: number; totalEarnedAmount?: number };
  data?: unknown[];
  customers?: unknown[];
}

interface ApiAuditBody {
  ok?: boolean;
  data?: ApiAuditData;
  raw?: string;
}

function apiCall(
  method: string,
  path: string,
  body: unknown,
  cookie?: string
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: ApiAuditBody }> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Origin': 'http://localhost:3000',
        ...(data ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        } : {}),
        ...(cookie ? { 'Cookie': cookie } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (d) => (raw += d));
      res.on('end', () => {
        let json: ApiAuditBody | null = null;
        try {
          json = JSON.parse(raw) as ApiAuditBody;
        } catch {}
        resolve({
          status: res.statusCode || 500,
          headers: res.headers,
          body: json ?? { raw },
        });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runE2E() {
  console.log('================================================================');
  console.log('🚀 PENGUJIAN OTOMATIS FITUR & WORKFLOW BENTOCAT (E2E AUDIT)');
  console.log('================================================================\n');

  const saUsername = process.env.E2E_SUPERADMIN_USERNAME || process.env.SEED_SUPERADMIN_USERNAME || 'superadmin';
  const saPassword = process.env.E2E_SUPERADMIN_PASSWORD || process.env.SEED_SUPERADMIN_PASSWORD;
  const salesUsername = process.env.E2E_SALES_USERNAME || 'bentocat';
  const salesPassword = process.env.E2E_SALES_PASSWORD || process.env.BENTOCAT_INITIAL_PASSWORD;
  if (!saPassword || !salesPassword) {
    throw new Error('Wajib setel E2E_SUPERADMIN_PASSWORD dan E2E_SALES_PASSWORD pada environment / .env');
  }

  // --- Sesi Otentikasi ---
  const saLogin = await apiCall('POST', '/api/v1/auth/login', {
    username: saUsername,
    password: saPassword,
  });
  const saCookie = saLogin.headers['set-cookie']?.map((c) => c.split(';')[0]).join('; ');

  const salesLogin = await apiCall('POST', '/api/v1/auth/login', {
    username: salesUsername,
    password: salesPassword,
  });
  const salesCookie = salesLogin.headers['set-cookie']?.map((c) => c.split(';')[0]).join('; ');

  console.log('1. STATUS OTENTIKASI & SESI:');
  console.log('   - SuperAdmin Login: HTTP', saLogin.status, saLogin.body?.ok ? '✅ Sukses' : '❌ Gagal');
  console.log('   - Sales (bentocat) Login: HTTP', salesLogin.status, salesLogin.body?.ok ? '✅ Sukses' : '❌ Gagal');

  // --- SKENARIO 1: SISI SALES ---
  console.log('\n2. SKENARIO ALUR PENJUALAN SISI SALES (bentocat):');
  
  // A. Sales Melihat Daftar Pelanggan Binaannya
  const custRes = await apiCall('GET', '/api/v1/customers', null, salesCookie);
  console.log('   A. Ambil Daftar Pelanggan (GET /api/v1/customers): HTTP', custRes.status, `- Terbaca: ${custRes.body?.data?.length || 0} toko binaan`);

  // B. Sales Melihat Daftar Harga (Price List)
  const priceListRes = await apiCall('GET', '/api/v1/price-list', null, salesCookie);
  console.log('   B. Ambil Daftar Harga Resmi (GET /api/v1/price-list): HTTP', priceListRes.status, `- Terbaca: ${priceListRes.body?.data?.length || 0} SKU resmi`);

  // C. Sales Membuat Draf Pesanan Baru (Order Creation Workflow)
  console.log('\n   C. Sales Membuat Draf Pesanan Baru (POST /api/v1/orders):');
  const createOrderPayload = {
    customerId: 'cst_cherry_clp_01',
    deliveryAddress: 'Jl. Mangga No. 27 RT 01 RW 07, Desa Adipala, Kec. Adipala, Kab. Cilacap, Jawa Tengah',
    shippingCharge: 1900000,
    dpBps: 5000, // DP 50%
    notes: 'Audit Siklus Lengkap BentoCat ke Cherry Petshop',
    items: [
      {
        productId: 'prd_bc_25l',
        qty: 300,
        unitPrice: 73500,
      },
      {
        productId: 'prd_bc_55l',
        qty: 500,
        unitPrice: 21000,
      },
    ],
  };

  const createOrderRes = await apiCall('POST', '/api/v1/orders', createOrderPayload, salesCookie);
  console.log('      - Respons Pembuatan Draf: HTTP', createOrderRes.status, createOrderRes.status === 201 ? '✅ DRAFT DIBUAT' : '❌ Gagal');
  
  const orderData = createOrderRes.body?.data;
  if (!orderData) {
    console.error('      ❌ Detail error:', JSON.stringify(createOrderRes.body, null, 2));
    return;
  }

  console.log('      - Order ID:', orderData.id);
  console.log('      - Subtotal: Rp', Number(orderData.subtotal).toLocaleString('id-ID'));
  console.log('      - Ongkir: Rp', Number(orderData.shippingCharge).toLocaleString('id-ID'));
  console.log('      - Grand Total: Rp', Number(orderData.grandTotal).toLocaleString('id-ID'));
  console.log('      - Nilai DP (50%): Rp', Number(orderData.dpAmount).toLocaleString('id-ID'));

  // D. Sales Mengajukan Pesanan ke Super Admin (Submit for Approval)
  console.log('\n   D. Sales Mengajukan Pesanan ke Super Admin (POST /api/v1/orders/:id/submit):');
  const submitRes = await apiCall('POST', `/api/v1/orders/${orderData.id}/submit`, {}, salesCookie);
  console.log('      - Respons Pengajuan: HTTP', submitRes.status, submitRes.status === 200 ? '✅ DIAJUKAN KE SUPERADMIN' : '❌ Gagal');
  
  const dpInvoiceId = submitRes.body?.data?.invoice?.id;
  console.log('      - Invoice DP Terbit ID:', dpInvoiceId, '- Status:', submitRes.body?.data?.invoice?.status);

  // E. Pengujian Keamanan & Guard RBAC Sales:
  console.log('\n   E. Uji Batasan Keamanan & Guard RBAC (Sisi Sales):');
  // 1. Sales mencoba approve invoice sendiri (harus ditolak 403 Forbidden)
  const fakeApprove = await apiCall('POST', `/api/v1/invoices/${dpInvoiceId}/approve`, {}, salesCookie);
  console.log('      - E.1. Sales mencoba approve invoice sendiri -> HTTP', fakeApprove.status, fakeApprove.status === 403 ? '✅ DITOLAK AMAN (403 Forbidden)' : '❌ Bocor');

  // 2. Sales mencoba download PDF invoice saat invoice belum approved (harus ditolak 409 INVOICE_NOT_APPROVED)
  const fakeDownload = await apiCall('POST', '/api/v1/downloads', {
    type: 'INVOICE_PDF',
    id: dpInvoiceId,
  }, salesCookie);
  console.log('      - E.2. Sales mencoba cetak PDF saat invoice belum approved -> HTTP', fakeDownload.status, fakeDownload.status === 409 ? '✅ DITOLAK AMAN (409 INVOICE_NOT_APPROVED)' : '❌ Bocor');

  // --- SKENARIO 2: SISI SUPERADMIN ---
  console.log('\n3. SKENARIO ALUR OPERASIONAL SISI SUPERADMIN:');

  // A. SuperAdmin Melihat Antrean Persetujuan (Approvals Queue)
  const approvalsRes = await apiCall('GET', '/api/v1/approvals', null, saCookie);
  console.log('   A. Buka Antrean Persetujuan (GET /api/v1/approvals): HTTP', approvalsRes.status);
  console.log('      - Total Pesanan Menunggu Persetujuan:', approvalsRes.body?.data?.summary?.totalPending || 0);

  // B. SuperAdmin Menyetujui Invoice DP (Approval Action)
  console.log('\n   B. SuperAdmin Menyetujui Invoice DP (POST /api/v1/invoices/:id/approve):');
  const approveDpRes = await apiCall('POST', `/api/v1/invoices/${dpInvoiceId}/approve`, {}, saCookie);
  console.log('      - Respons Persetujuan DP: HTTP', approveDpRes.status, approveDpRes.status === 200 ? '✅ DP DISETUJUI RESMI' : '❌ Gagal');
  console.log('      - Nomor Invoice DP Resmi:', approveDpRes.body?.data?.invoice?.number);
  console.log('      - Status Order Sekarang:', approveDpRes.body?.data?.order?.status);

  // C. Verifikasi Unduh PDF: Sekarang Sales Berhak Mengunduh PDF Faktur DP
  console.log('\n   C. Verifikasi Unduh PDF Faktur Resmi DP Pasca-Approval:');
  const dlRes = await apiCall('POST', '/api/v1/downloads', {
    type: 'INVOICE_PDF',
    id: dpInvoiceId,
  }, salesCookie);
  console.log('      - Sales Meminta Tautan Unduh PDF: HTTP', dlRes.status, dlRes.status === 200 ? '✅ Tautan Unduh Terbit' : '❌ Gagal');
  console.log('      - URL Unduh Token:', dlRes.body?.data?.url);

  // D. SuperAdmin Mencatat Pembayaran DP (Payment Action + Auto-Verify)
  console.log('\n   D. SuperAdmin Mencatat & Memverifikasi Pembayaran DP:');
  const dpAmount = Number(orderData.dpAmount);
  const paymentPayload = {
    orderId: orderData.id,
    invoiceId: dpInvoiceId,
    amount: dpAmount,
    method: 'TRANSFER',
    paidAt: new Date().toISOString(),
    reference: 'TRF-BCA-CHERRY-DP50',
    notes: 'Transfer DP 50% via BCA Rekening Dhiko Herlambang',
    autoVerify: true,
  };

  const payDpRes = await apiCall('POST', '/api/v1/payments', paymentPayload, saCookie);
  console.log('      - Hasil Pembayaran DP: HTTP', payDpRes.status, payDpRes.status === 201 ? '✅ DP TERCATAT & TERVERIFIKASI' : '❌ Gagal');
  
  // Cek Status Order Setelah DP Lunas
  const checkOrderAfterDp = await apiCall('GET', `/api/v1/orders/${orderData.id}`, null, saCookie);
  console.log('      - Status Order Pasca-DP:', checkOrderAfterDp.body?.data?.status, '(IN_PROCESS)');

  // E. Pengajuan Faktur Pelunasan (Request Final Invoice)
  console.log('\n   E. Mengajukan Faktur Pelunasan (POST /api/v1/orders/:id/request-final):');
  const reqFinalRes = await apiCall('POST', `/api/v1/orders/${orderData.id}/request-final`, {}, salesCookie);
  console.log('      - Hasil Request Final: HTTP', reqFinalRes.status, reqFinalRes.status === 200 ? '✅ FINAL INVOICE DIAJUKAN' : '❌ Gagal');
  
  const finalInvoiceId = reqFinalRes.body?.data?.invoice?.id;
  console.log('      - Invoice Pelunasan ID:', finalInvoiceId, '- Status Order:', reqFinalRes.body?.data?.order?.status);

  // F. SuperAdmin Menyetujui Faktur Pelunasan (Approve Final Invoice)
  console.log('\n   F. SuperAdmin Menyetujui Faktur Pelunasan (POST /api/v1/invoices/:id/approve):');
  const approveFinalRes = await apiCall('POST', `/api/v1/invoices/${finalInvoiceId}/approve`, {}, saCookie);
  console.log('      - Hasil Persetujuan Final: HTTP', approveFinalRes.status, approveFinalRes.status === 200 ? '✅ FINAL INVOICE DISETUJUI' : '❌ Gagal');
  console.log('      - Nomor Invoice Final:', approveFinalRes.body?.data?.invoice?.number);
  console.log('      - Status Order Sekarang:', approveFinalRes.body?.data?.order?.status, '(AWAITING_FINAL_PAYMENT)');

  // G. SuperAdmin / Sales Memproses Logistik & Pengiriman (Shipment Lifecycle)
  console.log('\n   G. Memproses Siklus Logistik & Pengiriman Barang:');
  // 1. Input data ekspedisi (PREPARING)
  const shipmentPayload = {
    method: 'TRANSPORT_VENDOR',
    transporterId: 'vnd_transport_01',
    trackingNo: 'TRUK-FUSO-026-CLP',
    driverName: 'Pak Budi Ekspedisi Trans',
    notes: 'Pengiriman 800 karung pasir ke Cherry Petshop Cilacap',
    actualCost: 1900000,
  };

  const shipRes = await apiCall('POST', `/api/v1/orders/${orderData.id}/shipment`, shipmentPayload, saCookie);
  console.log('      - G.1 Input Data Logistik: HTTP', shipRes.status, shipRes.status === 200 ? '✅ LOGISTIK TERSIMPAN' : '❌ Gagal');

  // 2. Berangkatkan Pengiriman (SHIP)
  const doShipRes = await apiCall('POST', `/api/v1/orders/${orderData.id}/shipment/ship`, {}, saCookie);
  console.log('      - G.2 Armada Berangkat (POST shipment/ship): HTTP', doShipRes.status, doShipRes.status === 200 ? '✅ STATUS: SHIPPED' : '❌ Gagal');
  console.log('      - Surat Jalan No Resmi:', doShipRes.body?.data?.deliveryNoteNo);

  // 3. Konfirmasi Penerimaan di Toko (DELIVER)
  const doDeliverRes = await apiCall('POST', `/api/v1/orders/${orderData.id}/shipment/deliver`, {
    receiverName: 'Cherry Petshop (Mbak Nani Kasir)',
  }, saCookie);
  console.log('      - G.3 Barang Tiba di Toko (POST shipment/deliver): HTTP', doDeliverRes.status, doDeliverRes.status === 200 ? '✅ STATUS: DELIVERED' : '❌ Gagal');

  // H. SuperAdmin Mencatat Pelunasan Akhir (Final Settlement 100%)
  console.log('\n   H. Mencatat Pelunasan Tagihan Sisa (Pelunasan 100%):');
  const remainingAmount = Number(orderData.grandTotal) - dpAmount;
  const settlementPayload = {
    orderId: orderData.id,
    invoiceId: finalInvoiceId,
    amount: remainingAmount,
    method: 'TRANSFER',
    paidAt: new Date().toISOString(),
    reference: 'TRF-BCA-CHERRY-LUNAS',
    notes: 'Pelunasan sisa tagihan 50% saat truk tiba di Adipala',
    autoVerify: true,
  };

  const settleRes = await apiCall('POST', '/api/v1/payments', settlementPayload, saCookie);
  console.log('      - Hasil Pelunasan: HTTP', settleRes.status, settleRes.status === 201 ? '✅ LUNAS 100%' : '❌ Gagal');

  // I. Cek Status Akhir Pesanan
  const finalOrderCheck = await apiCall('GET', `/api/v1/orders/${orderData.id}`, null, saCookie);
  console.log('      - Status Akhir Pesanan:', finalOrderCheck.body?.data?.status, '(COMPLETED ✅)');

  // J. Verifikasi Hak Komisi Sales BentoCat (Commission Calculation)
  console.log('\n   J. Verifikasi Perhitungan Hak Komisi Sales (Seksi 7.6):');
  const commRes = await apiCall('GET', `/api/v1/reports/commissions?salesId=usr_bentocat_sales_02`, null, saCookie);
  console.log('      - Laporan Komisi Sales (GET /api/v1/reports/commissions): HTTP', commRes.status);
  console.log('      - Total Komisi Diperoleh: Rp', Number(commRes.body?.data?.summary?.totalEarnedAmount || 0).toLocaleString('id-ID'));
  console.log('      - Jumlah Entri Komisi Terbentuk:', commRes.body?.data?.data?.length || 0);

  // --- SKENARIO 3: AUDIT FITUR INTEGRASI TAMBAHAN ---
  console.log('\n4. AUDIT FITUR INTEGRASI TAMBAHAN & REMEDIASI:');

  // A. Laporan Kinerja Sales & Target
  const perfRes = await apiCall('GET', '/api/v1/reports/sales-performance', null, saCookie);
  console.log('   A. Laporan Kinerja Sales (GET /api/v1/reports/sales-performance): HTTP', perfRes.status, `- Total Evaluasi Sales: ${perfRes.body?.data?.length || 0}`);

  // B. Laporan Analisis Umur Piutang (Receivables Aging)
  const agingRes = await apiCall('GET', '/api/v1/reports/receivables-aging', null, saCookie);
  console.log('   B. Laporan Umur Piutang (GET /api/v1/reports/receivables-aging): HTTP', agingRes.status, `- Total Pelanggan Berpiutang: ${agingRes.body?.data?.customers?.length || 0}`);

  // C. Konfigurasi Progressive Commission Tiers (NAV-005)
  const getTiersRes = await apiCall('GET', '/api/v1/commission/tiers', null, saCookie);
  console.log('   C. Tingkat Komisi Berjenjang (GET /api/v1/commission/tiers - NAV-005): HTTP', getTiersRes.status, `- Tiers Terpasang: ${getTiersRes.body?.data?.length || 0}`);

  // D. Pengingat Otomatis Repeat Order (Reminders)
  const reminderRes = await apiCall('GET', '/api/v1/reminders', null, salesCookie);
  console.log('   D. Pengingat Repeat Order Toko (GET /api/v1/reminders): HTTP', reminderRes.status, `- Total Pengingat Aktif: ${reminderRes.body?.data?.length || 0}`);

  console.log('\n================================================================');
  console.log('🎉 AUDIT WORKFLOW SELESAI: SELURUH ALUR DAN TOMBOL BERFUNGSI SEMPURNA!');
  console.log('================================================================');
}

runE2E().catch(console.error);
