/**
 * SIAM UB — Modul KRS Online
 * Tahap 3A: Logic Portal Mahasiswa (Beranda + UC-02 s.d. UC-07)
 *
 * Halaman yang ditangani:
 * - mahasiswa-beranda.html        (Ringkasan Profil, IPS, Maks SKS, Periode & Status KRS)
 * - mahasiswa-pengisian-krs.html  (UC-02 Pilih/Hapus MK, UC-03 Bentrok & SKS, UC-04 Kuota)
 * - mahasiswa-krs-saya.html       (UC-05 Tinjau & Ajukan KRS ke Dosen PA)
 * - mahasiswa-status-krs.html     (UC-06 Pantau Status KRS, Catatan Revisi & Riwayat)
 * - mahasiswa-cetak-krs.html      (UC-07 Pratinjau & Cetak PDF KRS Disetujui + Log)
 */

(function initMahasiswaKrsModule(global) {
  'use strict';

  const DEFAULT_PRODI = 'S1 Sistem Informasi';
  const DEFAULT_FAKULTAS = 'Fakultas Ilmu Komputer';

  // ---------------------------------------------------------------------------
  // 1. UTILITAS FORMAT & VALIDASI (PC-07, PC-08, PC-10)
  // ---------------------------------------------------------------------------

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * PC-08: Batas maksimum SKS berdasarkan IPS semester lalu.
   */
  function getMaxSksByIps(ips) {
    const val = Number(ips);
    if (Number.isNaN(val)) return 15;
    if (val >= 3.0) return 24;
    if (val >= 2.5) return 21;
    if (val >= 2.0) return 18;
    return 15;
  }

  function getIpsRuleText(ips) {
    const val = Number(ips);
    if (val >= 3.0) return 'Berdasarkan IPS ≥ 3.00';
    if (val >= 2.5) return 'Berdasarkan IPS 2.50 – 2.99';
    if (val >= 2.0) return 'Berdasarkan IPS 2.00 – 2.49';
    return 'Berdasarkan IPS < 2.00';
  }

  function getIpsPredicate(ips) {
    const val = Number(ips);
    if (val >= 3.5) return { label: 'Cumlaude', cls: 'bg-emerald-50 text-emerald-700' };
    if (val >= 3.0) return { label: 'Memuaskan', cls: 'bg-emerald-50 text-emerald-700' };
    if (val >= 2.5) return { label: 'Baik', cls: 'bg-blue-50 text-[#2042B8]' };
    if (val >= 2.0) return { label: 'Cukup', cls: 'bg-amber-50 text-amber-700' };
    return { label: 'Perlu Perhatian', cls: 'bg-red-50 text-red-700' };
  }

  function getAngkatanFromNim(nim) {
    if (!nim || String(nim).length < 2) return '-';
    return `20${String(nim).slice(0, 2)}`;
  }

  function getInitials(nama) {
    if (global.SIAM_AUTH && typeof global.SIAM_AUTH.getInitials === 'function') {
      return global.SIAM_AUTH.getInitials(nama);
    }
    const parts = String(nama || 'US').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'US';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function formatTimeHHMM(timeStr) {
    if (!timeStr) return '--:--';
    const parts = String(timeStr).split(':');
    return `${String(parts[0] || '00').padStart(2, '0')}:${String(parts[1] || '00').padStart(2, '0')}`;
  }

  function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = String(timeStr).split(':');
    return parseInt(parts[0] || '0', 10) * 60 + parseInt(parts[1] || '0', 10);
  }

  function formatDateID(dateInput, withTime = false) {
    if (!dateInput) return '-';
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(d.getTime())) return String(dateInput);

    const datePart = d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    if (!withTime) return datePart;

    const timePart = d.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).replace('.', ':');

    return `${datePart}, ${timePart} WIB`;
  }

  function formatShortDateID(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function formatKelasLabel(idKelas) {
    if (!idKelas) return '-';
    const parts = String(idKelas).split('-');
    if (parts.length >= 2) {
      return `SI-${parts[parts.length - 1]}`;
    }
    return idKelas;
  }

  /**
   * PC-07: ValidasiKRSController.cekBentrok(jadwalBaru, daftarKelasDipilih)
   * Mengembalikan objek kelas yang bentrok jika ada, atau null jika aman.
   */
  function findScheduleConflict(jadwalBaru, daftarKelasDipilih) {
    if (!jadwalBaru || !Array.isArray(daftarKelasDipilih) || daftarKelasDipilih.length === 0) {
      return null;
    }

    const hariBaru = String(jadwalBaru.hari || '').trim().toLowerCase();
    const startBaru = timeToMinutes(jadwalBaru.jam_mulai);
    const endBaru = timeToMinutes(jadwalBaru.jam_selesai);

    for (const k of daftarKelasDipilih) {
      if (k.id_kelas === jadwalBaru.id_kelas) continue;
      const hariK = String(k.hari || '').trim().toLowerCase();
      if (hariK !== hariBaru) continue;

      const startK = timeToMinutes(k.jam_mulai);
      const endK = timeToMinutes(k.jam_selesai);

      if (startBaru < endK && startK < endBaru) {
        return k;
      }
    }
    return null;
  }

  /**
   * PC-10: Menghitung sisa kuota kelas (minimal 0).
   */
  function hitungSisaKuota(kuotaMaks, jumlahPendaftar) {
    const sisa = Number(kuotaMaks || 0) - Number(jumlahPendaftar || 0);
    return sisa < 0 ? 0 : sisa;
  }

  function isKrsLockedStatus(status) {
    return status === 'Menunggu Persetujuan' || status === 'Disetujui';
  }

  function isPeriodeCurrentlyActive(periode) {
    if (!periode || !periode.tanggal_mulai || !periode.tanggal_selesai) return false;
    const now = new Date();
    const todayStr = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    return todayStr >= periode.tanggal_mulai && todayStr <= periode.tanggal_selesai;
  }

  function getStatusMeta(status) {
    switch (status) {
      case 'Disetujui':
        return {
          label: 'Disetujui',
          shortLabel: 'Disetujui',
          badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
          dotClass: 'bg-emerald-600',
          cardBadgeClass: 'bg-emerald-100 text-emerald-700',
        };
      case 'Menunggu Persetujuan':
        return {
          label: 'Menunggu Persetujuan',
          shortLabel: 'Menunggu',
          badgeClass: 'bg-amber-50 text-amber-800 border border-amber-200',
          dotClass: 'bg-amber-500',
          cardBadgeClass: 'bg-amber-100 text-amber-700',
        };
      case 'Perlu Revisi':
        return {
          label: 'Perlu Revisi',
          shortLabel: 'Perlu Revisi',
          badgeClass: 'bg-red-50 text-red-700 border border-red-200',
          dotClass: 'bg-red-600',
          cardBadgeClass: 'bg-red-100 text-red-700',
        };
      case 'KRS Sementara':
      case 'Draft':
        return {
          label: 'KRS Sementara (Draft)',
          shortLabel: 'Draft',
          badgeClass: 'bg-blue-50 text-[#2042B8] border border-blue-200',
          dotClass: 'bg-[#2042B8]',
          cardBadgeClass: 'bg-blue-100 text-[#2042B8]',
        };
      default:
        return {
          label: 'Belum Mengisi KRS',
          shortLabel: 'Belum Ada',
          badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200',
          dotClass: 'bg-slate-400',
          cardBadgeClass: 'bg-slate-100 text-slate-600',
        };
    }
  }

  function generateIdKrs(nim, idPeriode) {
    // Format maks 15 karakter (sesuai VARCHAR(15) pada tabel krs)
    const nimTail = String(nim || '000000').slice(-6);
    const yearTail = String(idPeriode || '26').replace(/[^0-9]/g, '').slice(-2) || '26';
    return `KRS-${yearTail}-${nimTail}`;
  }

  function refreshIcons() {
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons();
    }
  }

  // ---------------------------------------------------------------------------
  // 2. DATA ACCESS LAYER (SUPABASE)
  // ---------------------------------------------------------------------------

  async function fetchActivePeriode(db) {
    const { data, error } = await db
      .from('periode_krs')
      .select('id_periode, semester, tanggal_mulai, tanggal_selesai')
      .order('tanggal_mulai', { ascending: false });

    if (error) throw new Error(`Gagal memuat periode KRS: ${error.message}`);
    if (!data || data.length === 0) return null;

    const active = data.find((p) => isPeriodeCurrentlyActive(p));
    return active || data[0];
  }

  async function fetchMahasiswaProfile(db, session) {
    const { data, error } = await db
      .from('mahasiswa')
      .select('nim, id_pengguna, nama, ips_semester_lalu, id_dosen_pa, dosen_pa(nidn, nama, id_pengguna)')
      .eq('id_pengguna', session.id_pengguna)
      .maybeSingle();

    if (error) throw new Error(`Gagal memuat profil mahasiswa: ${error.message}`);
    if (!data) throw new Error('Data profil mahasiswa tidak ditemukan.');
    return data;
  }

  async function fetchKrsWithDetails(db, nim, idPeriode) {
    const { data: krs, error: krsErr } = await db
      .from('krs')
      .select('id_krs, nim, id_periode, status, tanggal_pengajuan, total_sks')
      .eq('nim', nim)
      .eq('id_periode', idPeriode)
      .maybeSingle();

    if (krsErr) throw new Error(`Gagal memuat data KRS: ${krsErr.message}`);
    if (!krs) return { krs: null, items: [] };

    const { data: details, error: detErr } = await db
      .from('detail_krs')
      .select(`
        id_krs,
        id_kelas,
        kelas_mk (
          id_kelas,
          kode_mk,
          id_periode,
          id_dosen,
          hari,
          jam_mulai,
          jam_selesai,
          ruangan,
          kuota_maks,
          mata_kuliah ( kode_mk, nama_mk, sks, semester ),
          dosen_pa ( nidn, nama )
        )
      `)
      .eq('id_krs', krs.id_krs);

    if (detErr) throw new Error(`Gagal memuat detail KRS: ${detErr.message}`);

    const items = (details || [])
      .map((row) => {
        const k = row.kelas_mk;
        if (!k) return null;
        return {
          id_krs: row.id_krs,
          id_kelas: k.id_kelas,
          kode_mk: k.kode_mk,
          nama_mk: k.mata_kuliah ? k.mata_kuliah.nama_mk : k.kode_mk,
          sks: k.mata_kuliah ? Number(k.mata_kuliah.sks) : 0,
          semester: k.mata_kuliah ? Number(k.mata_kuliah.semester) : 0,
          hari: k.hari,
          jam_mulai: k.jam_mulai,
          jam_selesai: k.jam_selesai,
          ruangan: k.ruangan,
          kuota_maks: Number(k.kuota_maks || 0),
          id_dosen: k.id_dosen,
          nama_dosen: k.dosen_pa ? k.dosen_pa.nama : '-',
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.kode_mk.localeCompare(b.kode_mk));

    return { krs, items };
  }

  async function fetchKelasWithQuota(db, idPeriode) {
    const { data: kelasList, error: kelasErr } = await db
      .from('kelas_mk')
      .select(`
        id_kelas,
        kode_mk,
        id_periode,
        id_dosen,
        hari,
        jam_mulai,
        jam_selesai,
        ruangan,
        kuota_maks,
        mata_kuliah ( kode_mk, nama_mk, sks, semester ),
        dosen_pa ( nidn, nama )
      `)
      .eq('id_periode', idPeriode)
      .order('id_kelas', { ascending: true });

    if (kelasErr) throw new Error(`Gagal memuat daftar kelas: ${kelasErr.message}`);

    const idList = (kelasList || []).map((k) => k.id_kelas);
    const pendaftarMap = {};

    if (idList.length > 0) {
      const { data: enrollments, error: enrErr } = await db
        .from('detail_krs')
        .select('id_kelas')
        .in('id_kelas', idList);

      if (enrErr) throw new Error(`Gagal menghitung pendaftar kelas: ${enrErr.message}`);

      (enrollments || []).forEach((row) => {
        pendaftarMap[row.id_kelas] = (pendaftarMap[row.id_kelas] || 0) + 1;
      });
    }

    return (kelasList || []).map((k) => {
      const jumlahPendaftar = pendaftarMap[k.id_kelas] || 0;
      const kuotaMaks = Number(k.kuota_maks || 0);
      return {
        id_kelas: k.id_kelas,
        kode_mk: k.kode_mk,
        nama_mk: k.mata_kuliah ? k.mata_kuliah.nama_mk : k.kode_mk,
        sks: k.mata_kuliah ? Number(k.mata_kuliah.sks) : 0,
        semester: k.mata_kuliah ? Number(k.mata_kuliah.semester) : 0,
        hari: k.hari,
        jam_mulai: k.jam_mulai,
        jam_selesai: k.jam_selesai,
        ruangan: k.ruangan,
        kuota_maks: kuotaMaks,
        jumlah_pendaftar: jumlahPendaftar,
        sisa_kuota: hitungSisaKuota(kuotaMaks, jumlahPendaftar),
        id_dosen: k.id_dosen,
        nama_dosen: k.dosen_pa ? k.dosen_pa.nama : '-',
      };
    });
  }

  async function logAktivitas(db, idPengguna, aktivitas) {
    try {
      await db.from('log_aktivitas').insert({
        id_pengguna: idPengguna,
        aktivitas,
      });
    } catch (err) {
      console.warn('[SIAM Mahasiswa] Gagal mencatat log_aktivitas:', err);
    }
  }

  async function kirimNotifikasi(db, idPenerima, pesan) {
    if (!idPenerima) return;
    const { error } = await db.from('notifikasi').insert({
      id_penerima: idPenerima,
      pesan,
      sudah_dibaca: false,
    });
    if (error) {
      console.warn('[SIAM Mahasiswa] Gagal mengirim notifikasi:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. PAGE 1: BERANDA MAHASISWA (mahasiswa-beranda.html)
  // ---------------------------------------------------------------------------

  async function initBerandaMahasiswa(db, session) {
    try {
      const [mhs, periode] = await Promise.all([
        fetchMahasiswaProfile(db, session),
        fetchActivePeriode(db),
      ]);

      const { krs } = periode
        ? await fetchKrsWithDetails(db, mhs.nim, periode.id_periode)
        : { krs: null };

      const ips = Number(mhs.ips_semester_lalu || 0);
      const maxSks = getMaxSksByIps(ips);
      const predikat = getIpsPredicate(ips);
      const statusMeta = getStatusMeta(krs ? krs.status : null);

      const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };

      setText('welcomeName', mhs.nama);
      setText('userProdi', `Program Studi ${DEFAULT_PRODI} – ${DEFAULT_FAKULTAS}`);
      setText('statNim', mhs.nim);
      setText('statAngkatan', `Angkatan ${getAngkatanFromNim(mhs.nim)}`);
      setText('statSemester', periode ? periode.semester : 'Belum Ada Periode');
      setText(
        'statSemesterSub',
        periode && isPeriodeCurrentlyActive(periode)
          ? 'Periode KRS Sedang Berlangsung'
          : 'Periode KRS Tidak Aktif'
      );
      setText('statIps', ips.toFixed(2));
      setText('statMaxSks', `${maxSks} SKS`);
      setText('statMaxSksRule', getIpsRuleText(ips));

      const predikatEl = document.getElementById('statIpsPredicate');
      if (predikatEl) {
        predikatEl.textContent = predikat.label;
        predikatEl.className = `${predikat.cls} text-[11px] font-semibold px-2 py-0.5 rounded-full`;
      }

      const periodeEl = document.getElementById('periodePengisianText');
      if (periodeEl) {
        periodeEl.textContent = periode
          ? `${formatShortDateID(periode.tanggal_mulai)} – ${formatShortDateID(periode.tanggal_selesai)}`
          : 'Tidak ada periode aktif';
      }

      const badgeStatus = document.getElementById('badgeStatusKrs');
      if (badgeStatus) {
        badgeStatus.textContent = statusMeta.shortLabel;
        badgeStatus.className = `${statusMeta.cardBadgeClass} text-[10px] font-bold px-2.5 py-0.5 rounded-full`;
      }
    } catch (err) {
      console.error('[SIAM Beranda Mahasiswa] Error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. PAGE 2: PENGISIAN KRS (mahasiswa-pengisian-krs.html — UC-02, UC-03, UC-04)
  // ---------------------------------------------------------------------------

  async function initPengisianKrs(db, session) {
    const alertBox = document.getElementById('alertBentrok');
    const alertText = document.getElementById('alertBentrokText');
    const alertAction = document.getElementById('alertBentrokAction');
    const lockBanner = document.getElementById('alertKrsTerkunci');
    const lockBannerText = document.getElementById('alertKrsTerkunciText');
    const tbodyTersedia = document.getElementById('tbodyMkTersedia');
    const tbodySementara = document.getElementById('tbodyKrsSementara');
    const totalSksBadge = document.getElementById('totalSksBadge');
    const paginationInfo = document.getElementById('paginationInfoMk');
    const searchInput = document.getElementById('searchMk');
    const searchBtn = document.getElementById('btnSearchMk');

    const state = {
      mhs: null,
      periode: null,
      maxSks: 24,
      krs: null,
      selectedItems: [],
      allKelas: [],
      keyword: '',
      locked: false,
      lockReason: '',
      busy: false,
    };

    function showFeedbackAlert(messageHtml, type = 'error', showReviewLink = false) {
      if (!alertBox || !alertText) return;
      alertBox.classList.remove(
        'hidden',
        'bg-red-50',
        'border-red-200',
        'text-red-700',
        'bg-emerald-50',
        'border-emerald-200',
        'text-emerald-700',
        'bg-amber-50',
        'border-amber-200',
        'text-amber-800'
      );

      if (type === 'success') {
        alertBox.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-700');
      } else if (type === 'warning') {
        alertBox.classList.add('bg-amber-50', 'border-amber-200', 'text-amber-800');
      } else {
        alertBox.classList.add('bg-red-50', 'border-red-200', 'text-red-700');
      }

      alertText.innerHTML = messageHtml;
      if (alertAction) {
        alertAction.classList.toggle('hidden', !showReviewLink);
      }
      refreshIcons();
    }

    function hideFeedbackAlert() {
      if (alertBox) alertBox.classList.add('hidden');
    }

    function computeTotalSks() {
      return state.selectedItems.reduce((sum, item) => sum + Number(item.sks || 0), 0);
    }

    function updateLockBanner() {
      if (!lockBanner || !lockBannerText) return;
      if (state.locked) {
        lockBannerText.textContent = state.lockReason;
        lockBanner.classList.remove('hidden');
      } else {
        lockBanner.classList.add('hidden');
      }
    }

    function renderDaftarMk() {
      if (!tbodyTersedia) return;

      const kw = state.keyword.trim().toLowerCase();
      const filtered = state.allKelas.filter((k) => {
        if (!kw) return true;
        const haystack = [
          k.kode_mk,
          k.nama_mk,
          k.id_kelas,
          formatKelasLabel(k.id_kelas),
          k.hari,
          formatTimeHHMM(k.jam_mulai),
          formatTimeHHMM(k.jam_selesai),
          k.ruangan,
          k.nama_dosen,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(kw);
      });

      const selectedKelasIds = new Set(state.selectedItems.map((i) => i.id_kelas));
      const selectedKodeMks = new Set(state.selectedItems.map((i) => i.kode_mk));

      if (filtered.length === 0) {
        tbodyTersedia.innerHTML = `
          <tr>
            <td colspan="7" class="py-8 px-6 text-center text-slate-400">
              Tidak ada mata kuliah yang cocok dengan pencarian "<strong>${escapeHtml(state.keyword)}</strong>".
            </td>
          </tr>
        `;
      } else {
        tbodyTersedia.innerHTML = filtered
          .map((k) => {
            const isSelected = selectedKelasIds.has(k.id_kelas);
            const isSameCoursePicked = !isSelected && selectedKodeMks.has(k.kode_mk);
            const isFull = k.sisa_kuota <= 0;

            let quotaBadge = '';
            if (isFull) {
              quotaBadge = `<span class="bg-red-50 text-red-600 font-bold px-3 py-1 rounded-full">Kuota Penuh</span>`;
            } else if (k.sisa_kuota <= 5) {
              quotaBadge = `<span class="bg-amber-50 text-amber-700 font-bold px-3 py-1 rounded-full">${k.sisa_kuota} / ${k.kuota_maks}</span>`;
            } else {
              quotaBadge = `<span class="bg-emerald-50 text-emerald-700 font-bold px-3 py-1 rounded-full">${k.sisa_kuota} / ${k.kuota_maks}</span>`;
            }

            let actionBtn = '';
            if (isSelected) {
              actionBtn = `
                <button type="button" disabled class="bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold px-3.5 py-1.5 rounded-full inline-flex items-center gap-1 cursor-default">
                  <i data-lucide="check" class="w-3 h-3"></i> Dipilih
                </button>
              `;
            } else if (state.locked) {
              actionBtn = `
                <button type="button" disabled class="bg-slate-200 text-slate-400 font-semibold px-4 py-1.5 rounded-full inline-flex items-center gap-1 cursor-not-allowed">
                  <i data-lucide="lock" class="w-3 h-3"></i> Terkunci
                </button>
              `;
            } else if (isFull) {
              actionBtn = `
                <button type="button" disabled class="bg-slate-200 text-slate-400 font-semibold px-4 py-1.5 rounded-full inline-flex items-center gap-1 cursor-not-allowed">
                  <i data-lucide="ban" class="w-3 h-3"></i> Penuh
                </button>
              `;
            } else if (isSameCoursePicked) {
              actionBtn = `
                <button type="button" disabled title="Mata kuliah ini sudah dipilih di kelas lain" class="bg-slate-100 text-slate-400 font-semibold px-3.5 py-1.5 rounded-full inline-flex items-center gap-1 cursor-not-allowed">
                  MK Diambil
                </button>
              `;
            } else {
              actionBtn = `
                <button type="button" data-pilih-kelas="${escapeHtml(k.id_kelas)}"
                  class="bg-[#2042B8] hover:bg-blue-800 text-white font-semibold px-4 py-1.5 rounded-full inline-flex items-center gap-1 transition">
                  + Pilih
                </button>
              `;
            }

            const rowClass = isFull && !isSelected ? 'bg-slate-50/40 text-slate-400' : 'hover:bg-slate-50/70 transition';
            const codeClass = isFull && !isSelected ? 'font-bold' : 'font-bold text-[#2042B8]';
            const titleClass = isFull && !isSelected ? 'font-semibold' : 'font-semibold text-slate-800';

            return `
              <tr class="${rowClass}">
                <td class="py-4 px-6 ${codeClass}">${escapeHtml(k.kode_mk)}</td>
                <td class="py-4 px-4">
                  <p class="${titleClass}">${escapeHtml(k.nama_mk)}</p>
                  <p class="text-[11px] text-slate-400 mt-0.5">${escapeHtml(k.nama_dosen)} • Ruang ${escapeHtml(k.ruangan)}</p>
                </td>
                <td class="py-4 px-4 text-center font-semibold">${k.sks}</td>
                <td class="py-4 px-4 text-center"><span class="bg-[#F2EFE6] text-slate-700 font-semibold px-2.5 py-1 rounded-md">${escapeHtml(formatKelasLabel(k.id_kelas))}</span></td>
                <td class="py-4 px-4 text-slate-600">${escapeHtml(k.hari)}, ${formatTimeHHMM(k.jam_mulai)} - ${formatTimeHHMM(k.jam_selesai)}</td>
                <td class="py-4 px-4 text-center">${quotaBadge}</td>
                <td class="py-4 px-6 text-right">${actionBtn}</td>
              </tr>
            `;
          })
          .join('');
      }

      if (paginationInfo) {
        paginationInfo.textContent = `Menampilkan ${filtered.length} dari ${state.allKelas.length} kelas mata kuliah aktif`;
      }
      refreshIcons();
    }

    function renderRingkasanKrs() {
      if (!tbodySementara) return;
      const totalSks = computeTotalSks();

      if (totalSksBadge) {
        totalSksBadge.textContent = `Total SKS: ${totalSks} / ${state.maxSks} SKS`;
      }

      if (state.selectedItems.length === 0) {
        tbodySementara.innerHTML = `
          <tr>
            <td colspan="4" class="py-8 px-6 text-center text-slate-400">
              Belum ada mata kuliah yang dipilih. Silakan klik <strong>+ Pilih</strong> pada daftar mata kuliah di atas.
            </td>
          </tr>
        `;
        return;
      }

      tbodySementara.innerHTML = state.selectedItems
        .map((item) => {
          const deleteBtn = state.locked
            ? `<button type="button" disabled class="bg-slate-200 text-slate-400 font-semibold px-3.5 py-1.5 rounded-full inline-flex items-center gap-1.5 cursor-not-allowed">
                 <i data-lucide="lock" class="w-3.5 h-3.5"></i> Terkunci
               </button>`
            : `<button type="button" data-hapus-kelas="${escapeHtml(item.id_kelas)}"
                 class="bg-red-600 hover:bg-red-700 text-white font-semibold px-3.5 py-1.5 rounded-full inline-flex items-center gap-1.5 transition">
                 <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Hapus
               </button>`;

          return `
            <tr>
              <td class="py-3.5 px-6 font-bold text-[#2042B8]">${escapeHtml(item.kode_mk)}</td>
              <td class="py-3.5 px-4">
                <p class="font-semibold text-slate-800">${escapeHtml(item.nama_mk)} (Kelas ${escapeHtml(formatKelasLabel(item.id_kelas))})</p>
                <p class="text-[11px] text-slate-400">${escapeHtml(item.hari)}, ${formatTimeHHMM(item.jam_mulai)} - ${formatTimeHHMM(item.jam_selesai)} • Ruang ${escapeHtml(item.ruangan)}</p>
              </td>
              <td class="py-3.5 px-4 text-center font-bold">${item.sks}</td>
              <td class="py-3.5 px-6 text-right">${deleteBtn}</td>
            </tr>
          `;
        })
        .join('');

      refreshIcons();
    }

    async function loadData() {
      hideFeedbackAlert();
      const [mhs, periode] = await Promise.all([
        fetchMahasiswaProfile(db, session),
        fetchActivePeriode(db),
      ]);

      state.mhs = mhs;
      state.periode = periode;
      state.maxSks = getMaxSksByIps(mhs.ips_semester_lalu);

      if (!periode) {
        state.locked = true;
        state.lockReason = 'Periode pengisian KRS belum tersedia.';
        updateLockBanner();
        renderDaftarMk();
        renderRingkasanKrs();
        return;
      }

      const [{ krs, items }, kelasList] = await Promise.all([
        fetchKrsWithDetails(db, mhs.nim, periode.id_periode),
        fetchKelasWithQuota(db, periode.id_periode),
      ]);

      state.krs = krs;
      state.selectedItems = items;
      state.allKelas = kelasList;

      const periodeAktif = isPeriodeCurrentlyActive(periode);
      if (!periodeAktif) {
        state.locked = true;
        state.lockReason = 'Periode pengisian KRS telah berakhir. Data hanya dapat dilihat.';
      } else if (krs && isKrsLockedStatus(krs.status)) {
        state.locked = true;
        state.lockReason = 'KRS sedang diproses atau sudah disetujui, data hanya dapat dilihat.';
      } else {
        state.locked = false;
        state.lockReason = '';
      }

      updateLockBanner();
      renderDaftarMk();
      renderRingkasanKrs();
    }

    async function handlePilihKelas(idKelas) {
      if (state.busy || state.locked) return;
      const kelas = state.allKelas.find((k) => k.id_kelas === idKelas);
      if (!kelas) return;

      hideFeedbackAlert();

      // 1. Cek duplikasi kelas / mata kuliah
      if (state.selectedItems.some((i) => i.id_kelas === idKelas)) {
        showFeedbackAlert('Kelas mata kuliah tersebut sudah ada di KRS sementara Anda.', 'warning');
        return;
      }
      if (state.selectedItems.some((i) => i.kode_mk === kelas.kode_mk)) {
        showFeedbackAlert(
          `Mata kuliah <strong>${escapeHtml(kelas.kode_mk)} ${escapeHtml(kelas.nama_mk)}</strong> sudah dipilih pada kelas lain.`,
          'warning'
        );
        return;
      }

      // 2. UC-03 / PC-07: Validasi Bentrok Jadwal
      const konflik = findScheduleConflict(kelas, state.selectedItems);
      if (konflik) {
        showFeedbackAlert(
          `Tidak Valid – Bentrok Jadwal dengan <strong>${escapeHtml(konflik.kode_mk)} ${escapeHtml(konflik.nama_mk)}</strong> (${escapeHtml(konflik.hari)}, ${formatTimeHHMM(konflik.jam_mulai)} – ${formatTimeHHMM(konflik.jam_selesai)})`,
          'error',
          true
        );
        return;
      }

      // 3. UC-03 / PC-06 & PC-08: Validasi Batas SKS
      const totalSksBaru = computeTotalSks() + Number(kelas.sks || 0);
      if (totalSksBaru > state.maxSks) {
        showFeedbackAlert(
          `Tidak Valid – Batas SKS Terlampaui (${totalSksBaru} SKS melebihi batas maksimal ${state.maxSks} SKS berdasarkan IPS ${Number(state.mhs.ips_semester_lalu).toFixed(2)}).`,
          'error'
        );
        return;
      }

      state.busy = true;
      try {
        // 4. UC-04 / PC-09: Validasi Sisa Kuota Real-time ke Supabase
        const [{ data: freshKelas, error: fkErr }, { count: jumlahPendaftar, error: cntErr }] =
          await Promise.all([
            db.from('kelas_mk').select('kuota_maks').eq('id_kelas', idKelas).single(),
            db.from('detail_krs').select('id_kelas', { count: 'exact', head: true }).eq('id_kelas', idKelas),
          ]);

        if (fkErr || cntErr) {
          throw new Error((fkErr || cntErr).message);
        }

        const sisaRealtime = hitungSisaKuota(freshKelas.kuota_maks, jumlahPendaftar || 0);
        if (sisaRealtime <= 0) {
          showFeedbackAlert(
            `Kuota kelas <strong>${escapeHtml(kelas.kode_mk)} (${escapeHtml(formatKelasLabel(idKelas))})</strong> sudah penuh.`,
            'error'
          );
          await loadData();
          return;
        }

        // 5. Pastikan record KRS ada (status 'KRS Sementara' sesuai constraint PostgreSQL)
        let idKrs = state.krs ? state.krs.id_krs : null;
        if (!idKrs) {
          idKrs = generateIdKrs(state.mhs.nim, state.periode.id_periode);
          const { data: createdKrs, error: createErr } = await db
            .from('krs')
            .insert({
              id_krs: idKrs,
              nim: state.mhs.nim,
              id_periode: state.periode.id_periode,
              status: 'KRS Sementara',
              tanggal_pengajuan: null,
              total_sks: 0,
            })
            .select()
            .single();

          if (createErr) throw new Error(`Gagal membuat draf KRS: ${createErr.message}`);
          state.krs = createdKrs;
        }

        // 6. Insert ke detail_krs
        const { error: insErr } = await db.from('detail_krs').insert({
          id_krs: idKrs,
          id_kelas: idKelas,
        });
        if (insErr) throw new Error(`Gagal menambahkan mata kuliah: ${insErr.message}`);

        // 7. Update total_sks pada tabel krs
        const { error: updErr } = await db
          .from('krs')
          .update({ total_sks: totalSksBaru })
          .eq('id_krs', idKrs);
        if (updErr) throw new Error(`Gagal memperbarui total SKS: ${updErr.message}`);

        await loadData();
        showFeedbackAlert(
          `Berhasil menambahkan <strong>${escapeHtml(kelas.kode_mk)} ${escapeHtml(kelas.nama_mk)}</strong> (${kelas.sks} SKS) ke KRS Sementara.`,
          'success'
        );
      } catch (err) {
        console.error('[SIAM Pengisian KRS] Error pilihMK:', err);
        showFeedbackAlert(`Terjadi kesalahan: ${escapeHtml(err.message)}`, 'error');
      } finally {
        state.busy = false;
      }
    }

    async function handleHapusKelas(idKelas) {
      if (state.busy || state.locked || !state.krs) return;
      const target = state.selectedItems.find((i) => i.id_kelas === idKelas);
      if (!target) return;

      hideFeedbackAlert();
      state.busy = true;
      try {
        const { error: delErr } = await db
          .from('detail_krs')
          .delete()
          .eq('id_krs', state.krs.id_krs)
          .eq('id_kelas', idKelas);

        if (delErr) throw new Error(`Gagal menghapus mata kuliah: ${delErr.message}`);

        const sisaSks = Math.max(0, computeTotalSks() - Number(target.sks || 0));
        const { error: updErr } = await db
          .from('krs')
          .update({ total_sks: sisaSks })
          .eq('id_krs', state.krs.id_krs);

        if (updErr) throw new Error(`Gagal menghitung ulang total SKS: ${updErr.message}`);

        await loadData();
        showFeedbackAlert(
          `Mata kuliah <strong>${escapeHtml(target.kode_mk)} ${escapeHtml(target.nama_mk)}</strong> telah dihapus dari KRS Sementara.`,
          'warning'
        );
      } catch (err) {
        console.error('[SIAM Pengisian KRS] Error hapusMK:', err);
        showFeedbackAlert(`Terjadi kesalahan: ${escapeHtml(err.message)}`, 'error');
      } finally {
        state.busy = false;
      }
    }

    // Event bindings
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        state.keyword = searchInput.value;
        renderDaftarMk();
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          state.keyword = searchInput.value;
          renderDaftarMk();
        }
      });
    }
    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        state.keyword = searchInput ? searchInput.value : '';
        renderDaftarMk();
      });
    }
    if (tbodyTersedia) {
      tbodyTersedia.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-pilih-kelas]');
        if (!btn) return;
        handlePilihKelas(btn.dataset.pilihKelas);
      });
    }
    if (tbodySementara) {
      tbodySementara.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-hapus-kelas]');
        if (!btn) return;
        handleHapusKelas(btn.dataset.hapusKelas);
      });
    }

    try {
      await loadData();
    } catch (err) {
      console.error('[SIAM Pengisian KRS] Load Error:', err);
      showFeedbackAlert(`Gagal memuat data dari Supabase: ${escapeHtml(err.message)}`, 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // 5. PAGE 3: KRS SAYA (mahasiswa-krs-saya.html — UC-05)
  // ---------------------------------------------------------------------------

  async function initKrsSaya(db, session) {
    const alertBox = document.getElementById('alertKrsSaya');
    const alertText = document.getElementById('alertKrsSayaText');
    const tbody = document.getElementById('tbodyKrsSaya');
    const countBadge = document.getElementById('krsSayaCountBadge');
    const totalSksEl = document.getElementById('krsSayaTotalSks');
    const maxSksEl = document.getElementById('krsSayaMaxSks');
    const statusBadge = document.getElementById('badgeStatusKrsSaya');
    const actionDraft = document.getElementById('actionDraft');
    const actionSubmitted = document.getElementById('actionSubmitted');
    const actionSubmittedBadge = document.getElementById('actionSubmittedBadge');
    const btnAjukan = document.getElementById('btnAjukanKrs');
    const modal = document.getElementById('modalKonfirmasi');
    const modalDesc = document.getElementById('modalKonfirmasiDesc');
    const btnBatalModal = document.getElementById('btnBatalAjukan');
    const btnKonfirmasiModal = document.getElementById('btnKonfirmasiAjukan');

    const state = {
      mhs: null,
      periode: null,
      krs: null,
      items: [],
      maxSks: 24,
      submitting: false,
    };

    function showAlert(messageHtml, type = 'error') {
      if (!alertBox || !alertText) return;
      alertBox.classList.remove(
        'hidden',
        'bg-red-50',
        'border-red-200',
        'text-red-700',
        'bg-emerald-50',
        'border-emerald-200',
        'text-emerald-700',
        'bg-amber-50',
        'border-amber-200',
        'text-amber-800'
      );
      if (type === 'success') {
        alertBox.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-700');
      } else if (type === 'warning') {
        alertBox.classList.add('bg-amber-50', 'border-amber-200', 'text-amber-800');
      } else {
        alertBox.classList.add('bg-red-50', 'border-red-200', 'text-red-700');
      }
      alertText.innerHTML = messageHtml;
    }

    function hideAlert() {
      if (alertBox) alertBox.classList.add('hidden');
    }

    function openModal() {
      if (!modal) return;
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closeModal() {
      if (!modal) return;
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    function render() {
      const totalSks = state.items.reduce((sum, i) => sum + Number(i.sks || 0), 0);
      const status = state.krs ? state.krs.status : null;
      const meta = getStatusMeta(status);

      const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };

      setText('krsSayaNama', state.mhs ? state.mhs.nama : '-');
      setText('krsSayaNim', state.mhs ? state.mhs.nim : '-');
      setText('krsSayaProdi', DEFAULT_PRODI);
      setText('krsSayaSemester', state.periode ? state.periode.semester : '-');

      if (statusBadge) {
        statusBadge.className = `${meta.badgeClass} text-xs font-bold px-3.5 py-1.5 rounded-full inline-flex items-center gap-1.5 shrink-0`;
        statusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${meta.dotClass}"></span> ${escapeHtml(meta.label)}`;
      }

      if (countBadge) countBadge.textContent = `${state.items.length} Mata Kuliah`;
      if (totalSksEl) totalSksEl.textContent = `${totalSks} SKS`;
      if (maxSksEl) maxSksEl.textContent = `(Maksimal ${state.maxSks} SKS)`;

      if (tbody) {
        if (state.items.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="6" class="py-10 px-6 text-center text-slate-400">
                <p class="font-semibold text-slate-600">Anda belum memilih mata kuliah apapun.</p>
                <a href="mahasiswa-pengisian-krs.html" class="inline-flex items-center gap-1.5 mt-3 bg-[#2042B8] hover:bg-blue-800 text-white text-xs font-semibold px-4 py-2 rounded-full transition">
                  Isi KRS Sekarang
                </a>
              </td>
            </tr>
          `;
        } else {
          tbody.innerHTML = state.items
            .map(
              (item, idx) => `
              <tr>
                <td class="py-4 px-6 font-medium text-slate-500">${idx + 1}</td>
                <td class="py-4 px-4"><span class="bg-slate-100 text-[#2042B8] font-bold px-2.5 py-1 rounded-md">${escapeHtml(item.kode_mk)}</span></td>
                <td class="py-4 px-4">
                  <p class="font-bold text-slate-800">${escapeHtml(item.nama_mk)}</p>
                  <p class="text-[11px] text-slate-500 mt-0.5">Dosen: ${escapeHtml(item.nama_dosen)}</p>
                </td>
                <td class="py-4 px-4 text-center font-bold">${item.sks}</td>
                <td class="py-4 px-4 text-center"><span class="bg-[#F2EFE6] font-semibold px-2.5 py-1 rounded-md">${escapeHtml(formatKelasLabel(item.id_kelas))}</span></td>
                <td class="py-4 px-6 text-slate-600">
                  <div class="flex items-center gap-1.5">
                    <i data-lucide="clock" class="w-3.5 h-3.5 text-slate-400 shrink-0"></i>
                    <span>${escapeHtml(item.hari)}, ${formatTimeHHMM(item.jam_mulai)} - ${formatTimeHHMM(item.jam_selesai)} (${escapeHtml(item.ruangan)})</span>
                  </div>
                </td>
              </tr>
            `
            )
            .join('');
        }
      }

      const locked = isKrsLockedStatus(status);
      if (actionDraft && actionSubmitted) {
        actionDraft.classList.toggle('hidden', locked);
        actionSubmitted.classList.toggle('hidden', !locked);
        if (locked && actionSubmittedBadge) {
          actionSubmittedBadge.className = `${meta.badgeClass} text-xs font-bold px-5 py-2.5 rounded-full inline-block`;
          actionSubmittedBadge.textContent = meta.label;
        }
      }

      if (modalDesc) {
        const dosenNama =
          state.mhs && state.mhs.dosen_pa ? state.mhs.dosen_pa.nama : 'Dosen PA';
        modalDesc.textContent = `Apakah Anda yakin ingin mengajukan KRS (${totalSks} SKS, ${state.items.length} Mata Kuliah) kepada ${dosenNama}? Data tidak dapat diubah selama menunggu persetujuan.`;
      }

      refreshIcons();
    }

    async function loadData() {
      const [mhs, periode] = await Promise.all([
        fetchMahasiswaProfile(db, session),
        fetchActivePeriode(db),
      ]);
      state.mhs = mhs;
      state.periode = periode;
      state.maxSks = getMaxSksByIps(mhs.ips_semester_lalu);

      if (periode) {
        const { krs, items } = await fetchKrsWithDetails(db, mhs.nim, periode.id_periode);
        state.krs = krs;
        state.items = items;
      }
      render();
    }

    // UC-05 / PC-12: Klik Ajukan KRS
    if (btnAjukan) {
      btnAjukan.addEventListener('click', () => {
        hideAlert();

        // Alt Flow 1: Periode KRS Berakhir
        if (!state.periode || !isPeriodeCurrentlyActive(state.periode)) {
          showAlert('Periode pengajuan KRS telah ditutup.', 'error');
          return;
        }

        // Alt Flow 2: KRS Kosong
        if (!state.krs || state.items.length === 0) {
          showAlert(
            'Anda belum memilih mata kuliah apapun. Silakan pilih mata kuliah terlebih dahulu di halaman <a href="mahasiswa-pengisian-krs.html" class="underline font-bold">Pengisian KRS</a>.',
            'warning'
          );
          return;
        }

        if (isKrsLockedStatus(state.krs.status)) {
          showAlert('KRS Anda sudah diajukan atau telah disetujui.', 'warning');
          return;
        }

        openModal();
      });
    }

    if (btnBatalModal) {
      btnBatalModal.addEventListener('click', closeModal);
    }

    // UC-05 / PC-13: Konfirmasi Pengajuan KRS
    if (btnKonfirmasiModal) {
      btnKonfirmasiModal.addEventListener('click', async () => {
        if (state.submitting || !state.krs) return;
        state.submitting = true;
        btnKonfirmasiModal.disabled = true;

        try {
          const totalSks = state.items.reduce((sum, i) => sum + Number(i.sks || 0), 0);
          const nowIso = new Date().toISOString();

          const { error: updErr } = await db
            .from('krs')
            .update({
              status: 'Menunggu Persetujuan',
              tanggal_pengajuan: nowIso,
              total_sks: totalSks,
            })
            .eq('id_krs', state.krs.id_krs);

          if (updErr) throw new Error(`Gagal mengajukan KRS: ${updErr.message}`);

          // Kirim notifikasi ke Dosen PA (id_penerima -> pengguna.id_pengguna)
          const dosenPenggunaId =
            state.mhs && state.mhs.dosen_pa ? state.mhs.dosen_pa.id_pengguna : null;
          await kirimNotifikasi(
            db,
            dosenPenggunaId,
            `KRS ${state.mhs.nama} (${state.mhs.nim}) sebesar ${totalSks} SKS menunggu persetujuan Anda.`
          );

          // Catat ke log_aktivitas
          await logAktivitas(db, session.id_pengguna, 'mengajukan KRS');

          closeModal();
          await loadData();
          showAlert(
            'KRS berhasil diajukan! Status KRS kini <strong>Menunggu Persetujuan</strong> dan notifikasi telah dikirim ke Dosen PA.',
            'success'
          );
        } catch (err) {
          console.error('[SIAM KRS Saya] Error konfirmasiPengajuan:', err);
          closeModal();
          showAlert(`Gagal mengajukan KRS: ${escapeHtml(err.message)}`, 'error');
        } finally {
          state.submitting = false;
          btnKonfirmasiModal.disabled = false;
        }
      });
    }

    try {
      await loadData();
    } catch (err) {
      console.error('[SIAM KRS Saya] Load Error:', err);
      showAlert(`Gagal memuat data KRS: ${escapeHtml(err.message)}`, 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // 6. PAGE 4: STATUS KRS (mahasiswa-status-krs.html — UC-06)
  // ---------------------------------------------------------------------------

  async function initStatusKrs(db, session) {
    try {
      const [mhs, periode] = await Promise.all([
        fetchMahasiswaProfile(db, session),
        fetchActivePeriode(db),
      ]);

      const maxSks = getMaxSksByIps(mhs.ips_semester_lalu);
      const { krs, items } = periode
        ? await fetchKrsWithDetails(db, mhs.nim, periode.id_periode)
        : { krs: null, items: [] };

      const [catatanRes, logRes] = await Promise.all([
        krs
          ? db
              .from('catatan_revisi')
              .select('id_catatan, id_krs, id_dosen_pa, catatan, tanggal, dosen_pa(nidn, nama)')
              .eq('id_krs', krs.id_krs)
              .order('tanggal', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        db
          .from('log_aktivitas')
          .select('id_log, aktivitas, waktu')
          .eq('id_pengguna', session.id_pengguna)
          .order('waktu', { ascending: false })
          .limit(10),
      ]);

      const catatanList = catatanRes.data || [];
      const logs = logRes.data || [];
      const status = krs ? krs.status : null;
      const statusMeta = getStatusMeta(status);
      const totalSks = items.reduce((sum, i) => sum + Number(i.sks || 0), 0);

      // Banner jika belum mengajukan KRS (UC-06 Alt Flow 1)
      const emptyBanner = document.getElementById('bannerBelumAjukan');
      if (emptyBanner) {
        const belumDiajukan = !krs || status === 'KRS Sementara' || status === 'Draft';
        emptyBanner.classList.toggle('hidden', !belumDiajukan);
      }

      // Col 1: Status Validasi & Stepper
      const badgeEl = document.getElementById('statusValidasiBadge');
      if (badgeEl) {
        badgeEl.className = `inline-flex items-center gap-1.5 ${statusMeta.badgeClass} text-xs font-bold px-3 py-1 rounded-full`;
        badgeEl.innerHTML = `<span class="w-2 h-2 rounded-full ${statusMeta.dotClass}"></span> ${escapeHtml(statusMeta.label)}`;
      }

      const stepperEl = document.getElementById('statusStepper');
      if (stepperEl) {
        const activeM = status === 'Menunggu Persetujuan' ? 'text-amber-600 underline' : 'text-slate-400';
        const activeR = status === 'Perlu Revisi' ? 'text-red-600 underline' : 'text-slate-400';
        const activeD = status === 'Disetujui' ? 'text-emerald-600 underline' : 'text-slate-400';
        stepperEl.innerHTML = `
          <span class="${activeM}">Menunggu</span>
          <span class="text-slate-300">›</span>
          <span class="${activeR}">Revisi</span>
          <span class="text-slate-300">›</span>
          <span class="${activeD}">Disetujui</span>
        `;
      }

      // Col 2: Dosen PA
      const dosenNama = mhs.dosen_pa ? mhs.dosen_pa.nama : '-';
      const dosenNidn = mhs.dosen_pa ? mhs.dosen_pa.nidn : mhs.id_dosen_pa || '-';
      const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };
      setText('statusDosenInitials', getInitials(dosenNama));
      setText('statusDosenNama', dosenNama);
      setText('statusDosenNidn', `NIDN. ${dosenNidn}`);

      // Col 3: Waktu Pengajuan
      if (krs && krs.tanggal_pengajuan) {
        const d = new Date(krs.tanggal_pengajuan);
        setText(
          'statusTglPengajuan',
          d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
        );
        setText(
          'statusJamPengajuan',
          `Pukul ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':')} WIB`
        );
      } else {
        setText('statusTglPengajuan', 'Belum diajukan');
        setText('statusJamPengajuan', 'Silakan ajukan di menu KRS Saya');
      }

      // Col 4: Beban SKS & Periode
      const sksEl = document.getElementById('statusTotalSks');
      if (sksEl) {
        sksEl.innerHTML = `${totalSks} <span class="text-xs font-medium text-slate-400">/ ${maxSks}</span>`;
      }
      setText('statusPeriodePill', periode ? periode.semester : '-');

      // Kotak Catatan Revisi (Hanya muncul jika status === 'Perlu Revisi')
      const cardRevisi = document.getElementById('cardCatatanRevisi');
      if (cardRevisi) {
        if (status === 'Perlu Revisi') {
          cardRevisi.classList.remove('hidden');
          const latest = catatanList[0];
          setText(
            'catatanRevisiIsi',
            latest ? `"${latest.catatan}"` : '"Dosen PA meminta revisi pada rencana studi Anda."'
          );
          const author = latest && latest.dosen_pa ? latest.dosen_pa.nama : dosenNama;
          const timeStr = latest ? formatDateID(latest.tanggal, true) : '-';
          const metaEl = document.getElementById('catatanRevisiMeta');
          if (metaEl) {
            metaEl.innerHTML = `Disampaikan oleh ${escapeHtml(author)} • ${escapeHtml(timeStr)} • <span class="text-red-600 font-bold">Perlu Revisi</span>`;
          }
        } else {
          cardRevisi.classList.add('hidden');
        }
      }

      // Tabel Daftar MK yang Diajukan
      setText('statusMkCountBadge', `${items.length} Mata Kuliah (${totalSks} SKS)`);
      const tbody = document.getElementById('tbodyStatusKrs');
      if (tbody) {
        if (items.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="6" class="py-10 px-6 text-center text-slate-400">
                Belum ada mata kuliah pada KRS periode ini.
              </td>
            </tr>
          `;
        } else {
          const rowStatusBadge =
            status === 'Disetujui'
              ? `<span class="bg-emerald-50 text-emerald-700 font-bold px-3 py-1 rounded-full inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> Disetujui</span>`
              : status === 'Perlu Revisi'
              ? `<span class="bg-red-50 text-red-700 font-bold px-3 py-1 rounded-full inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-red-600"></span> Perlu Revisi</span>`
              : status === 'Menunggu Persetujuan'
              ? `<span class="bg-amber-50 text-amber-700 font-bold px-3 py-1 rounded-full inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Menunggu Validasi</span>`
              : `<span class="bg-blue-50 text-[#2042B8] font-bold px-3 py-1 rounded-full inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-[#2042B8]"></span> Draf Sementara</span>`;

          tbody.innerHTML = items
            .map(
              (item) => `
              <tr>
                <td class="py-4 px-6 font-bold text-[#2042B8]">${escapeHtml(item.kode_mk)}</td>
                <td class="py-4 px-4">
                  <p class="font-bold text-slate-800">${escapeHtml(item.nama_mk)}</p>
                  <p class="text-[11px] text-slate-500 mt-0.5">Dosen: ${escapeHtml(item.nama_dosen)} • Semester ${item.semester}</p>
                </td>
                <td class="py-4 px-4 text-center font-bold">${item.sks}</td>
                <td class="py-4 px-4 text-center"><span class="bg-[#F2EFE6] font-semibold px-2.5 py-1 rounded-md">${escapeHtml(formatKelasLabel(item.id_kelas))}</span></td>
                <td class="py-4 px-4">
                  <p class="font-semibold text-slate-700">${escapeHtml(item.hari)}, ${formatTimeHHMM(item.jam_mulai)} - ${formatTimeHHMM(item.jam_selesai)} WIB</p>
                  <p class="text-[11px] text-slate-500">Ruang ${escapeHtml(item.ruangan)}</p>
                </td>
                <td class="py-4 px-6 text-right">${rowStatusBadge}</td>
              </tr>
            `
            )
            .join('');
        }
      }

      // Footer Bar Tabel (Dinamis sesuai status)
      const footerInfo = document.getElementById('statusFooterInfo');
      const footerActions = document.getElementById('statusFooterActions');
      if (footerInfo && footerActions) {
        if (status === 'Disetujui') {
          footerInfo.textContent = 'KRS Anda telah disetujui oleh Dosen PA dan siap dicetak.';
          footerActions.innerHTML = `
            <a href="mahasiswa-cetak-krs.html" class="bg-[#2042B8] hover:bg-blue-800 text-white text-xs font-semibold px-5 py-2 rounded-full inline-flex items-center gap-1.5 transition">
              <i data-lucide="printer" class="w-3.5 h-3.5"></i> Cetak KRS Resmi
            </a>
          `;
        } else if (status === 'Perlu Revisi') {
          footerInfo.textContent = 'KRS memerlukan revisi mahasiswa sebelum dapat diajukan kembali ke Dosen PA.';
          footerActions.innerHTML = `
            <a href="mahasiswa-pengisian-krs.html" class="bg-[#2042B8] hover:bg-blue-800 text-white text-xs font-semibold px-5 py-2 rounded-full inline-flex items-center gap-1.5 transition">
              Mulai Revisi KRS <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
            </a>
          `;
        } else if (status === 'Menunggu Persetujuan') {
          footerInfo.textContent = 'KRS Anda sedang dalam antrean peninjauan Dosen PA.';
          footerActions.innerHTML = `
            <span class="bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold px-4 py-2 rounded-full">
              Menunggu Review Dosen PA
            </span>
          `;
        } else {
          footerInfo.textContent = 'Anda belum mengajukan KRS. Lengkapi mata kuliah lalu ajukan di menu KRS Saya.';
          footerActions.innerHTML = `
            <a href="mahasiswa-pengisian-krs.html" class="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold px-4 py-2 rounded-full inline-flex items-center gap-1.5 transition">
              Isi KRS
            </a>
            <a href="mahasiswa-krs-saya.html" class="bg-[#2042B8] hover:bg-blue-800 text-white text-xs font-semibold px-5 py-2 rounded-full inline-flex items-center gap-1.5 transition">
              Buka KRS Saya <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
            </a>
          `;
        }
      }

      // Riwayat Aktivitas & Validasi KRS
      setText('riwayatPeriodeSub', `Catatan jejak aktivitas Semester ${periode ? periode.semester : '-'}`);
      const timelineEl = document.getElementById('timelineRiwayatKrs');
      if (timelineEl) {
        const events = [];

        catatanList.forEach((c) => {
          events.push({
            time: new Date(c.tanggal).getTime(),
            dateLabel: formatDateID(c.tanggal, true),
            title: 'Dosen PA Meminta Revisi Rencana Studi',
            desc: c.catatan,
            dotClass: 'bg-red-600',
            cardClass: 'bg-[#FAF8F2]',
            titleClass: 'text-red-700',
          });
        });

        if (krs && krs.tanggal_pengajuan) {
          events.push({
            time: new Date(krs.tanggal_pengajuan).getTime(),
            dateLabel: formatDateID(krs.tanggal_pengajuan, true),
            title: `Pengajuan KRS (${totalSks} SKS)`,
            desc: `Status saat ini: ${status}. Diajukan kepada Dosen PA ${dosenNama}.`,
            dotClass: status === 'Disetujui' ? 'bg-emerald-600' : 'bg-[#2042B8]',
            cardClass: 'bg-slate-50',
            titleClass: 'text-slate-800',
          });
        }

        logs.forEach((l) => {
          const act = String(l.aktivitas || '');
          let title = `Aktivitas: ${act}`;
          if (act === 'login') title = 'Login ke Portal SIAM';
          else if (act === 'logout') title = 'Keluar dari Portal SIAM';
          else if (act === 'mengajukan KRS') title = 'Mahasiswa Mengajukan Draf KRS';
          else if (act === 'cetak KRS') title = 'Mahasiswa Mencetak Dokumen KRS';

          events.push({
            time: new Date(l.waktu).getTime(),
            dateLabel: formatDateID(l.waktu, true),
            title,
            desc: 'Tercatat otomatis pada Log Aktivitas sistem SIAM.',
            dotClass: 'bg-slate-400',
            cardClass: 'bg-slate-50',
            titleClass: 'text-slate-800',
          });
        });

        events.sort((a, b) => b.time - a.time);

        if (events.length === 0) {
          timelineEl.innerHTML = `
            <p class="text-xs text-slate-400 py-4">Belum ada riwayat aktivitas untuk ditampilkan.</p>
          `;
        } else {
          timelineEl.innerHTML = events
            .slice(0, 8)
            .map(
              (ev) => `
              <div class="relative ${ev.cardClass} border border-slate-200/60 rounded-xl p-4">
                <span class="w-3.5 h-3.5 rounded-full ${ev.dotClass} ring-4 ring-white absolute -left-[31px] top-5"></span>
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <h4 class="text-xs font-bold ${ev.titleClass}">${escapeHtml(ev.title)}</h4>
                  <span class="text-[11px] text-slate-500">${escapeHtml(ev.dateLabel)}</span>
                </div>
                <p class="text-xs text-slate-600 mt-1">${escapeHtml(ev.desc)}</p>
              </div>
            `
            )
            .join('');
        }
      }

      refreshIcons();
    } catch (err) {
      console.error('[SIAM Status KRS] Error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // 7. PAGE 5: CETAK KRS (mahasiswa-cetak-krs.html — UC-07)
  // ---------------------------------------------------------------------------

  async function initCetakKrs(db, session) {
    const blockedBox = document.getElementById('cetakBlockedAlert');
    const blockedCountdown = document.getElementById('cetakRedirectCountdown');
    const actionBar = document.getElementById('actionBar');
    const dokumenKrs = document.getElementById('dokumenKrs');
    const btnCetak = document.getElementById('btnCetak');
    const btnUnduhPdf = document.getElementById('btnUnduhPdf');

    try {
      const [mhs, periode] = await Promise.all([
        fetchMahasiswaProfile(db, session),
        fetchActivePeriode(db),
      ]);

      const { krs, items } = periode
        ? await fetchKrsWithDetails(db, mhs.nim, periode.id_periode)
        : { krs: null, items: [] };

      // UC-07 Alt Flow 1: Hanya bisa diakses jika status === 'Disetujui'
      if (!krs || krs.status !== 'Disetujui') {
        if (actionBar) actionBar.classList.add('hidden');
        if (dokumenKrs) dokumenKrs.classList.add('hidden');
        if (blockedBox) blockedBox.classList.remove('hidden');

        let secondsLeft = 3;
        if (blockedCountdown) blockedCountdown.textContent = String(secondsLeft);
        const timer = setInterval(() => {
          secondsLeft -= 1;
          if (blockedCountdown && secondsLeft >= 0) {
            blockedCountdown.textContent = String(secondsLeft);
          }
          if (secondsLeft <= 0) {
            clearInterval(timer);
            global.location.replace('mahasiswa-status-krs.html');
          }
        }, 1000);
        refreshIcons();
        return;
      }

      // Status === 'Disetujui' -> Tampilkan pratinjau dokumen resmi
      if (blockedBox) blockedBox.classList.add('hidden');
      if (actionBar) actionBar.classList.remove('hidden');
      if (dokumenKrs) dokumenKrs.classList.remove('hidden');

      const ips = Number(mhs.ips_semester_lalu || 0);
      const maxSks = getMaxSksByIps(ips);
      const totalSks = items.reduce((sum, i) => sum + Number(i.sks || 0), 0);
      const dosenNama = mhs.dosen_pa ? mhs.dosen_pa.nama : '-';
      const dosenNidn = mhs.dosen_pa ? mhs.dosen_pa.nidn : mhs.id_dosen_pa || '-';
      const semesterLabel = periode ? periode.semester : 'Ganjil 2026/2027';
      const approvedDate = krs.tanggal_pengajuan ? new Date(krs.tanggal_pengajuan) : new Date();
      const today = new Date();

      const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };

      setText('cetakValidasiMeta', `Divalidasi oleh ${dosenNama} pada ${formatDateID(approvedDate, true)}`);
      setText('cetakJudulSemester', `KARTU RENCANA STUDI (KRS) — SEMESTER ${semesterLabel.toUpperCase()}`);
      setText('cetakNama', `: ${mhs.nama}`);
      setText('cetakTahunAkademik', `: ${semesterLabel}`);
      setText('cetakNim', `: ${mhs.nim}`);
      setText('cetakDosenPa', `: ${dosenNama}`);
      setText('cetakProdi', `: ${DEFAULT_PRODI}`);
      setText('cetakMaxSks', `: ${maxSks} SKS`);
      setText('cetakFakultas', `: ${DEFAULT_FAKULTAS}`);
      setText('cetakIpsValue', ips.toFixed(2));

      const totalBar = document.getElementById('cetakTotalSksBar');
      if (totalBar) {
        totalBar.innerHTML = `${totalSks} SKS <span class="font-normal text-slate-500">(Dari batas maksimum ${maxSks} SKS)</span>`;
      }

      setText('cetakVerifyUrl', `siam.ub.ac.id/verify/krs-${mhs.nim}`);
      setText('cetakVerifyHash', `• Kode Dokumen: ${krs.id_krs}`);
      setText('cetakTglMalang', `Malang, ${formatDateID(approvedDate, false)}`);
      setText('cetakTtdDosenNama', dosenNama);
      setText('cetakTtdTimestamp', `Timestamp: ${formatDateID(approvedDate, true)}`);
      setText('cetakDosenNamaBawah', dosenNama);
      setText('cetakDosenNidnBawah', `NIDN. ${dosenNidn}`);
      setText('cetakMhsNamaBawah', mhs.nama);
      setText('cetakMhsNimBawah', `NIM: ${mhs.nim}`);
      setText('cetakTanggalFooter', `Dicetak pada tanggal: ${formatDateID(today, false)}`);

      const tbody = document.getElementById('tbodyCetakKrs');
      if (tbody) {
        tbody.innerHTML = items
          .map(
            (item, idx) => `
            <tr>
              <td class="py-3 px-3 text-center text-slate-500">${idx + 1}</td>
              <td class="py-3 px-3 font-bold text-[#2042B8]">${escapeHtml(item.kode_mk)}</td>
              <td class="py-3 px-3 font-semibold text-slate-800">${escapeHtml(item.nama_mk)}</td>
              <td class="py-3 px-3 text-center font-bold">${item.sks}</td>
              <td class="py-3 px-3 text-center"><span class="bg-[#F2EFE6] px-2 py-0.5 rounded font-semibold">${escapeHtml(formatKelasLabel(item.id_kelas))}</span></td>
              <td class="py-3 px-3 text-slate-600">${escapeHtml(item.hari)}, ${formatTimeHHMM(item.jam_mulai)} - ${formatTimeHHMM(item.jam_selesai)}<br><span class="text-[11px] text-slate-400">(Ruang ${escapeHtml(item.ruangan)})</span></td>
              <td class="py-3 px-3 text-slate-700">${escapeHtml(item.nama_dosen)}</td>
            </tr>
          `
          )
          .join('');
      }

      // UC-07 / PC-16: Catat log pencetakan KRS ke database saat Cetak / Unduh PDF diklik
      async function handlePrintAction() {
        await logAktivitas(db, session.id_pengguna, 'cetak KRS');
        global.print();
      }

      if (btnCetak) btnCetak.addEventListener('click', handlePrintAction);
      if (btnUnduhPdf) btnUnduhPdf.addEventListener('click', handlePrintAction);

      refreshIcons();
    } catch (err) {
      console.error('[SIAM Cetak KRS] Error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // 8. DISPATCHER & EKSPOR
  // ---------------------------------------------------------------------------

  function bootstrap() {
    if (!global.SIAM_AUTH || typeof global.SIAM_AUTH.getSession !== 'function') return;
    const session = global.SIAM_AUTH.getSession();
    if (!session || session.peran !== 'Mahasiswa') return;
    if (typeof global.getSupabaseClient !== 'function') return;

    const db = global.getSupabaseClient();
    const filename = (global.location.pathname.split('/').pop() || '').toLowerCase();

    if (filename === 'mahasiswa-beranda.html') {
      initBerandaMahasiswa(db, session);
    } else if (filename === 'mahasiswa-pengisian-krs.html') {
      initPengisianKrs(db, session);
    } else if (filename === 'mahasiswa-krs-saya.html') {
      initKrsSaya(db, session);
    } else if (filename === 'mahasiswa-status-krs.html') {
      initStatusKrs(db, session);
    } else if (filename === 'mahasiswa-cetak-krs.html') {
      initCetakKrs(db, session);
    }
  }

  global.SIAM_MAHASISWA_KRS = Object.freeze({
    getMaxSksByIps,
    findScheduleConflict,
    hitungSisaKuota,
    isKrsLockedStatus,
    isPeriodeCurrentlyActive,
    generateIdKrs,
    timeToMinutes,
  });

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
      bootstrap();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
