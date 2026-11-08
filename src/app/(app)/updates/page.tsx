'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Plus,
  Send,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Eye,
  FileEdit,
  Loader2,
  Calendar,
  Clock,
} from 'lucide-react';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { SafeMarkdown } from '@/components/ui/SafeMarkdown';

interface ReleaseNote {
  id: string;
  version: string;
  title: string;
  bodyMarkdown: string;
  createdById: string;
  publishedAt: string | null;
  broadcastAt: string | null;
  createdAt: string;
}

function formatWibDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(d);
}

export default function UpdatesPage() {
  const [userRole, setUserRole] = useState<'SUPERADMIN' | 'SALES' | null>(null);
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal Tambah / Edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<ReleaseNote | null>(null);
  const [version, setVersion] = useState('');
  const [title, setTitle] = useState('');
  const [bodyMarkdown, setBodyMarkdown] = useState('');
  const [isPublishNow, setIsPublishNow] = useState(false);
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Modal Terbitkan
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [noteToPublish, setNoteToPublish] = useState<ReleaseNote | null>(null);
  const [broadcastTelegram, setBroadcastTelegram] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Modal Hapus
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<ReleaseNote | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Tandai catatan sebagai sudah dilihat
      fetch('/api/v1/updates/mark-seen', { method: 'POST' }).catch(() => {});

      const [authRes, updatesRes] = await Promise.all([
        fetch('/api/v1/auth/me'),
        fetch('/api/v1/updates'),
      ]);

      if (authRes.ok) {
        const authData = await authRes.json();
        if (authData.ok && authData.data?.user?.role) {
          setUserRole(authData.data.user.role);
        }
      }

      if (!updatesRes.ok) {
        throw new Error('Gagal memuat catatan pembaruan');
      }

      const updatesData = await updatesRes.json();
      if (updatesData.ok && Array.isArray(updatesData.data)) {
        setNotes(updatesData.data);
      } else {
        throw new Error(updatesData.error?.message || 'Data tidak valid');
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Terjadi kesalahan sistem';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isSuperAdmin = userRole === 'SUPERADMIN';

  // Buka modal tambah
  const handleOpenCreateModal = () => {
    setEditingNote(null);
    setVersion('');
    setTitle('');
    setBodyMarkdown('');
    setIsPublishNow(false);
    setActiveTab('write');
    setFormError(null);
    setModalOpen(true);
  };

  // Buka modal edit
  const handleOpenEditModal = (note: ReleaseNote) => {
    setEditingNote(note);
    setVersion(note.version);
    setTitle(note.title);
    setBodyMarkdown(note.bodyMarkdown);
    setIsPublishNow(false);
    setActiveTab('write');
    setFormError(null);
    setModalOpen(true);
  };

  // Simpan tambah / edit
  const handleSubmitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!version.trim()) {
      setFormError('Nomor versi wajib diisi (misal: v0.2.0)');
      return;
    }
    if (!title.trim()) {
      setFormError('Judul rilis wajib diisi');
      return;
    }
    if (!bodyMarkdown.trim()) {
      setFormError('Isi catatan pembaruan markdown wajib diisi');
      return;
    }

    try {
      setSaving(true);

      if (editingNote) {
        // PATCH
        const res = await fetch(`/api/v1/updates/${editingNote.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: version.trim(),
            title: title.trim(),
            bodyMarkdown,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error?.message || 'Gagal mengubah catatan');
        }
      } else {
        // POST
        const res = await fetch('/api/v1/updates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: version.trim(),
            title: title.trim(),
            bodyMarkdown,
            isPublishNow,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error?.message || 'Gagal membuat catatan');
        }
      }

      setModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : 'Terjadi kesalahan sistem'
      );
    } finally {
      setSaving(false);
    }
  };

  // Buka modal publish
  const handleOpenPublishModal = (note: ReleaseNote) => {
    setNoteToPublish(note);
    setBroadcastTelegram(false);
    setPublishModalOpen(true);
  };

  // Eksekusi publish
  const handleConfirmPublish = async () => {
    if (!noteToPublish) return;

    try {
      setPublishing(true);
      const res = await fetch(`/api/v1/updates/${noteToPublish.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broadcast: broadcastTelegram,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error?.message || 'Gagal menerbitkan catatan');
      }

      setPublishModalOpen(false);
      setNoteToPublish(null);
      await loadData();
    } catch (err: unknown) {
      alert(
        err instanceof Error ? err.message : 'Gagal menerbitkan catatan rilis'
      );
    } finally {
      setPublishing(false);
    }
  };

  // Buka modal hapus
  const handleOpenDeleteModal = (note: ReleaseNote) => {
    setNoteToDelete(note);
    setDeleteModalOpen(true);
  };

  // Eksekusi hapus
  const handleConfirmDelete = async () => {
    if (!noteToDelete) return;

    try {
      setDeleting(true);
      const res = await fetch(`/api/v1/updates/${noteToDelete.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error?.message || 'Gagal menghapus catatan');
      }

      setDeleteModalOpen(false);
      setNoteToDelete(null);
      await loadData();
    } catch (err: unknown) {
      alert(
        err instanceof Error ? err.message : 'Gagal menghapus catatan rilis'
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Catatan Pembaruan
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Riwayat fitur baru, penyempurnaan alur, dan perbaikan aplikasi
            OmniCat
          </p>
        </div>

        {isSuperAdmin && (
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-colors shadow-sm min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Catatan Rilis</span>
          </button>
        )}
      </div>

      {/* Konten Utama */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-red-200 p-6 shadow-sm">
          <ErrorState
            title="Gagal Memuat Catatan Pembaruan"
            message={error}
            onRetry={loadData}
          />
        </div>
      ) : notes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
          <EmptyState
            title="Belum Ada Catatan Pembaruan"
            description="Belum ada riwayat rilis atau pembaruan yang dipublikasikan saat ini."
          />
        </div>
      ) : (
        <div className="space-y-6">
          {notes.map((note) => {
            const isDraft = !note.publishedAt;
            return (
              <article
                key={note.id}
                className={`bg-white rounded-2xl border shadow-sm transition-all overflow-hidden ${
                  isDraft
                    ? 'border-amber-300 ring-1 ring-amber-100'
                    : 'border-slate-200'
                }`}
              >
                {/* Header Catatan Rilis */}
                <div className="p-4 sm:p-6 pb-3 sm:pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-black px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                        {note.version}
                      </span>

                      {isDraft ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          <Clock className="w-3 h-3" />
                          <span>Draf (Belum Terbit)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Terbit {formatWibDate(note.publishedAt)}</span>
                        </span>
                      )}

                      {note.broadcastAt && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                          <Send className="w-3 h-3" />
                          <span>Broadcast Telegram</span>
                        </span>
                      )}
                    </div>

                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">
                      {note.title}
                    </h2>

                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        Dibuat {formatWibDate(note.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Tombol Aksi Khusus Super Admin */}
                  {isSuperAdmin && (
                    <div className="flex items-center gap-2 self-end sm:self-start shrink-0 pt-2 sm:pt-0">
                      {isDraft && (
                        <button
                          type="button"
                          onClick={() => handleOpenPublishModal(note)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-lg transition-colors shadow-sm min-h-[36px]"
                          title="Terbitkan Rilis Ini"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Terbitkan</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(note)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-lg transition-colors min-h-[36px]"
                        title="Ubah Catatan Rilis"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Ubah</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenDeleteModal(note)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-medium text-xs rounded-lg transition-colors min-h-[36px]"
                        title="Hapus Catatan Rilis"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Konten Markdown Aman (STRICT NO dangerouslySetInnerHTML) */}
                <div className="p-4 sm:p-6 text-slate-800 leading-relaxed bg-white">
                  <SafeMarkdown content={note.bodyMarkdown} />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal Tambah / Ubah Catatan Pembaruan */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-base sm:text-lg text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <span>
                  {editingNote
                    ? 'Ubah Catatan Pembaruan'
                    : 'Tambah Catatan Pembaruan Baru'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitNote} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs sm:text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label
                    htmlFor="versionInput"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1"
                  >
                    Versi Rilis *
                  </label>
                  <input
                    id="versionInput"
                    type="text"
                    required
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="contoh: v0.2.0"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white min-h-[44px] font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="titleInput"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1"
                  >
                    Judul Rilis *
                  </label>
                  <input
                    id="titleInput"
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="contoh: Rilis Fase 1: Manajemen Produk & Vendor"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white min-h-[44px]"
                  />
                </div>
              </div>

              {/* Tab Editor Markdown vs Pratinjau */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="bodyMarkdownInput"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wider"
                  >
                    Isi Catatan Markdown *
                  </label>
                  <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setActiveTab('write')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                        activeTab === 'write'
                          ? 'bg-white text-blue-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <FileEdit className="w-3.5 h-3.5" />
                      <span>Tulis</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('preview')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                        activeTab === 'preview'
                          ? 'bg-white text-blue-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Pratinjau</span>
                    </button>
                  </div>
                </div>

                {activeTab === 'write' ? (
                  <textarea
                    id="bodyMarkdownInput"
                    required
                    rows={9}
                    value={bodyMarkdown}
                    onChange={(e) => setBodyMarkdown(e.target.value)}
                    placeholder="Tulis catatan rilis dalam format markdown (mendukung # heading, - list, `kode`, **tebal**, [tautan](https://...))"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white leading-relaxed"
                  />
                ) : (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 min-h-[220px] max-h-[360px] overflow-y-auto">
                    {bodyMarkdown.trim() ? (
                      <SafeMarkdown content={bodyMarkdown} />
                    ) : (
                      <span className="text-xs text-slate-400 italic">
                        Belum ada konten markdown untuk dipratinjau.
                      </span>
                    )}
                  </div>
                )}
              </div>

              {!editingNote && (
                <label className="flex items-center gap-2 p-3 bg-blue-50/60 border border-blue-200 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPublishNow}
                    onChange={(e) => setIsPublishNow(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-xs sm:text-sm font-semibold text-slate-800">
                    Langsung terbitkan sekarang (dapat dibaca oleh semua sales)
                  </span>
                </label>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors min-h-[44px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 min-h-[44px]"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>
                      {editingNote ? 'Simpan Perubahan' : 'Buat Catatan'}
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Terbitkan Draf Rilis */}
      {publishModalOpen && noteToPublish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-emerald-600">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  Terbitkan Catatan Rilis?
                </h3>
                <span className="text-xs text-slate-500 font-mono">
                  {noteToPublish.version} - {noteToPublish.title}
                </span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Catatan pembaruan ini akan langsung terlihat oleh seluruh staf
              Sales dan memunculkan badge &quot;Baru&quot; di menu navigasi
              mereka.
            </p>

            <label className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={broadcastTelegram}
                onChange={(e) => setBroadcastTelegram(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
              />
              <span className="text-xs sm:text-sm font-medium text-slate-700">
                Kirim broadcast ke akun Telegram yang terhubung
              </span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPublishModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors min-h-[44px]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={publishing}
                onClick={handleConfirmPublish}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 min-h-[44px]"
              >
                {publishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menerbitkan...</span>
                  </>
                ) : (
                  <span>Terbitkan Sekarang</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Hapus Catatan Rilis */}
      {deleteModalOpen && noteToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  Hapus Catatan Rilis?
                </h3>
                <span className="text-xs text-slate-500 font-mono">
                  {noteToDelete.version} - {noteToDelete.title}
                </span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Tindakan ini tidak dapat dibatalkan. Catatan rilis ini akan
              dihapus dari basis data.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors min-h-[44px]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 min-h-[44px]"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <span>Ya, Hapus Catatan</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
