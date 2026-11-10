# Dokumen Masalah dan Pertanyaan Terbuka (Open Questions)

Dokumen ini mencatat hal-hal yang belum jelas, ambigu, atau membutuhkan konfirmasi dari pemilik bisnis sesuai Aturan Emas (bagian 1.3).

| No  | Tanggal    | Bagian / Tugas   | Pertanyaan / Isu                                                   | Dampak                       | Status | Keputusan Pemilik                                                          |
| --- | ---------- | ---------------- | ------------------------------------------------------------------ | ---------------------------- | ------ | -------------------------------------------------------------------------- |
| 1   | 2026-11-07 | T0.1 / Workspace | Penempatan root repo (apakah di root workspace atau subfolder zip) | Struktur direktori dan build | CLOSED | Disetujui: repo dipindahkan langsung ke root workspace `D:\Data BentoCat`. |
| 2   | 2026-11-10 | Data Transfer Fase 0 | Kolom counter: prompt menyebut `DocumentCounter.type`, kode aktual memakai `DocumentCounter.scope`. | Nama kolom pada validasi & registry | RESOLVED | Mengikuti kode aktual: kolom `scope` dengan nilai `ORDER_SEQ`, `PO_SEQ`, `CREDIT_NOTE_SEQ`. |
| 3   | 2026-11-10 | Data Transfer Fase 0 | `Shipment.deliveryNo` di schema saat ini berstatus `@unique` global (bukan per usaha). | Potensi bentrok saat impor mode usaha jika nomor surat jalan sama antar usaha | OPEN | Usulan: validasi uniqueness global pada `deliveryNo` di pre-check impor mode usaha. |
