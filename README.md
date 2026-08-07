# StockOpname

Aplikasi web stock opname (penghitungan stok fisik) multi-cabang & multi-gudang dengan
**konfigurasi format barcode berbasis segmen yang dinamis** — tanpa perlu perubahan kode program.

Dibangun dengan Next.js (App Router) + TypeScript + Tailwind CSS. Tahap ini berfokus pada
**frontend lengkap** dengan mock data persisten di `localStorage`, siap dihubungkan ke backend
(Prisma/PostgreSQL) pada tahap berikutnya.

## Menjalankan

```bash
npm install
npm run dev
```

Buka `http://localhost:3000` — Anda akan diarahkan ke halaman login. Pilih salah satu akun demo:

| Akun | Role |
|---|---|
| Raka Wibowo | Admin |
| Nadia Putri | Supervisor (Approver) |
| Dimas Prasetyo / Sari Dewi / Fajar Nugroho | Staff Gudang |

> Mode demo: semua perubahan tersimpan di `localStorage` browser. Untuk reset data,
> jalankan `localStorage.removeItem("stockopname-db-v1")` di console lalu refresh.

## Modul

- **Dashboard** — ringkasan aktivitas, project aktif, progress & log scan terakhir
- **Stock Opname**
  - Projects (list, buat project, pilih mode banding vs recount)
  - Scan Session (input keyboard-scanner + kamera HP, qty otomatis/manual)
  - Variance Review (selisih stok sistem vs hasil fisik)
  - Approval (review & finalisasi oleh supervisor)
- **Setup** (Admin)
  - Format Barcode — editor segmen visual + uji parsing langsung
  - Item / Produk (dengan stok sistem per gudang)
  - Lokasi Gudang, Cabang & Gudang, User & Role
- **Laporan** — per project, variance, per lokasi, summary, riwayat scan; export **Excel (.xlsx)** & **PDF**

## Struktur Kunci

```
src/
  app/                  # Routes (App Router)
  components/           # UI primitives, app shell, barcode editor & camera
  lib/
    barcode/parser.ts   # Mesin parsing barcode berbasis segmen
    mock/store.ts       # Mock DB + seed + persistensi localStorage
    compute.ts          # Variance, progress, status helpers
    export.ts           # Export XLSX/PDF
  types/                # Domain types
```

## Barcode Format

Format didefinisikan sebagai daftar segmen dengan posisi start–end digit, contoh:
`1–2 = kode kategori`, `3–8 = tanggal (YYMMDD)`, `9–13 = kode item`. Bisa menyimpan
banyak format sekaligus; format aktif dipakai saat parsing. Toggle **Qty per Format**:
aktif = qty otomatis (1 per scan), nonaktif = qty diinput manual tiap scan (mis. per pallet).

## Perintah

```bash
npm run dev      # development server
npm run build    # production build
npm run lint     # eslint
```
