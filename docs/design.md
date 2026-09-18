# Design System — Estoq Frontend

> Sumber kebenaran UI/UX untuk semua route `frontend/src/app/app/...` (Vite SPA, bukan Next.js). Agent baru wajib ikut file ini agar fitur baru tetap mirip. Aturan yang belum tertulis menyusul — yang di bawah adalah hasil revisi terbaru (2026-09-05).

## 1) Header (FormPage)
- Pakai `src/components/ui/form-page.tsx:FormPage` untuk semua New/Detail/Edit.
- `title`: `text-[24px] font-semibold tracking-[-0.02em] sm:text-[26px]` (jangan `text-xl font-bold` custom).
- Wrapper: `className="-mt-2 sm:-mt-4 mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4"` sudah内置 di FormPage — jangan ganti `mb-4` custom.
- `titleBadge`: `DocStatusBadge` di samping judul.
- `actions`: tombol di kanan (`shrink-0`), `gap-2` antar tombol.
- `description`: **jangan pakai** di list Receiving/QC (header bersih). Hanya pakai jika benar-benar perlu di page lain.

## 2) Layout Form (Detail & New Harus Sama)
- **Wajib sama persis** antara New dan Detail (view/edit) untuk `Document → Note`.
- Bungkus: `FormSection` tanpa card. **Hapus** kotak `rounded-xl border border-border bg-card p-5` yang dulu mengelilingi Document→Note di RCV — sekarang grid langsung di `FormSection`.
- Grid: `FormGrid` → `grid gap-x-8 gap-y-5 sm:grid-cols-2` (jangan `gap-x-6 gap-y-4` atau custom). `FormGrid` ada di `src/components/ui/form-page.tsx:90`.
- Detail view/edit dan New Receiving pakai `FormGrid` yang sama — ukuran field, tinggi `h-8`, `pl-9` DatePicker, `w-1/2` TimePicker di kanan baris 2, semua identik.
- Baris Receiving:
  - Row1: `Document` (label `Document`, bukan `No PO`; readOnly `div bg-zinc-100 h-8 px-3 text-[13px]` saat view) | `Posting Date` (`DatePicker` `w-full h-8`)
  - Row2: `Supplier Name` (readOnly `div`) | `Target Warehouse` (`SearchableSelect` saat edit, `div` saat view)
  - Row2 col kanan `Posting Time` (`TimePicker` `h-8 w-1/2`, logic `1200 → 12:00:00` di `src/components/ui/time-picker.tsx:parseTimeInput`), `Batch` tidak tampil.
  - Row3: `Notes` (1 kolom, `Textarea`) — **jangan** `sm:col-span-2` di detail (bagi 2). Di New, `Notes` juga 1 kolom.
  - `FormSection` untuk Item: `title="Item"` / `title="Item — QC Completed..."` — sama New (`title="Item dari PO"`) pakai komponen sama, bukan `h2` custom.
- Judul & tombol: posisi geser sudah di-fix via FormPage — jangan pakai `mb-4` custom atau `h1` manual di detail.

## 3) Tombol (Button)
- Semua `Save`/`Submit`/`Update`: `size="sm"` + ikon `<Save size={15} strokeWidth={2}/>` disamakan New vs Detail.
- `Edit`: `variant="outline" size="sm"` + `<Pencil size={14}/>`
- `Discard`: `variant="ghost" size="sm"` + `<X size={14}/>`
- `Cancel`: `variant="outline" size="sm"`
- Jangan pakai `size="default"` atau `h-7` custom untuk Save — pakai `size="sm"` konsisten.
- `New > Save` di kanan header FormPage, bukan di `FormActions` bawah (bawah dihapus di Receiving).

## 4) Flow Save Receiving (2026-09-05 revisi) — WAJIB
- `New > Save` → `POST /receivings` status `DRAFT` (tanpa `Save & Submit` di bawah, `Back` dihapus di menu Receiving; hanya `Save` di header).
- `Edit > Save` → `PUT /receivings/:id` tetap `DRAFT`; setelah save tombol `Save` berubah jadi `Submit`.
- `Submit` → `POST /receivings/:id/submit` via `toast.custom` Sonner `No / Yes` (`duration: Infinity`, `Yes` `autoFocus`, `Enter` = Yes, `Esc` = No, global `keydown` Enter/Esc juga trigger).
- Shortcut `Ctrl+S` / `Cmd+S` → trigger `Save` (New/Edit) atau `Submit`/`Update` sesuai konteks (`preventDefault` browser save). Implement di `frontend/src/app/app/receiving/new/page.tsx:64` & `frontend/src/app/app/receiving/[id]/page.tsx:235` (hook sebelum early-return).
- Detail QC: `Posting Date` editable default `todayISO()` (actual date), `Supplier` plain `div`, `Target Warehouse` readOnly `div`.

## 5) Tabel (Global)
- Wrapper: `overflow-hidden rounded-lg border border-border`
- Header: `bg-zinc-100 dark:bg-zinc-800` + `border-b`, `divide-x divide-border`, tidak ada double-border.
- **Checkbox wajib**: kolom pertama setiap tabel item selalu `Checkbox` (`w-8 px-2 text-center`) — header berisi select-all (`checked` / `indeterminate`), tiap baris ada checkbox per-row. Berlaku untuk mode edit maupun readOnly.
- `TableCell` input: `p-0 border-r border-border` + `TableInput` (`src/components/ui/table-input.tsx`: `h-9 w-full border-0 bg-transparent`, `onWheel=>blur`, `placeholder Qty`, `bg-amber-50` saat focus).
- `SearchableSelect` di tabel: prop `table` → `border-0 bg-transparent h-9`, dropdown hanya setelah ketik (`onChange` → `setOpen(true)`, `onFocus` tidak buka), vertical lines `divide-x`.
- Receiving Detail: `Alasan Reject` & `Batch` dihapus global (tidak ada kolom).
- Item di RCV: `No | Item | Qty PO | Qty Received (TableInput) | Rate | Amount` (view: `Qty Received` plain, `Qty Accepted/Reject` hanya saat `PENDING_QC`/`COMPLETED`).

## 6) List Page
- **Receiving** (`/app/receiving`): Kolom `Supplier Name | Status | Return (bar h-1.5 bg-muted + bg-primary, pct = totalRejected/totalQty*100 via backend `returnPct`) | ID=documentNo | Created=timeAgo` (tanpa `PO ID`, tanpa `View` button, tanpa `description`). `ID` wajib `documentNo` (fallback `formatId` hanya jika null).
- **QC** (`/app/qc`): Kolom `ID=documentNo | Posting date=inspectionDate.slice(0,10) | Status | Created=timeAgo` (tanpa `PR ID`, tanpa `View` button, tanpa `description`).
- `onRowClick` → `navigate(/app/receiving/... atau /app/qc/.../${documentNo ?? id})` (documentNo mengandung `/` → pakai `id` UUID + `encodeURIComponent` di router).

## 7) Aturan Tambahan (akan menyusul)
- Warna, tipografi, spacing lain tetap pakai Tailwind + `cn`/`cx`. Jangan pakai `rounded-xl border` card untuk form — pakai `FormSection` saja.
- Semua `DatePicker` `pl-9` + ikon `Calendar`, `TimePicker` logic sama.
- Validasi & error via `useErrorToast` + `toast.error`, bukan `alert`.

## 8) GRN Header (frontend-only, `/app/grn`)
- Baris 1 (3 kolom, `grid gap-x-8 gap-y-5 sm:grid-cols-3`): `Ref PO` | `Supplier` (readOnly otomatis dari PO) | `Posting Date`.
- Baris 2 (3 kolom): di bawah `Ref PO` ada 2 checkbox (`Checkbox` + label `text-xs cursor-pointer`, pola mengikut `purchase-orders/[id]`): `Edit posting date time` (gate — tanpa centang, `DatePicker`/`TimePicker` `disabled`) dan `Putaway` (flag tersimpan di dokumen); kolom tengah kosong `aria-hidden`; `Posting Time` tepat di bawah `Posting Date`.
- Baris 3 (2 kolom, `FormGrid`): `Warehouse` | `Sub Warehouse` (opsi difilter `parentId === warehouseId`).
- Detail view (Submitted/Canceled): kedua checkbox tetap tampil terkunci (`disabled`, tidak hilang)
  — `Edit posting date time` (selalu belum dicentang) dan `Putaway` (status tersimpan);
  gate `Edit posting date time` selalu mulai belum dicentang tiap dokumen dimuat.
- Berlaku identik untuk New dan Detail (view/edit).

> Ubah aturan di file ini dulu jika ada revisi — jangan ubah langsung di component tanpa update `design.md` agar konsisten.
