'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Download,
  Upload,
  FileArchive,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Database,
  Building,
} from 'lucide-react';
import { ImportReport } from '@/lib/transfer/import';

interface DataTransferCardProps {
  businessId: string;
  businessCode: string;
}

export default function DataTransferCard({
  businessId,
  businessCode,
}: DataTransferCardProps) {
  const router = useRouter();

  // Ekspor state
  const [includeUploads, setIncludeUploads] = useState(true);

  // Impor state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string>(''); // Untuk deteksi pergantian berkas
  const [inspecting, setInspecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [inspectReport, setInspectReport] = useState<ImportReport | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle pilih berkas ZIP
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    // Reset hasil periksa bila berkas diubah
    setInspectReport(null);
    setImportSuccess(null);
    setErrorMessage(null);
    if (file) {
      setFileHash(`${file.name}-${file.size}-${file.lastModified}`);
    } else {
      setFileHash('');
    }
  };

  // Unduh Ekspor Usaha
  const handleExportBusiness = () => {
    const query = includeUploads ? '' : '?tanpaBerkas=1';
    window.location.href = `/api/v1/businesses/${businessId}/export${query}`;
  };

  // Unduh Ekspor Seluruh Sistem
  const handleExportSystem = () => {
    const query = includeUploads ? '' : '?tanpaBerkas=1';
    window.location.href = `/api/v1/data-transfer/export${query}`;
  };

  // Periksa Dulu (Dry-Run = 1)
  const handleDryRunInspect = async () => {
    if (!selectedFile) return;

    setInspecting(true);
    setErrorMessage(null);
    setImportSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/v1/data-transfer/import?dryRun=1', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (json.data) {
        setInspectReport(json.data as ImportReport);
      } else if (json.error) {
        setErrorMessage(json.error.message || 'Gagal memeriksa berkas ZIP.');
      }
    } catch {
      setErrorMessage('Terjadi gangguan jaringan saat memeriksa berkas.');
    } finally {
      setInspecting(false);
    }
  };

  // Eksekusi Impor Sungguhan
  const handleExecuteImport = async () => {
    if (!selectedFile || !inspectReport || !inspectReport.ok) return;

    const confirmed = window.confirm(
      'Impor akan menambahkan unit usaha beserta seluruh riwayat transaksi dan data master ke database. Proses ini tidak bisa dibatalkan. Lanjutkan?'
    );
    if (!confirmed) return;

    setImporting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/v1/data-transfer/import', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (json.data && json.data.ok) {
        const report = json.data as ImportReport;
        const totalRows = Object.values(report.counts).reduce((a, b) => a + b, 0);
        setImportSuccess(
          `Impor berhasil! ${totalRows} baris data dan ${report.uploads.written} berkas upload berhasil dimasukkan ke sistem.`
        );
        setInspectReport(null);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        router.refresh();
      } else {
        const report = (json.data as ImportReport) || null;
        if (report && report.errors.length > 0) {
          setInspectReport(report);
        } else {
          setErrorMessage(json.error?.message || 'Proses impor gagal dijalankan.');
        }
      }
    } catch {
      setErrorMessage('Terjadi gangguan jaringan saat mengimpor berkas.');
    } finally {
      setImporting(false);
    }
  };

  const isInspectPassed =
    inspectReport &&
    inspectReport.ok &&
    fileHash === `${selectedFile?.name}-${selectedFile?.size}-${selectedFile?.lastModified}`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-8">
      {/* Header */}
      <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
            <FileArchive className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">
              Portabilitas Data (Ekspor & Impor ZIP)
            </h3>
            <p className="text-sm text-gray-500">
              Cadangkan atau pindahkan seluruh data usaha beserta berkas upload dalam satu berkas portabel.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Catatan Keamanan */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3 text-sm text-amber-800">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-900">Perlindungan Kerahasiaan Data</p>
            <p className="mt-0.5 text-amber-700">
              Berkas ZIP ekspor berisi data rahasia seperti HPP, hash kata sandi, dan data pelanggan.
              Simpan berkas unduhan di media penyimpanan yang aman dan terenkripsi.
            </p>
          </div>
        </div>

        {/* Seksi 1: Ekspor Data */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <Download className="w-4 h-4 text-indigo-600" />
            1. Ekspor Data ke ZIP
          </h4>

          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer font-medium select-none">
                <input
                  type="checkbox"
                  checked={includeUploads}
                  onChange={(e) => setIncludeUploads(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                Sertakan berkas gambar & bukti bayar (uploads)
              </label>
              <p className="text-xs text-gray-500 ml-6">
                Bila dimatikan, hanya data database (.ndjson) yang diekspor (ukuran lebih hemat dan cepat).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleExportBusiness}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors shadow-sm"
              >
                <Building className="w-4 h-4 text-gray-500" />
                Ekspor Usaha Ini ({businessCode})
              </button>

              <button
                type="button"
                onClick={handleExportSystem}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-medium text-white hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Database className="w-4 h-4" />
                Ekspor Seluruh Sistem (ZIP)
              </button>
            </div>
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* Seksi 2: Impor Data Usaha */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <Upload className="w-4 h-4 text-emerald-600" />
            2. Impor Data Usaha ke Sistem
          </h4>
          <p className="text-sm text-gray-600">
            Unggah berkas ZIP untuk menambahkan unit usaha baru beserta riwayat transaksi, produk, dan berkasnya ke sistem ini.
          </p>

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer border border-gray-300 rounded-lg p-1"
              />

              <button
                type="button"
                onClick={handleDryRunInspect}
                disabled={!selectedFile || inspecting || importing}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-900 rounded-lg text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm whitespace-nowrap"
              >
                {inspecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Memeriksa...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Periksa Dulu (Simulasi)
                  </>
                )}
              </button>
            </div>

            {/* Notifikasi Error Umum */}
            {errorMessage && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3 text-sm text-red-800">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p>{errorMessage}</p>
              </div>
            )}

            {/* Notifikasi Sukses Impor */}
            {importSuccess && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex gap-3 text-sm text-emerald-800">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <p className="font-medium">{importSuccess}</p>
              </div>
            )}

            {/* Hasil Pemeriksaan / Dry-Run Report */}
            {inspectReport && (
              <div className="border border-gray-200 rounded-lg p-5 bg-gray-50/50 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                  <div className="flex items-center gap-2">
                    {inspectReport.ok ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Pemeriksaan Lulus (Siap Diimpor)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Pemeriksaan Gagal
                      </span>
                    )}
                    <span className="text-xs text-gray-500 font-mono">
                      Cakupan: {inspectReport.scope.toUpperCase()}
                    </span>
                  </div>

                  {inspectReport.manifest && (
                    <span className="text-xs text-gray-500">
                      Waktu Ekspor:{' '}
                      {new Date(inspectReport.manifest.exportedAt).toLocaleString('id-ID')}
                    </span>
                  )}
                </div>

                {/* Ringkasan Metadata Manifest */}
                {inspectReport.manifest && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-gray-600 bg-white p-3 rounded border border-gray-200">
                    <div>
                      <span className="text-gray-400 block">Kode Usaha:</span>
                      <span className="font-semibold text-gray-800">
                        {inspectReport.manifest.businessCodes.join(', ') || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Versi Aplikasi:</span>
                      <span className="font-semibold text-gray-800">
                        v{inspectReport.manifest.appVersion}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Berkas Upload:</span>
                      <span className="font-semibold text-gray-800">
                        {inspectReport.uploads.files} berkas
                      </span>
                    </div>
                  </div>
                )}

                {/* Tabel Jumlah Data per Model */}
                {Object.keys(inspectReport.counts).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Ringkasan Data yang Akan Dimasukkan:
                    </p>
                    <div className="max-h-48 overflow-y-auto bg-white rounded border border-gray-200 divide-y divide-gray-100 text-xs">
                      {Object.entries(inspectReport.counts).map(([model, count]) => (
                        <div key={model} className="flex justify-between px-3 py-1.5 hover:bg-gray-50">
                          <span className="text-gray-700 font-mono">{model}</span>
                          <span className="font-semibold text-gray-900">{count} baris</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Daftar Peringatan (Kuning) */}
                {inspectReport.warnings.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      Peringatan ({inspectReport.warnings.length}):
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 text-amber-800">
                      {inspectReport.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Daftar Error (Merah) */}
                {inspectReport.errors.length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-900 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                      Error yang Ditemukan ({inspectReport.errors.length}):
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 text-red-800">
                      {inspectReport.errors.map((e, idx) => (
                        <li key={idx}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Tombol Impor Sekarang (Hanya aktif bila pemeriksaan lulus) */}
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleExecuteImport}
                    disabled={!isInspectPassed || importing}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 rounded-lg text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Mengimpor Data...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Impor Sekarang
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

