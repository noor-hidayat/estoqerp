# PRD: Aplikasi Stock Opname

## 1. Latar Belakang & Tujuan
Aplikasi web (dengan dukungan mobile) untuk melakukan stock opname (penghitungan stok fisik) di gudang dengan skala multi-cabang dan multi-gudang. Fitur inti aplikasi adalah kemampuan konfigurasi format barcode secara fleksibel, tanpa perlu perubahan kode program.

## 2. Target Pengguna
- **Admin** — mengatur konfigurasi barcode, master data, user & role
- **Staff Gudang** — melakukan scan/hitung fisik barang
- **Supervisor/Approver** — mereview dan menyetujui hasil opname

## 3. Platform
- Web app (untuk penggunaan dengan barcode scanner fisik)
- Mobile app/web responsif (untuk penggunaan dengan kamera HP sebagai barcode scanner)

## 4. Fitur Utama

### 4.1 Setup (dahulu "Master Data")
| Fitur | Deskripsi |
|---|---|
| Barcode Format | Konfigurasi format barcode berbasis segmen (contoh: digit 1–2 = kode kategori, digit 2–8 = tanggal). Bisa menyimpan lebih dari satu format sekaligus, dikelola lewat admin settings, tidak hardcode di kode program |
| Qty per Format | Toggle per format: jika aktif, qty diambil otomatis dari tabel item (qty tetap per barcode); jika nonaktif, qty diinput manual tiap sesi scan (misal per pallet), untuk menangani kode barang sama dengan qty berbeda |
| Item / Produk | Master data barang |
| Lokasi Gudang | Kode lokasi rak/bin (contoh: "H1 AB1") |
| Cabang / Gudang | Data multi-cabang dan multi-gudang |
| User & Role | Pengaturan akses: admin, staff, approver |

### 4.2 Stock Opname
| Fitur | Deskripsi |
|---|---|
| Project | Mengelompokkan sesi opname dalam satu proyek bernama (contoh: "Opname Februari") |
| Mode Opname | Pilihan per project: bandingkan dengan stok sistem yang ada, atau hitung ulang dari nol (recount from scratch) |
| Scan Session | Proses input barang via barcode scanner fisik (web) atau kamera HP (mobile) |
| Variance Review | Daftar item dengan selisih antara stok sistem dan hasil hitung fisik |
| Approval | Persetujuan hasil akhir opname oleh supervisor sebelum menjadi data final |

### 4.3 Laporan
| Fitur | Deskripsi |
|---|---|
| Laporan per Project | Hasil opname lengkap: qty sistem, qty hasil hitung, selisih |
| Variance Report | Fokus pada item dengan selisih |
| Laporan per Lokasi | Breakdown hasil per rak/bin location |
| Summary Report | Ringkasan total value stok, jumlah item, % completion |
| Riwayat Scan | Log transaksi scan mentah untuk audit trail |
| Export | Format Excel (.xlsx) dan PDF, dengan filter (project, tanggal, lokasi, kategori) |

## 5. Alur Pengguna (High-Level)
1. Admin membuat/mengatur format barcode dan master data di menu Setup
2. Admin/Supervisor membuat Project opname baru dan memilih mode opname
3. Staff melakukan scan barang di lokasi menggunakan scanner/kamera HP
4. Sistem mem-parsing barcode sesuai format aktif dan mencatat qty
5. Setelah scan selesai, sistem menampilkan variance (selisih) antara stok sistem dan hasil fisik
6. Supervisor mereview dan approve hasil opname
7. Data final tersedia untuk di-export sebagai laporan

## 6. Kebutuhan Non-Fungsional
- Skalabilitas untuk multi-cabang dan multi-gudang
- Konfigurasi barcode dinamis tanpa perlu deployment ulang
- Kontrol akses berbasis role

## 7. Fitur Potensial (Belum Diprioritaskan)
- Approval/review workflow bertingkat
- Deteksi selisih otomatis dengan threshold
- Recount/spot check untuk item tertentu
- Kolaborasi multi-user dalam satu project
- Progress tracking dashboard
- Log riwayat perubahan format barcode
- Input manual sebagai fallback barcode rusak
- Bulk import master data (Excel/CSV)
- Notifikasi (selisih besar, deadline project)
- Mode offline dengan sinkronisasi

---
*Dokumen ini adalah draf awal berdasarkan diskusi awal proyek dan akan berkembang seiring detail teknis lebih lanjut.*
