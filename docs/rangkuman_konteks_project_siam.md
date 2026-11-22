# Rangkuman Konteks Project: Sistem Informasi Akademik Mahasiswa (SIAM — Modul KRS Online)

## 1. Identitas & Tim Pengembang (Kelompok 1 — Rekayasa Sistem Informasi, FILKOM UB)
* **Dosen Pengampu:** Lia Ninda Safitri (NIK/NIP. 20112345671001)
* **Asisten:** Zaid Ilman Faqih Umar & Stephanie Gabriella Wijaya
* **Anggota Kelompok & Pembagian Tugas UI:**
  * **Gedeon Monang Naibaho (GM) — NIM 255150400111049:** `UI-01` (Login), `UI-10` (Beranda), `UI-02` (Pengisian KRS)
  * **Rohmi Rizqulloh Putra (RR) — NIM 255150400111055:** `UI-03` (KRS Saya + Modal Konfirmasi), `UI-04` (Status KRS)
  * **Arya Putra Rahman Dhika (RI) — NIM 255150407111067:** `UI-05` (Cetak KRS), `UI-06` (Persetujuan KRS), `UI-07` (Modal Catatan Revisi)
  * **Bisma Putra Aria Wijaya (BP) — NIM 255150407111075:** `UI-08` (Pengaturan Kuota Kelas), `UI-09` (Kelola Data Mata Kuliah & Jadwal)

---

## 2. Alur Kerja (*Workflow*) yang Disepakati
1. **Perancangan Visual (`design.md` + `style.css`):** Menggunakan gaya *layout* referensi **Akademi Academic Dashboard** (komponen *rounded card* radius `20px`, tombol *pill* radius `40px`, *left sidebar* permanen lebar `260px` dengan menu aktif menyatu ke kanvas, serta *sectioned card header*).
2. **Generate UI via Google Stitch & Revisi Manual di Figma:**
   * Ke-16 variasi layar telah selesai di-*generate* di Stitch dan direvisi secara manual di Figma (perbaikan *layouting*, penyesuaian ikon, logo Universitas Brawijaya, serta penghapusan menu ekstra yang tidak ada di modul seperti *Jadwal Kuliah*, *KHS*, dan *Riwayat Akademik*).
   * Seluruh 16 hasil revisi Figma telah dikompilasi ke dalam file **`SIAM UB - RSI Kelompok 1.zip`** dalam format gambar `.png`.
3. **Alasan Tidak Ekspor HTML via Plugin Figma (Anima):**
   * Saat dicoba diekspor dengan plugin Anima, struktur *layer* hasil *paste* Stitch menyebabkan *preview* tertukar/tidak akurat (`Main Content Wrapper` terbaca menyilang) dan menghasilkan kode HTML dengan banyak `div` bertumpuk.
   * **Keputusan Final:** Kode HTML bersih (`<aside>`, `<main>`, `<table>`, `<form>`, modal) akan di-generate langsung oleh Gemini berdasarkan **16 file gambar PNG di `SIAM UB - RSI Kelompok 1.zip`** dan disambungkan ke satu file **`style.css`** terpusat, sebelum dibawa ke **Antigravity** untuk pembuatan *backend* & database MySQL serta *deploy* via GitHub.

---

## 3. Aturan Design System & Distribusi Warna (`design.md` & `style.css`)
* **Font Utama:** `'Poppins', sans-serif`
* **Proporsi Warna 60-30-10:**
  1. **Cream (60% — Dominant Background & Surface):**
     * `--color-cream-canvas`: `#FAF7F0` (Latar utama halaman/viewport)
     * `--color-cream-surface`: `#FFFFFF` (Permukaan *card*, modal, tabel, *input*)
     * `--color-cream-subtle`: `#F3EDE0` (*Header* tabel, *strip* identitas, panel *read-only* seperti Catatan Revisi)
     * `--color-cream-border`: `#E5DEC9` (Garis batas `1px`)
  2. **Biru / Academic Blue (30% — Brand, Sidebar & Primary Action):**
     * `--color-blue-primary`: `#1E40AF` (*Sidebar*, *banner header card*, tombol aksi utama: *Login, Simpan, Ajukan KRS, Setujui, Pilih, Unduh PDF*)
     * `--color-blue-hover`: `#1D4ED8` | `--color-blue-dark`: `#1E293B` (Teks judul & isi tabel) | `--color-blue-tint`: `#DBEAFE` (Badge *KRS Sementara*)
  3. **Kuning / Amber Gold (5% — Accent, Pending & Secondary Action):**
     * `--color-yellow-accent`: `#F59E0B` (Tombol sekunder/edit: *Ubah, Tinjau, Ubah KRS*, indikator notifikasi)
     * `--color-yellow-hover`: `#D97706` | `--color-yellow-bg`: `#FEF3C7` & `--color-yellow-text`: `#92400E` (Badge *"Menunggu Persetujuan"* & peringatan)
  4. **Merah / Crimson Danger (5% — Destructive, Error & Required):**
     * `--color-red-danger`: `#DC2626` (Tombol hapus/tolak: *Hapus, Perlu Revisi, Ya, Hapus*, tanda wajib diisi `*`)
     * `--color-red-hover`: `#B91C1C` | `--color-red-bg`: `#FEE2E2` & `--color-red-text`: `#991B1B` (Alert error & badge *"Perlu Revisi"*)
  5. **Supporting Semantic:** `--color-success-bg`: `#DCFCE7` & `--color-success-text`: `#166534` (Badge *"Disetujui"* & pesan sukses).

---

## 4. Spesifikasi Teknis & Aturan Bisnis Modul 2 (`MODUL 2.pdf`)
* **Daftar Menu Sidebar Baku per Peran (STRICT):**
  * **Mahasiswa (5 Menu):** `Beranda`, `Pengisian KRS`, `KRS Saya`, `Status KRS`, `Cetak KRS`.
  * **Dosen PA (2 Menu):** `Beranda`, `Persetujuan KRS`.
  * **Admin Akademik (3 Menu):** `Beranda`, `Pengaturan Kuota Kelas`, `Kelola Data Mata Kuliah & Jadwal`.
* **11 Use Case (`UC-01` s.d. `UC-11`) & Aturan Validasi Penting:**
  * `UC-01` **Login:** Autentikasi berdasarkan atribut `Pengguna.peran` (tanpa dropdown pilih peran). Gagal login 3x $\rightarrow$ kunci akun 5 menit (`"Akun dikunci 5 menit"`).
  * `UC-02`–`UC-04` **Pengisian KRS + Include Validasi Bentrok/SKS & Cek Kuota:** Batas SKS otomatis berdasarkan `ipsSemesterLalu` ($\ge 3.00 \rightarrow 24$ SKS; $2.50\text{–}2.99 \rightarrow 21$ SKS; $2.00\text{–}2.49 \rightarrow 18$ SKS; $< 2.00 \rightarrow 15$ SKS). Sisa kuota dihitung real-time (`kuotaMaks - jumlah pendaftar`). Form terkunci jika status KRS `"Menunggu Persetujuan"` atau `"Disetujui"`.
  * `UC-05` **Mengajukan KRS:** Cek periode aktif & KRS tidak kosong $\rightarrow$ pop-up konfirmasi $\rightarrow$ status berubah jadi `"Menunggu Persetujuan"` + kirim notifikasi ke Dosen PA.
  * `UC-06` **Memantau Status KRS:** Menampilkan daftar MK, total SKS, status (`Menunggu Persetujuan` / `Disetujui` / `Perlu Revisi`), Dosen PA, tanggal pengajuan, dan kotak *read-only* **Catatan Revisi** (jika status `"Perlu Revisi"`).
  * `UC-07` **Mencetak KRS:** Hanya bisa diakses jika status `"Disetujui"` (jika belum, arahkan ke `Status KRS`). Menghasilkan pratinjau dokumen PDF resmi & mencatat ke `LogAktivitas`.
  * `UC-08`–`UC-09` **Approval KRS & Extend Catatan Revisi:** Dosen PA meninjau KRS bimbingan $\rightarrow$ klik `"Setujui"` (status `"Disetujui"`) atau `"Perlu Revisi"` (wajib mengisi modal `Catatan Revisi`, status berubah `"Perlu Revisi"`).
  * `UC-10` **Pengaturan Kuota Kelas:** Admin memperbarui `kuotaMaks`; validasi `kuotaBaru >= jumlah mahasiswa terdaftar`.
  * `UC-11` **Kelola Data Mata Kuliah & Jadwal:** CRUD MK & jadwal dengan validasi anti-bentrok ruangan & dosen, serta tidak boleh ubah/hapus kelas yang sudah terdaftar di KRS mahasiswa.
* **12 Entitas Database MySQL (Bab 4.5):**
  `Pengguna`, `Mahasiswa`, `DosenPA`, `AdminAkademik`, `LogAktivitas`, `Notifikasi`, `PeriodeKRS`, `MataKuliah`, `KelasMK`, `KRS`, `DetailKRS`, dan `CatatanRevisi` (dengan `PC-01` s.d. `PC-26` pada Control Class).

---

## 5. Daftar 16 File Desain di `SIAM UB - RSI Kelompok 1.zip` & Status Pengerjaan Saat Ini
* **Isi File ZIP (16 PNG):**
  1. `Login - All Role.png`
  2. `Mahasiswa - Beranda.png`
  3. `Mahasiswa - Pengisian KRS.png`
  4. `Mahasiswa - [KRS Saya] Utama.png`
  5. `Mahasiswa - [KRS Saya] Notifikasi Pengajuan KRS.png`
  6. `Mahasiswa - [KRS Saya] KRS Terkirim/Menunggu Persetujuan.png`
  7. `Mahasiswa - [Status KRS] Utama.png`
  8. `Mahasiswa - Cetak KRS.png`
  9. `Dosen - Beranda.png`
  10. `Dosen - [Persetujuan KRS] Utama.png`
  11. `Dosen - [Persetujuan KRS] Catatan Revisi KRS.png`
  12. `Dosen - [Persetujuan KRS] KRS Disetujui.png`
  13. `Dosen - [Persetujuan KRS] KRS Perlu Revisi.png`
  14. `Admin - Beranda.png`
  15. `Admin - [Pengaturan Kuota Kelas] Utama.png`
  16. `Admin - Kelola Data Mata Kuliah & Jadwal.png`
* **Posisi Langkah Terakhir & Langkah Berikutnya:**
  * **Selesai:** `design.md`, `style.css`, dan 16 desain visual PNG di Figma.
  * **Langkah Berikutnya (Di Sesi Baru):** Upload kembali `SIAM UB - RSI Kelompok 1.zip`, `style.css`, dan file `rangkuman_konteks_siam.md` ini, lalu minta Gemini men-generate kode **HTML + CSS bersih** secara bertahap per batch berdasarkan gambar PNG di ZIP:
    * **Batch 1:** `Login`, `Mahasiswa - Beranda`, `Mahasiswa - Pengisian KRS`
    * **Batch 2:** `KRS Saya` (+ variasi modal & status terkirim), `Status KRS`, `Cetak KRS`
    * **Batch 3:** Semua halaman `Dosen PA` & `Admin Akademik`
  * Setelah semua file HTML/CSS terkumpul, lanjutkan ke **Antigravity** untuk pembuatan `database.sql` + backend (`PC-01` s.d. `PC-26`) serta *deploy* melalui GitHub.