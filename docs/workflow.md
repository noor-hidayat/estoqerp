# Workflow Save Transaksi — Estoq Frontend

> Alur simpan standar untuk semua dokumen transaksi (GRN, PO, Receiving, dll).
> Sederhana, seragam, dan mudah diikuti junior developer/agent.

## 1) Status

| Status | Arti | Form | Judul |
|---|---|---|---|
| `Not save` | Badge lokal — form kotor & belum disimpan (bukan status tersimpan) | Editable, sama seperti new page | Tetap judul new page |
| `Draft` | Sudah tersimpan, belum submit | Editable, tampilan sama persis seperti new page | `documentNo` (fallback `Name` bila tanpa documentNo, terakhir `formatId(id)`) |
| `Submitted` | Terkunci | Read-only | `documentNo` (fallback sama) |

## 2) Alur

1. **New page** → badge `Not save`, judul `New ...`, tombol `Save` di header.
2. **Klik Save** → validasi → simpan → status `Draft`. Form masih bisa diedit dan tampilan
   masih sama seperti pas new page — yang berubah hanya judul (new page → documentNo,
   fallback ke Name bila dokumen tidak punya documentNo).
3. **Ada perubahan di dokumen** → status berubah jadi `Not save` lagi → tombol `Submit`
   hilang dan hanya ada tombol `Save` → wajib save ulang → `Draft` lagi.
   Saat badge `Draft` (bersih, tanpa perubahan) → hanya ada tombol `Submit` (tombol `Save` hilang).
4. **Klik Submit** (hanya muncul saat badge `Draft`) → status `Submitted`.
5. **Saat `Submitted`** → fitur `Print`, menu `...`, `Create` baru muncul — dan hanya yang
   diaktifkan di konfigurasi page tersebut (lihat §3 `DOC_ACTIONS`).
   Menu `...` (ikon vertikal) berisi `Cancel` (status → `Canceled`, dokumen terkunci read-only)
   dan `Delete`. Saat `Not save` / `Draft` → semua fitur itu disembunyikan.

## 3) Aturan Implementasi

- `Not save` bukan status dokumen tersimpan — melainkan badge lokal dari perbandingan dirty
  (snapshot form saat load/save sukses vs isi form saat ini). Contoh yang sudah ada:
  detail PO (`Badge tone="destructive">Not save` saat draft + dirty) dan Company Settings.
- Dirty tracking: simpan snapshot `JSON.stringify(form)` tiap load/save sukses; bandingkan tiap render.
- Tombol `Save` / `Submit` di header `FormPage` actions, `size="sm"`, teks saja tanpa ikon
  (kecuali tombol ikon murni seperti `...` / print yang memang tanpa teks).
- `Submit` wajib konfirmasi dulu (ikut pola `toast.custom` Sonner No/Yes di `design.md` §4),
  dan cegah submit saat form masih dirty (minta Save dulu).
- Judul: new page = `New {Modul}`; setelah save = `{documentNo ?? name ?? formatId(id)}`.
- `Print` / menu `...` / `Create` dirender kondisional hanya saat `status === "SUBMITTED"`
  DAN diaktifkan di konfigurasi page-nya. Setiap detail page mendefinisikan di atas file:
  `const DOC_ACTIONS = { print: true, menu: true, create: false } as const`
  — set `false` untuk tombol yang tidak dibutuhkan halaman tersebut (mis. page tanpa
  tombol Create). Jangan render tombol yang dimatikan konfigurasinya.
- Validasi & error via `useErrorToast` + `toast.error`, bukan `alert` (ikut `design.md` §7).
- Shortcut `Ctrl+S` / `Cmd+S` trigger `Save` (ikut `design.md` §4).
