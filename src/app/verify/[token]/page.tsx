import {
  resolvePublicVerifyDocument,
  PublicAuthenticityStatus,
  PublicDocumentType,
} from '@/lib/services/verify';
import { formatRupiah } from '@/lib/domain/money';
import { formatDateId } from '@/lib/format/date';

export const dynamic = 'force-dynamic';

const DOC_TYPE_LABELS: Record<PublicDocumentType, string> = {
  PROFORMA_ORDER: 'Proforma Order (Draf)',
  FAKTUR_DP: 'Faktur Uang Muka (DP)',
  FAKTUR_PENJUALAN: 'Faktur Penjualan Resmi',
  KWITANSI_PEMBAYARAN: 'Kwitansi Pembayaran Resmi',
  KATALOG_PROMO: 'Katalog Promosi Resmi',
  KATALOG_HARGA: 'Katalog Harga Resmi',
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draf',
  REVISION_REQUIRED: 'Perlu Revisi',
  PENDING_APPROVAL: 'Menunggu Persetujuan',
  AWAITING_DP: 'Menunggu Pembayaran DP',
  IN_PROCESS: 'Diproses',
  FINAL_PENDING_APPROVAL: 'Menunggu Persetujuan Faktur Akhir',
  AWAITING_FINAL_PAYMENT: 'Menunggu Pelunasan',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

const METHOD_LABELS: Record<string, string> = {
  TRANSFER: 'Transfer Bank',
  CASH: 'Tunai (Cash)',
  CREDIT: 'Saldo Kredit',
  OTHER: 'Lainnya',
};

function getStatusBanner(status: PublicAuthenticityStatus, isCatalog: boolean = false) {
  switch (status) {
    case 'OFFICIAL_APPROVED':
      return {
        title: isCatalog ? 'KATALOG RESMI TERVERIFIKASI' : 'DOKUMEN RESMI TERVERIFIKASI',
        subtitle: isCatalog
          ? 'Katalog penawaran harga ini diterbitkan resmi oleh unit usaha dan harga produk terverifikasi sah.'
          : 'Dokumen ini diterbitkan dan disetujui secara resmi oleh perusahaan.',
        boxClass: 'bg-emerald-50 border-emerald-200 text-emerald-900',
        pillClass: 'bg-emerald-600 text-white',
        pillText: 'ASLI & SAH',
      };
    case 'VERIFIED_RECEIPT':
      return {
        title: 'KWITANSI RESMI TERVERIFIKASI',
        subtitle: 'Dana pembayaran telah diterima dan divalidasi oleh perusahaan.',
        boxClass: 'bg-emerald-50 border-emerald-200 text-emerald-900',
        pillClass: 'bg-emerald-600 text-white',
        pillText: 'DANA TERVERIFIKASI',
      };
    case 'PROMO_EXPIRED':
      return {
        title: 'PERIODE PROMO TELAH BERAKHIR',
        subtitle:
          'Masa berlaku promosi untuk katalog ini telah berakhir. Hubungi sales resmi atau kantor untuk penawaran harga terkini.',
        boxClass: 'bg-amber-50 border-amber-200 text-amber-950',
        pillClass: 'bg-amber-600 text-white',
        pillText: 'PROMO BERAKHIR',
      };
    case 'STALE_PRICE':
      return {
        title: 'HARGA KATALOG PERLU PEMBARUAN',
        subtitle:
          'Terdapat perubahan harga dasar / paten pada beberapa produk di katalog ini. Hubungi sales resmi untuk konfirmasi harga terbaru.',
        boxClass: 'bg-amber-50 border-amber-200 text-amber-950',
        pillClass: 'bg-amber-600 text-white',
        pillText: 'PERLU PEMBARUAN',
      };
    case 'SALES_INACTIVE':
      return {
        title: 'SALES PIC SUDAH TIDAK AKTIF',
        subtitle:
          'Staf sales pembuat katalog ini sudah tidak aktif di perusahaan. Jangan melakukan transaksi dengan sales lama dan silakan hubungi hotline kantor resmi.',
        boxClass: 'bg-orange-50 border-orange-200 text-orange-950',
        pillClass: 'bg-orange-600 text-white',
        pillText: 'HUBUNGI KANTOR PUSAT',
      };
    case 'PROFORMA_DRAFT':
      return {
        title: 'PROFORMA ORDER (DRAF PENAWARAN)',
        subtitle: 'Dokumen penawaran awal sebelum faktur resmi diterbitkan manajemen.',
        boxClass: 'bg-amber-50 border-amber-200 text-amber-950',
        pillClass: 'bg-amber-600 text-white',
        pillText: 'DRAF / PROFORMA',
      };
    case 'PENDING_APPROVAL':
      return {
        title: 'MENUNGGU PERSETUJUAN MANAJEMEN',
        subtitle: 'Dokumen masih dalam tahap tinjauan internal dan belum bersifat final.',
        boxClass: 'bg-amber-50 border-amber-200 text-amber-950',
        pillClass: 'bg-amber-600 text-white',
        pillText: 'MENUNGGU PERSETUJUAN',
      };
    case 'CANCELLED_OR_VOID':
    default:
      return {
        title: isCatalog ? 'KATALOG DIBATALKAN / TIDAK BERLAKU' : 'DOKUMEN DIBATALKAN / TIDAK BERLAKU',
        subtitle: isCatalog
          ? 'Katalog ini telah ditarik atau dibatalkan oleh unit usaha. Jangan melakukan transaksi mengacu pada katalog ini.'
          : 'Dokumen ini telah di-void atau dibatalkan. Jangan melakukan transfer mengacu pada dokumen ini.',
        boxClass: 'bg-rose-50 border-rose-200 text-rose-950',
        pillClass: 'bg-rose-600 text-white',
        pillText: 'VOID / BATAL',
      };
  }
}

export default async function PublicVerifyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const doc = await resolvePublicVerifyDocument(token);

  if (!doc) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-2xl border border-rose-200 shadow-sm p-6 text-center space-y-3">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-bold uppercase tracking-wide">
            Tidak Ditemukan
          </div>
          <h1 className="text-lg font-bold text-slate-900">
            Kode Verifikasi Tidak Valid
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Dokumen dengan kode verifikasi ini tidak ditemukan di sistem atau sudah tidak berlaku.
            Pastikan Anda memindai QR Code langsung dari dokumen resmi perusahaan.
          </p>
        </div>
      </main>
    );
  }

  const isCatalog =
    doc.documentType === 'KATALOG_PROMO' || doc.documentType === 'KATALOG_HARGA';
  const banner = getStatusBanner(doc.authenticityStatus, isCatalog);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:py-10">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header Perusahaan */}
        <header className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Verifikasi Keaslian Dokumen
            </p>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 mt-0.5">
              {doc.business.legalName || doc.business.name}
            </h1>
            {doc.business.tagline && (
              <p className="text-xs italic text-slate-500">{doc.business.tagline}</p>
            )}
            {doc.business.address && (
              <p className="text-xs text-slate-600 mt-1">{doc.business.address}</p>
            )}
            <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
              {doc.business.phone && <span>Telp: {doc.business.phone}</span>}
              {doc.business.website && (
                <a
                  href={doc.business.website.startsWith('http') ? doc.business.website : `https://${doc.business.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 font-semibold hover:underline"
                >
                  🌐 {doc.business.website}
                </a>
              )}
              {doc.business.instagram && <span>📸 {doc.business.instagram}</span>}
            </div>
          </div>
          <div className="self-start sm:self-center shrink-0">
            <span
              className={`inline-flex px-3 py-1.5 rounded-full text-xs font-extrabold tracking-wide ${banner.pillClass}`}
            >
              {banner.pillText}
            </span>
          </div>
        </header>

        {/* Status Keaslian Banner */}
        <section
          data-testid="verify-status-banner"
          className={`rounded-2xl border p-4 sm:p-5 space-y-1 ${banner.boxClass}`}
        >
          <h2 className="text-sm sm:text-base font-extrabold">{banner.title}</h2>
          <p className="text-xs sm:text-sm opacity-90 leading-relaxed">{banner.subtitle}</p>
        </section>

        {/* TAMPILAN KHUSUS KATALOG */}
        {isCatalog && doc.catalogDetail ? (
          <>
            {/* Informasi Katalog & Sales PIC */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500 font-medium">Judul Katalog</p>
                  <p className="font-extrabold text-slate-900 text-base mt-0.5">
                    {doc.catalogDetail.title}
                  </p>
                  {doc.catalogDetail.subtitle && (
                    <p className="text-xs text-slate-600 mt-0.5">
                      {doc.catalogDetail.subtitle}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-xs text-slate-500 font-medium">Jenis Katalog</p>
                  <p className="font-bold text-slate-900 mt-0.5">
                    {DOC_TYPE_LABELS[doc.documentType]}
                  </p>
                  {doc.catalogDetail.promoValidityLabel && (
                    <p className="text-xs font-semibold text-rose-600 mt-0.5">
                      📅 {doc.catalogDetail.promoValidityLabel}
                    </p>
                  )}
                </div>
              </div>

              {/* Kontak Sales PIC Resmi */}
              <div className="border-t border-slate-100 pt-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border">
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Sales PIC Resmi Perusahaan
                  </p>
                  <p className="text-sm font-extrabold text-slate-900 mt-0.5">
                    {doc.salesPic?.name || 'Kantor Pusat'}
                  </p>
                  {doc.salesPic?.phone && (
                    <p className="text-xs font-mono font-bold text-blue-700 mt-0.5">
                      WhatsApp / HP: {doc.salesPic.phone}
                    </p>
                  )}
                </div>
                <div>
                  {doc.salesPic?.isActive ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                      ✓ Sales Aktif
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
                      Nonaktif
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* Daftar Produk & Harga Resmi Server */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center justify-between">
                <span>Daftar Produk & Harga Terverifikasi</span>
                <span className="text-xs font-normal text-slate-500">
                  {doc.catalogDetail.products.length} Produk
                </span>
              </h3>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {doc.catalogDetail.products.map((p, idx) => (
                  <div
                    key={`${p.sku}-${idx}`}
                    className="p-3 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs"
                  >
                    <div>
                      {p.badgeText && (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-700 mr-1.5 uppercase">
                          {p.badgeText}
                        </span>
                      )}
                      <span className="font-bold text-slate-900 text-sm">{p.name}</span>
                      <div className="text-slate-500 font-mono text-[11px] mt-0.5">
                        SKU: {p.sku} • Satuan: {p.unit}
                      </div>
                    </div>

                    <div className="text-left sm:text-right">
                      {p.strikePrice ? (
                        <div className="text-xs text-slate-400 line-through">
                          {formatRupiah(p.strikePrice)}
                        </div>
                      ) : null}
                      <div className="text-sm font-extrabold text-rose-600 font-mono">
                        {formatRupiah(p.price)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {doc.catalogDetail.termsNote && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                  <p className="font-bold mb-0.5">Syarat & Ketentuan Promo:</p>
                  <p className="whitespace-pre-line">{doc.catalogDetail.termsNote}</p>
                </div>
              )}
            </section>
          </>
        ) : (
          /* TAMPILAN FAKTUR / ORDER / KWITANSI */
          <>
            {/* Identitas Dokumen & Pelanggan Tersamar */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500 font-medium">Jenis Dokumen</p>
                  <p className="font-bold text-slate-900 mt-0.5">
                    {DOC_TYPE_LABELS[doc.documentType]}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Nomor Dokumen</p>
                  <p className="font-mono font-bold text-slate-900 mt-0.5 break-all">
                    {doc.documentNumber}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Referensi Order</p>
                  <p className="font-mono font-semibold text-slate-800 mt-0.5">
                    {doc.orderNo}{' '}
                    {doc.orderStatus
                      ? `(${ORDER_STATUS_LABELS[doc.orderStatus] ?? doc.orderStatus})`
                      : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Tanggal Dokumen</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {formatDateId(doc.issueDate, 'long')}
                    {doc.dueDate ? ` • Jatuh Tempo: ${formatDateId(doc.dueDate, 'long')}` : ''}
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-1.5">
                <p className="text-xs text-slate-500 font-medium">
                  Identitas Pelanggan (Disamarkan untuk Privasi)
                </p>
                <p className="text-sm font-bold text-slate-900" data-testid="masked-customer-name">
                  {doc.customerName}
                </p>
                {doc.maskedAddress && (
                  <p className="text-xs text-slate-600" data-testid="masked-customer-address">
                    {doc.maskedAddress}
                  </p>
                )}
              </div>
            </section>

            {/* Ringkasan Nilai & Dana Terverifikasi */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Ringkasan Tagihan & Pembayaran Terverifikasi
              </h3>

              {doc.receiptDetail && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-emerald-900">
                      Nilai Pembayaran pada Kwitansi Ini
                    </p>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      Metode: {METHOD_LABELS[doc.receiptDetail.method] ?? doc.receiptDetail.method}
                      {doc.receiptDetail.invoiceNumber
                        ? ` • Ref Faktur: ${doc.receiptDetail.invoiceNumber}`
                        : ''}
                    </p>
                  </div>
                  <p className="font-mono text-base font-extrabold text-emerald-800">
                    {formatRupiah(doc.receiptDetail.amount)}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-500">Total Nilai Order</p>
                  <p className="font-mono font-bold text-slate-900 mt-1">
                    {formatRupiah(doc.amounts.grandTotal)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200">
                  <p className="text-xs text-emerald-700">Dana Diterima Perusahaan</p>
                  <p className="font-mono font-bold text-emerald-800 mt-1">
                    {formatRupiah(doc.amounts.verifiedPaidTotal)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-500">Sisa Tagihan Order</p>
                  <p className="font-mono font-bold text-slate-900 mt-1">
                    {formatRupiah(doc.amounts.remainingDue)}
                  </p>
                </div>
              </div>

              {doc.verifiedPayments.length > 0 && (
                <div className="pt-2 space-y-2">
                  <p className="text-xs font-semibold text-slate-600">
                    Riwayat Dana Masuk Terverifikasi:
                  </p>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {doc.verifiedPayments.map((p) => (
                      <div
                        key={p.id}
                        className="px-3.5 py-2.5 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs"
                      >
                        <div className="space-y-0.5">
                          <span className="font-mono font-bold text-slate-800">
                            {p.receiptNo || 'Kwitansi Terverifikasi'}
                          </span>
                          <span className="text-slate-500 ml-2">
                            {formatDateId(p.paidAt, 'long')} • {METHOD_LABELS[p.method] ?? p.method}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-emerald-700">
                          {formatRupiah(p.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {/* Rekening Resmi Perusahaan */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">
            Rekening Transfer Resmi Perusahaan
          </h3>
          <p className="text-xs text-slate-500">
            Periksa rekening transfer resmi di bawah ini sebelum melakukan transfer dana:
          </p>
          {doc.banks.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {doc.banks.map((b, idx) => (
                <div
                  key={`${b.bankName}-${b.accountNumber}-${idx}`}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-0.5"
                >
                  <p className="font-bold text-slate-900">{b.bankName}</p>
                  <p className="font-mono text-sm font-extrabold text-indigo-700 break-all">
                    {b.accountNumber}
                  </p>
                  <p className="text-slate-600">a.n. {b.accountHolder}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-600 leading-relaxed">
              {doc.authenticityStatus === 'CANCELLED_OR_VOID'
                ? 'Dokumen telah dibatalkan/void sehingga instruksi rekening dinonaktifkan.'
                : 'Rekening transfer resmi perusahaan akan terlampir saat Faktur resmi diterbitkan.'}
            </p>
          )}
        </section>

        {/* Klausul Sah Pembayaran & Anti-Fraud */}
        <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 text-xs text-amber-950 leading-relaxed">
          <p className="font-bold uppercase tracking-wide text-[11px] mb-1">
            Peringatan Keamanan Transaksi & Pembayaran
          </p>
          <p>
            {doc.legalNotice ||
              'DILARANG mentransfer dana ke rekening pribadi sales. Seluruh pembayaran tagihan hanya sah jika ditransfer langsung ke rekening bank resmi atas nama perusahaan yang tertera di atas.'}
          </p>
        </section>
      </div>
    </main>
  );
}
