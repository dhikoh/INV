# Matriks M5: Status dan Transisi (State Machine & Transition Matrix)

Audit komprehensif atas seluruh state machine sistem OmniCat: siapa aktor yang berhak mengubah, status awal dan target, efek samping terhadap stok/keuangan/audit log/notifikasi, serta verifikasi ketiadaan state buntu ilegal.

---

## 1. State Machine Pesanan (`OrderStatus`)

Diagram Rujukan: BLUEPRINT.md Seksi 6

| Status Awal | Aksi Bisnis | Status Target | Aktor yang Berwenang | Efek Samping Transisi (Side Effects) | Jalan Keluar Selanjutnya |
|---|---|---|---|---|---|
| `[*]` (Awal) | Buat Draf Pesanan | `DRAFT` | Super Admin, Sales | Snapshot harga dasar/paten, validasi stok (jika no minus). | Ajukan (`submit`), Batal (`cancel`), Hapus draf. |
| `DRAFT` | Ajukan Pesanan | `PENDING_APPROVAL` | Super Admin, Sales | Terbitkan Invoice pertama berstatus `PENDING_APPROVAL`, picu notif Telegram ke Super Admin. | Tarik (`withdraw`), Setujui (`approve`), Tolak (`reject`), Batal. |
| `PENDING_APPROVAL` | Tarik Pengajuan | `DRAFT` | Super Admin, Sales | Invoice `WITHDRAWN`, batalkan antrean persetujuan. | Sunting draf, Ajukan ulang. |
| `PENDING_APPROVAL` | Tolak Pesanan | `REVISION_REQUIRED` | Super Admin | Catat alasan penolakan (min 5 char), Invoice `REJECTED`, notif Telegram ke Sales. | Sunting draf, Ajukan ulang ke `PENDING_APPROVAL`. |
| `REVISION_REQUIRED` | Ajukan Ulang | `PENDING_APPROVAL` | Super Admin, Sales | Buat invoice revisi baru, picu notifikasi approval baru. | Setujui, Tolak kembali, Tarik. |
| `PENDING_APPROVAL` | Setujui (Ada Syarat DP) | `AWAITING_DP` | Super Admin | Alokasi nomor `orderNo` sequential atomik, reservasi stok barang, terbitkan Invoice DP `APPROVED`. | Bayar DP -> `IN_PROCESS`, Void invoice -> `CANCELLED`. |
| `PENDING_APPROVAL` | Setujui (Tanpa DP / Lunas) | `IN_PROCESS` | Super Admin | Alokasi nomor `orderNo` atomik, reservasi stok barang, siap dikirim. | Kirim barang, Tagih pelunasan -> `FINAL_PENDING_APPROVAL`. |
| `AWAITING_DP` | Verifikasi Pembayaran DP | `IN_PROCESS` | Super Admin | Rekalkulasi `paidTotal`, ubah status order menjadi dalam proses pemenuhan. | Pengiriman surat jalan, Tagih pelunasan. |
| `IN_PROCESS` | Tagih Pelunasan | `FINAL_PENDING_APPROVAL` | Super Admin, Sales | Terbitkan Faktur FINAL `PENDING_APPROVAL`, hitung ulang sisa tagihan & ongkir aktual. | Setujui faktur final, Tolak faktur final. |
| `FINAL_PENDING_APPROVAL`| Setujui Faktur Final | `AWAITING_FINAL_PAYMENT` | Super Admin | Alokasi nomor faktur pelunasan resmi (`orderNo-LNS`), kirim faktur ke pelanggan. | Verifikasi pelunasan -> `COMPLETED`. |
| `AWAITING_FINAL_PAYMENT`| Verifikasi Pelunasan | `COMPLETED` | Super Admin | Rekalkulasi `paidTotal`, evaluasi komisi sales (`EARNED`), jadwalkan reminder repeat order. | **Selesai (Terminal State Resmi)** |
| Status Aktif Apa Pun | Pembatalan / Void | `CANCELLED` | Super Admin | Lepas seluruh reservasi stok (`reservedQty`), void invoice aktif, rollback status komisi. | **Terminal State (Batal)** |

---

## 2. State Machine Faktur Penjualan (`InvoiceStatus`)

| Status Awal | Aksi Bisnis | Status Target | Aktor | Efek Samping |
|---|---|---|---|---|
| `[*]` | Order diajukan | `PENDING_APPROVAL` | Sales / Admin | Muncul di antrean `/approvals`, kirim notif Telegram ke Super Admin. |
| `PENDING_APPROVAL` | Disetujui | `APPROVED` | Super Admin | Alokasi nomor faktur (`number`), invoice dapat dicetak PDF resmi. |
| `PENDING_APPROVAL` | Ditolak | `REJECTED` | Super Admin | Kembalikan order ke revisi, wajib simpan alasan reject. |
| `PENDING_APPROVAL` | Ditarik | `WITHDRAWN` | Sales / Admin | Invoice non-aktif, order kembali ke draft. |
| `APPROVED` | Dibatalkan | `VOID` | Super Admin | Lepas reservasi stok (bila DP belum kirim), wajib alasan void min 5 karakter, audit log `INVOICE_VOID`. |

---

## 3. State Machine Pembayaran (`PaymentStatus`)

| Status Awal | Aksi Bisnis | Status Target | Aktor | Efek Samping |
|---|---|---|---|---|
| `[*]` | Input Bukti Transfer | `PENDING_VERIFICATION` | Sales / Admin | Simpan bukti bayar di storage, masuk antrean `/payments`. |
| `PENDING_VERIFICATION` | Verifikasi Pembayaran | `VERIFIED` | Super Admin | Rekalkulasi `Order.paidTotal` & `Invoice.paidAmount` secara atomik, transisi status order jika lunas. |
| `PENDING_VERIFICATION` | Tolak Bukti Bayar | `REJECTED` | Super Admin | Simpan alasan penolakan, notifikasi penolakan ke sales. |
| `VERIFIED` | Batalkan Pembayaran | `VOID` | Super Admin | Rekalkulasi ulang `paidTotal`, kembalikan status order bila sebelumnya lunas, audit log `PAYMENT_VOID`. |

---

## 4. State Machine Pengiriman Fisik (`ShipStatus`)

| Status Awal | Aksi Bisnis | Status Target | Aktor | Efek Samping |
|---|---|---|---|---|
| `[*]` (Order approved) | Draf Pengiriman | `PREPARING` | Admin, Sales | Konfigurasi armada (`OWN_FLEET` / `EXPEDITION`), resi/nomor plat. |
| `PREPARING` | Berangkatkan Kiriman | `SHIPPED` | Admin, Sales | Alokasi nomor Surat Jalan (`SJ`), potong stok fisik keluar (`SALE_SHIPMENT`), cetak Surat Jalan PDF aktif. |
| `SHIPPED` | Konfirmasi Sampai | `DELIVERED` | Admin, Sales | Catat waktu penerimaan, jika pelunasan sudah lunas maka picu status order `COMPLETED`. |

---

## 5. State Machine Pengadaan / Purchase Order (`PoStatus`)

| Status Awal | Aksi Bisnis | Status Target | Aktor | Efek Samping |
|---|---|---|---|---|
| `[*]` | Buat PO | `DRAFT` | Super Admin | Hitung estimasi biaya beli produk ke vendor. |
| `DRAFT` | Terbitkan PO | `ORDERED` | Super Admin | Alokasi nomor atomik `poNo` sequential, catat hutang vendor berjalan. |
| `ORDERED` | Terima Sebagian | `PARTIAL_RECEIVED` | Super Admin | Tambah stok fisik (`PO_RECEIPT`), opsi perbarui HPP produk master. |
| `ORDERED` / `PARTIAL` | Terima Penuh | `RECEIVED` | Super Admin | Seluruh kuantitas PO diterima, mutasi stok fisik selesai. |
| `ORDERED` (Belum terima) | Batalkan PO | `CANCELLED` | Super Admin | Batalkan PO, kurangi catatan hutang vendor (ditolak jika sudah ada penerimaan). |

---

## 6. State Machine Nota Kredit / Retur (`CreditNoteStatus`)

| Status Awal | Aksi Bisnis | Status Target | Aktor | Efek Samping |
|---|---|---|---|---|
| `[*]` | Terbitkan Retur | `ISSUED` | Admin, Sales | Nomor `CN`, multi-settlement: potong piutang (OFFSET), tambah saldo deposit pelanggan (CUSTOMER_CREDIT), atau kas keluar (REFUND). Restock fisik barang (`RETURN_RESTOCK`). |
| `ISSUED` | Batalkan Retur | `VOID` | Super Admin | Rollback settlement (kembalikan piutang/kurangi kredit deposit), mutasi fisik keluar pembatalan retur (`VOID_REVERSAL`), audit log. |

---

## 7. State Machine Komisi Sales (`CommissionStatus`)

| Status Awal | Aksi Bisnis | Status Target | Aktor | Efek Samping |
|---|---|---|---|---|
| `[*]` (Order completed) | Evaluasi Otomatis | `EARNED` | Sistem (Worker/Event) | Nilai komisi dihitung dari margin/omzet berdasarkan tier aktif bulan berjalan. |
| `EARNED` | Bayar Komisi | `PAID` | Super Admin | Kunci rekalkulasi komisi, catat catatan pembayaran pemilik. |
| `EARNED` / `PAID` | Order dibatalkan pasca selesai | `REVERSED` | Super Admin | Tanda `needsReturn = true` pada laporan kinerja sales untuk komisi yang sudah terlanjur dibayar (`PAID`). |

---

## 8. Verifikasi Ketiadaan State Buntu (Dead-End Verification)

- **Order**: Seluruh status aktif memiliki jalan keluar yang valid menuju status selanjutnya atau pembatalan (`CANCELLED`).
- **Invoice**: `REJECTED` dan `WITHDRAWN` dapat dibuatkan faktur pengganti (revisi) saat order diajukan ulang.
- **Payment**: `REJECTED` dan `VOID` memungkinkan input bukti transfer baru oleh Sales.
- **CreditNote**: Tidak ada siklus buntu; `VOID` mengembalikan state keuangan dan stok ke kondisi sebelum nota kredit diterbitkan.
