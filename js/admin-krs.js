/**
 * SIAM UB — Modul KRS Online
 * Tahap 3B: Logic Portal Admin Akademik (Beranda + UC-10 Pengaturan Kuota + UC-11 Kelola MK & Jadwal)
 *
 * Halaman yang ditangani:
 * - admin-beranda.html         (Statistik Dinamis Kelas, Mahasiswa, Keterisian, Konflik & Progres KRS)
 * - admin-kuota-kelas.html     (UC-10 Pengaturan Kuota Kelas dengan validasi kuotaBaru >= terdaftar)
 * - admin-kelola-jadwal.html   (UC-11 CRUD MK & Jadwal dengan anti-bentrok ruangan/dosen & proteksi detail_krs)
 */

(function initAdminKrsModule(global) {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTimeHHMM(timeStr) {
    if (!timeStr) return '--:--';
    const parts = String(timeStr).split(':');
    return `${String(parts[0] || '00').padStart(2, '0')}:${String(parts[1] || '00').padStart(2, '0')}`;
  }

  function normalizeTimePG(timeStr) {
    if (!timeStr) return '08:00:00';
    const parts = String(timeStr).split(':');
    const hh = String(parts[0] || '08').padStart(2, '0');
    const mm = String(parts[1] || '00').padStart(2, '0');
    return `${hh}:${mm}:00`;
  }

  function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = String(timeStr).split(':');
    return parseInt(parts[0] || '0', 10) * 60 + parseInt(parts[1] || '0', 10);
  }

  function formatKelasLabel(idKelas) {
    if (!idKelas) return '-';
    const parts = String(idKelas).split('-');
    return parts.length >= 2 ? `SI-${parts[parts.length - 1]}` : idKelas;
  }

  function buildIdKelas(kodeMk, namaKelas) {
    const cleanKode = String(kodeMk || '').trim().toUpperCase();
    const cleanKelas = String(namaKelas || 'A')
      .trim()
      .toUpperCase()
      .replace(/^SI-/, '')
      .replace(/^TI-/, '')
      .replace(/\s+/g, '');
    const id = `${cleanKode}-${cleanKelas || 'A'}`;
    return id.slice(0, 15);
  }

  function inferProgramStudi(kodeMk) {
    const up = String(kodeMk || '').toUpperCase();
    if (up.startsWith('TI') || up.startsWith('IF') || up.startsWith('COM') || up.startsWith('CIF')) {
      return 'S1 Teknik Informatika';
    }
    return 'S1 Sistem Informasi';
  }

  function refreshIcons() {
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons();
    }
  }

  /**
   * UC-11 / PC-26: Cek bentrok jadwal ruangan ATAU dosen pengampu
   * pada periode dan hari yang sama dengan tumpang tindih jam.
   */
  function findAdminScheduleConflict(candidate, existingClasses, excludeIdKelas = null) {
    const hariCand = String(candidate.hari || '').trim().toLowerCase();
    const ruangCand = String(candidate.ruangan || '').trim().toLowerCase();
    const dosenCand = String(candidate.id_dosen || '').trim();
    const startCand = timeToMinutes(candidate.jam_mulai);
    const endCand = timeToMinutes(candidate.jam_selesai);

    for (const k of existingClasses) {
      if (excludeIdKelas && k.id_kelas === excludeIdKelas) continue;
      if (String(k.hari || '').trim().toLowerCase() !== hariCand) continue;

      const startK = timeToMinutes(k.jam_mulai);
      const endK = timeToMinutes(k.jam_selesai);
      const overlap = startCand < endK && startK < endCand;
      if (!overlap) continue;

      const roomConflict = String(k.ruangan || '').trim().toLowerCase() === ruangCand;
      const dosenConflict = String(k.id_dosen || '').trim() === dosenCand;

      if (roomConflict || dosenConflict) {
        return {
          conflictWith: k,
          roomConflict,
          dosenConflict,
        };
      }
    }
    return null;
  }

  /**
   * Menghitung jumlah pasangan konflik ruangan/dosen yang terdeteksi pada daftar kelas aktif.
   */
  function detectConflictClassIds(kelasList) {
    const conflictedIds = new Set();
    let conflictPairs = 0;

    for (let i = 0; i < kelasList.length; i++) {
      for (let j = i + 1; j < kelasList.length; j++) {
        const a = kelasList[i];
        const b = kelasList[j];
        if (String(a.hari || '').toLowerCase() !== String(b.hari || '').toLowerCase()) continue;

        const overlap =
          timeToMinutes(a.jam_mulai) < timeToMinutes(b.jam_selesai) &&
          timeToMinutes(b.jam_mulai) < timeToMinutes(a.jam_selesai);
        if (!overlap) continue;

        const sameRoom = String(a.ruangan || '').trim().toLowerCase() === String(b.ruangan || '').trim().toLowerCase();
        const sameDosen = String(a.id_dosen || '') === String(b.id_dosen || '');
        if (sameRoom || sameDosen) {
          conflictPairs += 1;
          conflictedIds.add(a.id_kelas);
          conflictedIds.add(b.id_kelas);
        }
      }
    }
    return { conflictPairs, conflictedIds };
  }

  // ---------------------------------------------------------------------------
  // DATA ACCESS HELPERS
  // ---------------------------------------------------------------------------

  async function fetchActivePeriode(db) {
    const { data, error } = await db
      .from('periode_krs')
      .select('id_periode, semester, tanggal_mulai, tanggal_selesai')
      .order('tanggal_mulai', { ascending: false });

    if (error) throw new Error(`Gagal memuat periode KRS: ${error.message}`);
    if (!data || data.length === 0) return null;

    const now = new Date();
    const todayStr = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');

    return data.find((p) => todayStr >= p.tanggal_mulai && todayStr <= p.tanggal_selesai) || data[0];
  }

  async function fetchAdminClasses(db, idPeriode) {
    const { data: kelasRows, error: kelasErr } = await db
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

    const idList = (kelasRows || []).map((k) => k.id_kelas);
    const countMap = {};

    if (idList.length > 0) {
      const { data: enrollments, error: enrErr } = await db
        .from('detail_krs')
        .select('id_kelas')
        .in('id_kelas', idList);

      if (enrErr) throw new Error(`Gagal memuat data pendaftar: ${enrErr.message}`);

      (enrollments || []).forEach((row) => {
        countMap[row.id_kelas] = (countMap[row.id_kelas] || 0) + 1;
      });
    }

    return (kelasRows || []).map((k) => {
      const terdaftar = countMap[k.id_kelas] || 0;
      const kuotaMaks = Number(k.kuota_maks || 0);
      return {
        id_kelas: k.id_kelas,
        kode_mk: k.kode_mk,
        nama_mk: k.mata_kuliah ? k.mata_kuliah.nama_mk : k.kode_mk,
        sks: k.mata_kuliah ? Number(k.mata_kuliah.sks) : 0,
        semester: k.mata_kuliah ? Number(k.mata_kuliah.semester) : 1,
        hari: k.hari,
        jam_mulai: k.jam_mulai,
        jam_selesai: k.jam_selesai,
        ruangan: k.ruangan,
        kuota_maks: kuotaMaks,
        terdaftar,
        sisa_kuota: Math.max(0, kuotaMaks - terdaftar),
        id_dosen: k.id_dosen,
        nama_dosen: k.dosen_pa ? k.dosen_pa.nama : '-',
        program_studi: inferProgramStudi(k.kode_mk),
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
      console.warn('[SIAM Admin] Gagal mencatat log_aktivitas:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. BERANDA ADMIN AKADEMIK (admin-beranda.html)
  // ---------------------------------------------------------------------------

  async function initBerandaAdmin(db) {
    try {
      const periode = await fetchActivePeriode(db);
      const idPeriode = periode ? periode.id_periode : null;

      const [kelasList, mhsRes, krsRes] = await Promise.all([
        idPeriode ? fetchAdminClasses(db, idPeriode) : Promise.resolve([]),
        db.from('mahasiswa').select('nim', { count: 'exact', head: true }),
        idPeriode
          ? db.from('krs').select('id_krs, status').eq('id_periode', idPeriode)
          : Promise.resolve({ data: [] }),
      ]);

      const totalKelas = kelasList.length;
      const totalTerdaftarKursi = kelasList.reduce((sum, k) => sum + k.terdaftar, 0);
      const totalDayaTampung = kelasList.reduce((sum, k) => sum + k.kuota_maks, 0);
      const kelasPenuh = kelasList.filter((k) => k.kuota_maks > 0 && k.terdaftar >= k.kuota_maks).length;
      const rasio = totalDayaTampung > 0 ? ((totalTerdaftarKursi / totalDayaTampung) * 100).toFixed(1) : '0.0';
      const { conflictPairs } = detectConflictClassIds(kelasList);

      const totalMahasiswa = mhsRes.count || 0;
      const krsRows = krsRes.data || [];
      const krsDiajukan = krsRows.filter((k) => k.status !== 'KRS Sementara').length;
      const progresPct = totalMahasiswa > 0 ? Math.round((krsDiajukan / totalMahasiswa) * 100) : 0;

      const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };

      setText('adminStatTotalKelas', String(totalKelas));
      setText('adminStatTotalMhs', String(totalMahasiswa));
      setText('adminStatKelasPenuh', String(kelasPenuh));
      setText('adminStatRasioKeterisian', `${rasio}%`);
      setText('adminPerhatianPenuhCount', String(kelasPenuh));
      setText('adminPerhatianKonflikCount', String(conflictPairs));
      setText(
        'adminPeriodeStatusTitle',
        periode ? `Periode KRS ${periode.semester} sedang berlangsung` : 'Periode KRS belum dikonfigurasi'
      );
      setText(
        'adminPeriodeProgresText',
        `${krsDiajukan} dari ${totalMahasiswa} mahasiswa telah mengajukan KRS (${progresPct}%).`
      );

      const bar = document.getElementById('adminPeriodeProgressBar');
      if (bar) bar.style.width = `${progresPct}%`;
    } catch (err) {
      console.error('[SIAM Beranda Admin] Error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. PENGATURAN KUOTA KELAS (admin-kuota-kelas.html — UC-10)
  // ---------------------------------------------------------------------------

  async function initPengaturanKuota(db, session) {
    const tbody = document.getElementById('tbodyKuotaKelas');
    const searchInput = document.getElementById('searchKelas');
    const filterProgramBar = document.getElementById('filterProgramKuota');
    const formKuota = document.getElementById('formKuota');
    const inputKuotaBaru = document.getElementById('inputKuotaBaru');
    const btnKurang = document.getElementById('btnKurangKuota');
    const btnTambah = document.getElementById('btnTambahKuota');
    const btnReset = document.getElementById('btnBatalPilihanKuota');
    const alertKuota = document.getElementById('alertKuotaForm');

    const state = {
      periode: null,
      kelasList: [],
      selectedIdKelas: null,
      keyword: '',
      programFilter: 'ALL',
      busy: false,
    };

    function setText(id, text) {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    }

    function showKuotaAlert(message, type = 'success') {
      if (!alertKuota) return;
      alertKuota.classList.remove(
        'hidden',
        'bg-emerald-50',
        'border-emerald-200',
        'text-emerald-800',
        'bg-red-50',
        'border-red-200',
        'text-red-800'
      );
      if (type === 'error') {
        alertKuota.classList.add('bg-red-50', 'border-red-200', 'text-red-800');
      } else {
        alertKuota.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
      }
      alertKuota.textContent = message;
    }

    function hideKuotaAlert() {
      if (alertKuota) alertKuota.classList.add('hidden');
    }

    function renderStats() {
      const totalKelas = state.kelasList.length;
      const totalTerdaftar = state.kelasList.reduce((s, k) => s + k.terdaftar, 0);
      const totalKapasitas = state.kelasList.reduce((s, k) => s + k.kuota_maks, 0);
      const penuh = state.kelasList.filter((k) => k.kuota_maks > 0 && k.terdaftar >= k.kuota_maks).length;
      const tersedia = totalKelas - penuh;
      const rasio = totalKapasitas > 0 ? ((totalTerdaftar / totalKapasitas) * 100).toFixed(1) : '0.0';

      setText('kuotaStatTotalKelas', String(totalKelas));
      setText('kuotaStatTerdaftar', String(totalTerdaftar));
      setText('kuotaStatDayaTampung', `Dari ${totalKapasitas} daya tampung`);
      setText('kuotaStatKelasPenuh', String(penuh));
      setText('kuotaStatRasio', `${rasio}%`);
      setText('kuotaPeriodeBadge', state.periode ? state.periode.semester : '-');
      setText('kuotaSidebarPeriode', state.periode ? `Tahun Ajaran ${state.periode.semester}` : '');
      setText('kuotaCountTersedia', `${tersedia} Tersedia`);
      setText('kuotaCountPenuh', `${penuh} Penuh`);
    }

    function renderFilterButtons() {
      if (!filterProgramBar) return;
      filterProgramBar.querySelectorAll('[data-program-filter]').forEach((btn) => {
        const active = btn.dataset.programFilter === state.programFilter;
        btn.className = active
          ? 'bg-[#2042B8] text-white font-semibold px-3 py-1 rounded-full text-[11px] transition'
          : 'bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium px-3 py-1 rounded-full text-[11px] transition';
      });
    }

    function renderFormPanel() {
      const k = state.kelasList.find((item) => item.id_kelas === state.selectedIdKelas);
      if (!k) {
        setText('kuotaFormJudul', 'Belum ada kelas terpilih');
        setText('kuotaFormTerdaftar', 'Terdaftar: 0 Mahasiswa');
        setText('kuotaFormKapasitas', '0 / 0 (0%)');
        setText('kuotaFormMinHint', 'Batas minimum: 0');
        setText('kuotaFormWarningMin', '(min. 0)');
        if (inputKuotaBaru) {
          inputKuotaBaru.value = '';
          inputKuotaBaru.min = '0';
        }
        const bar = document.getElementById('kuotaFormBar');
        if (bar) bar.style.width = '0%';
        return;
      }

      const pct = k.kuota_maks > 0 ? Math.min(100, Math.round((k.terdaftar / k.kuota_maks) * 100)) : 0;
      setText('kuotaFormJudul', `${k.id_kelas} – ${k.nama_mk}`);
      setText('kuotaFormTerdaftar', `Terdaftar: ${k.terdaftar} Mahasiswa`);
      setText('kuotaFormKapasitas', `${k.terdaftar} / ${k.kuota_maks} (${pct}%)`);
      setText('kuotaFormMinHint', `Batas minimum: ${k.terdaftar}`);
      setText('kuotaFormWarningMin', `(min. ${k.terdaftar})`);

      const bar = document.getElementById('kuotaFormBar');
      if (bar) {
        bar.style.width = `${pct}%`;
        bar.className =
          pct >= 100
            ? 'h-full bg-red-500 rounded-full transition-all'
            : pct >= 70
            ? 'h-full bg-amber-400 rounded-full transition-all'
            : 'h-full bg-emerald-500 rounded-full transition-all';
      }

      if (inputKuotaBaru) {
        inputKuotaBaru.min = String(k.terdaftar);
        inputKuotaBaru.value = String(k.kuota_maks);
      }
    }

    function renderTable() {
      if (!tbody) return;
      const kw = state.keyword.trim().toLowerCase();
      const filtered = state.kelasList.filter((k) => {
        if (state.programFilter !== 'ALL' && k.program_studi !== state.programFilter) {
          return false;
        }
        if (!kw) return true;
        const hay = `${k.kode_mk} ${k.nama_mk} ${k.id_kelas} ${k.nama_dosen} ${k.ruangan}`.toLowerCase();
        return hay.includes(kw);
      });

      setText('kuotaPaginationInfo', `Menampilkan ${filtered.length} dari ${state.kelasList.length} kelas semester ini`);

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 px-4 text-center text-slate-400">Tidak ada kelas yang cocok dengan filter.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered
        .map((k) => {
          const isSelected = k.id_kelas === state.selectedIdKelas;
          const isFull = k.kuota_maks > 0 && k.terdaftar >= k.kuota_maks;
          const rowCls = isSelected
            ? 'bg-blue-50/50 border-l-4 border-[#2042B8]'
            : 'hover:bg-slate-50 transition';

          const kuotaBadge = isFull
            ? `<span class="bg-red-50 text-red-600 font-bold px-2.5 py-0.5 rounded-full">${k.kuota_maks} (Penuh)</span>`
            : k.sisa_kuota <= 5
            ? `<span class="bg-amber-50 text-amber-700 font-bold px-2.5 py-0.5 rounded-full">• ${k.kuota_maks}</span>`
            : `<span class="bg-emerald-50 text-emerald-700 font-bold px-2.5 py-0.5 rounded-full">• ${k.kuota_maks}</span>`;

          const btnHtml = isSelected
            ? `<button type="button" data-select-kuota="${escapeHtml(k.id_kelas)}" class="bg-[#2042B8] text-white text-[11px] font-semibold px-3 py-1.5 rounded-full inline-flex items-center gap-1"><i data-lucide="check-circle-2" class="w-3 h-3"></i> Terpilih</button>`
            : `<button type="button" data-select-kuota="${escapeHtml(k.id_kelas)}" class="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-semibold px-3 py-1.5 rounded-full">Pilih →</button>`;

          return `
            <tr class="${rowCls}">
              <td class="py-3.5 px-4 font-bold ${isSelected ? 'text-[#2042B8]' : 'text-slate-700'}">${escapeHtml(k.kode_mk)}</td>
              <td class="py-3.5 px-4">
                <p class="font-bold text-slate-900">${escapeHtml(k.nama_mk)}</p>
                <p class="text-[11px] text-slate-500">${k.sks} SKS • ${escapeHtml(k.program_studi)} • ${escapeHtml(k.ruangan)}</p>
              </td>
              <td class="py-3.5 px-3 text-center"><span class="bg-[#F2EFE6] font-semibold px-2 py-0.5 rounded">${escapeHtml(formatKelasLabel(k.id_kelas))}</span></td>
              <td class="py-3.5 px-3 text-center font-bold ${isFull ? 'text-red-600' : ''}">${k.terdaftar}</td>
              <td class="py-3.5 px-3 text-center">${kuotaBadge}</td>
              <td class="py-3.5 px-4 text-right">${btnHtml}</td>
            </tr>
          `;
        })
        .join('');

      refreshIcons();
    }

    async function loadData(keepSelectedId = null) {
      state.periode = await fetchActivePeriode(db);
      state.kelasList = state.periode ? await fetchAdminClasses(db, state.periode.id_periode) : [];

      if (keepSelectedId && state.kelasList.some((k) => k.id_kelas === keepSelectedId)) {
        state.selectedIdKelas = keepSelectedId;
      } else if (!state.selectedIdKelas && state.kelasList.length > 0) {
        state.selectedIdKelas = state.kelasList[0].id_kelas;
      }

      renderStats();
      renderFilterButtons();
      renderTable();
      renderFormPanel();
    }

    // Bind events
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        state.keyword = searchInput.value;
        renderTable();
      });
    }

    if (filterProgramBar) {
      filterProgramBar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-program-filter]');
        if (!btn) return;
        state.programFilter = btn.dataset.programFilter;
        renderFilterButtons();
        renderTable();
      });
    }

    if (tbody) {
      tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-select-kuota]');
        if (!btn) return;
        state.selectedIdKelas = btn.dataset.selectKuota;
        hideKuotaAlert();
        renderTable();
        renderFormPanel();
      });
    }

    function adjustKuota(delta) {
      if (!inputKuotaBaru) return;
      const cur = parseInt(inputKuotaBaru.value || '0', 10);
      const next = Math.max(0, cur + delta);
      inputKuotaBaru.value = String(next);
    }
    if (btnKurang) btnKurang.addEventListener('click', () => adjustKuota(-1));
    if (btnTambah) btnTambah.addEventListener('click', () => adjustKuota(1));

    if (btnReset) {
      btnReset.addEventListener('click', (e) => {
        e.preventDefault();
        hideKuotaAlert();
        renderFormPanel();
      });
    }

    // UC-10 / PC-24: Simpan Perubahan Kuota
    if (formKuota) {
      formKuota.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (state.busy) return;
        hideKuotaAlert();

        const selected = state.kelasList.find((k) => k.id_kelas === state.selectedIdKelas);
        if (!selected) {
          showKuotaAlert('Silakan pilih kelas terlebih dahulu dari tabel.', 'error');
          return;
        }

        const kuotaBaru = parseInt(inputKuotaBaru ? inputKuotaBaru.value : '', 10);
        if (Number.isNaN(kuotaBaru) || kuotaBaru < 0) {
          showKuotaAlert('Masukkan angka kuota yang valid.', 'error');
          return;
        }

        state.busy = true;
        try {
          // Validasi real-time jumlah mahasiswa terdaftar di detail_krs
          const { count: jumlahTerdaftar, error: cntErr } = await db
            .from('detail_krs')
            .select('id_kelas', { count: 'exact', head: true })
            .eq('id_kelas', selected.id_kelas);

          if (cntErr) throw new Error(cntErr.message);

          const registered = jumlahTerdaftar || 0;
          if (kuotaBaru < registered) {
            showKuotaAlert(
              `Kuota baru tidak boleh lebih kecil dari jumlah mahasiswa yang sudah terdaftar (${registered} mahasiswa).`,
              'error'
            );
            return;
          }

          const { error: updErr } = await db
            .from('kelas_mk')
            .update({ kuota_maks: kuotaBaru })
            .eq('id_kelas', selected.id_kelas);

          if (updErr) throw new Error(`Gagal memperbarui kuota: ${updErr.message}`);

          await logAktivitas(
            db,
            session.id_pengguna,
            `ubah kuota ${selected.id_kelas} menjadi ${kuotaBaru}`
          );

          await loadData(selected.id_kelas);
          showKuotaAlert(
            `Kuota berhasil diperbarui! Kuota ${selected.id_kelas} kini ${kuotaBaru} mahasiswa.`,
            'success'
          );
        } catch (err) {
          console.error('[SIAM Kuota Kelas] Error:', err);
          showKuotaAlert(err.message || 'Gagal memperbarui kuota.', 'error');
        } finally {
          state.busy = false;
        }
      });
    }

    try {
      await loadData();
    } catch (err) {
      console.error('[SIAM Kuota Kelas] Load Error:', err);
      showKuotaAlert(`Gagal memuat data kelas: ${err.message}`, 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // 3. KELOLA DATA MATA KULIAH & JADWAL (admin-kelola-jadwal.html — UC-11)
  // ---------------------------------------------------------------------------

  async function initKelolaJadwal(db, session) {
    const tbody = document.getElementById('tbodyJadwalAdmin');
    const searchInput = document.getElementById('searchJadwalAdmin');
    const filterSemester = document.getElementById('filterSemesterAdmin');
    const btnModeTambah = document.getElementById('btnTambahJadwal');
    const formSection = document.getElementById('formJadwalSection');
    const form = document.getElementById('formKelolaJadwal');
    const modeBadge = document.getElementById('badgeModeJadwal');
    const alertBox = document.getElementById('alertJadwalAdmin');
    const alertTitle = document.getElementById('alertJadwalTitle');
    const alertDesc = document.getElementById('alertJadwalDesc');

    const inputKodeMk = document.getElementById('inputKodeMk');
    const inputNamaMk = document.getElementById('inputNamaMk');
    const inputSks = document.getElementById('inputSks');
    const inputSemester = document.getElementById('inputSemester');
    const inputNamaKelas = document.getElementById('inputNamaKelas');
    const inputKuotaAwal = document.getElementById('inputKuotaAwal');
    const inputHari = document.getElementById('inputHari');
    const inputJamMulai = document.getElementById('inputJamMulai');
    const inputJamSelesai = document.getElementById('inputJamSelesai');
    const inputRuangan = document.getElementById('inputRuangan');
    const inputDosen = document.getElementById('inputDosenPengampu');
    const btnBatalForm = document.getElementById('btnBatalFormJadwal');
    const btnSimpanForm = document.getElementById('btnSimpanFormJadwal');

    const modalHapus = document.getElementById('modalHapusKelas');
    const modalHapusDesc = document.getElementById('modalHapusKelasDesc');
    const btnBatalHapus = document.getElementById('btnBatalHapusKelas');
    const btnKonfirmasiHapus = document.getElementById('btnKonfirmasiHapusKelas');

    const state = {
      periode: null,
      kelasList: [],
      dosenList: [],
      mode: 'TAMBAH', // 'TAMBAH' | 'UBAH'
      editingIdKelas: null,
      deletingIdKelas: null,
      keyword: '',
      semesterFilter: 'ALL',
      busy: false,
    };

    function setText(id, text) {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    }

    function showFormAlert(title, desc = '', type = 'error') {
      if (!alertBox || !alertTitle) return;
      alertBox.classList.remove(
        'hidden',
        'bg-red-50',
        'border-red-200',
        'text-red-800',
        'bg-emerald-50',
        'border-emerald-200',
        'text-emerald-800'
      );
      if (type === 'success') {
        alertBox.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
      } else {
        alertBox.classList.add('bg-red-50', 'border-red-200', 'text-red-800');
      }
      alertTitle.textContent = title;
      if (alertDesc) {
        alertDesc.textContent = desc;
        alertDesc.classList.toggle('hidden', !desc);
      }
    }

    function hideFormAlert() {
      if (alertBox) alertBox.classList.add('hidden');
    }

    function resetToTambahMode() {
      state.mode = 'TAMBAH';
      state.editingIdKelas = null;
      if (form) form.reset();
      if (inputKodeMk) inputKodeMk.readOnly = false;
      if (inputNamaKelas) inputNamaKelas.readOnly = false;
      if (inputKuotaAwal) inputKuotaAwal.value = '40';
      if (inputJamMulai) inputJamMulai.value = '08:00';
      if (inputJamSelesai) inputJamSelesai.value = '10:30';
      if (modeBadge) {
        modeBadge.textContent = 'MODE TAMBAH BARU';
        modeBadge.className = 'bg-emerald-400 text-slate-900 text-[11px] font-extrabold px-3.5 py-1 rounded-full';
      }
      if (btnSimpanForm) {
        btnSimpanForm.innerHTML = `<i data-lucide="save" class="w-3.5 h-3.5"></i> Simpan Mata Kuliah &amp; Jadwal`;
      }
      refreshIcons();
    }

    function fillEditMode(kelas) {
      state.mode = 'UBAH';
      state.editingIdKelas = kelas.id_kelas;
      hideFormAlert();

      if (inputKodeMk) {
        inputKodeMk.value = kelas.kode_mk;
        inputKodeMk.readOnly = true;
      }
      if (inputNamaMk) inputNamaMk.value = kelas.nama_mk;
      if (inputSks) inputSks.value = String(kelas.sks);
      if (inputSemester) inputSemester.value = String(kelas.semester);
      if (inputNamaKelas) {
        inputNamaKelas.value = formatKelasLabel(kelas.id_kelas);
        inputNamaKelas.readOnly = true;
      }
      if (inputKuotaAwal) inputKuotaAwal.value = String(kelas.kuota_maks);
      if (inputHari) inputHari.value = kelas.hari;
      if (inputJamMulai) inputJamMulai.value = formatTimeHHMM(kelas.jam_mulai);
      if (inputJamSelesai) inputJamSelesai.value = formatTimeHHMM(kelas.jam_selesai);
      if (inputRuangan) inputRuangan.value = kelas.ruangan;
      if (inputDosen) inputDosen.value = kelas.id_dosen;

      if (modeBadge) {
        modeBadge.textContent = `MODE EDIT: ${kelas.id_kelas}`;
        modeBadge.className = 'bg-amber-400 text-slate-900 text-[11px] font-extrabold px-3.5 py-1 rounded-full';
      }
      if (btnSimpanForm) {
        btnSimpanForm.innerHTML = `<i data-lucide="save" class="w-3.5 h-3.5"></i> Simpan Perubahan Jadwal`;
      }

      if (formSection) formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      refreshIcons();
    }

    function openDeleteModal(kelas) {
      state.deletingIdKelas = kelas.id_kelas;
      if (modalHapusDesc) {
        modalHapusDesc.textContent = `Apakah Anda yakin ingin menghapus kelas ${kelas.id_kelas} (${kelas.nama_mk} — ${kelas.hari}, ${formatTimeHHMM(kelas.jam_mulai)}-${formatTimeHHMM(kelas.jam_selesai)})?`;
      }
      if (modalHapus) {
        modalHapus.classList.remove('hidden');
        modalHapus.classList.add('flex');
      }
    }

    function closeDeleteModal() {
      state.deletingIdKelas = null;
      if (modalHapus) {
        modalHapus.classList.add('hidden');
        modalHapus.classList.remove('flex');
      }
    }

    function populateDosenSelect() {
      if (!inputDosen) return;
      inputDosen.innerHTML = state.dosenList
        .map(
          (d) =>
            `<option value="${escapeHtml(d.nidn)}">${escapeHtml(d.nama)} (NIDN: ${escapeHtml(d.nidn)})</option>`
        )
        .join('');
    }

    function renderStats() {
      const totalKelas = state.kelasList.length;
      const totalSks = state.kelasList.reduce((s, k) => s + k.sks, 0);
      const dosenSet = new Set(state.kelasList.map((k) => k.id_dosen));
      const { conflictPairs } = detectConflictClassIds(state.kelasList);

      setText('jadwalStatTotalKelas', `${totalKelas} Kelas`);
      setText('jadwalStatTotalSks', `${totalSks} SKS`);
      setText('jadwalStatDosenCount', `${dosenSet.size} Dosen`);
      setText('jadwalStatKonflik', conflictPairs > 0 ? `${conflictPairs} Terdeteksi` : 'Aman (0)');
      setText('jadwalPeriodePill', state.periode ? `SEMESTER ${state.periode.semester.toUpperCase()}` : 'PERIODE AKTIF');
      setText('jadwalSidebarPeriode', state.periode ? `Tahun Ajaran ${state.periode.semester}` : '');
    }

    function renderTable() {
      if (!tbody) return;
      const kw = state.keyword.trim().toLowerCase();
      const { conflictedIds } = detectConflictClassIds(state.kelasList);

      const filtered = state.kelasList.filter((k) => {
        if (state.semesterFilter !== 'ALL' && String(k.semester) !== state.semesterFilter) {
          return false;
        }
        if (!kw) return true;
        const hay = `${k.kode_mk} ${k.nama_mk} ${k.id_kelas} ${k.hari} ${k.ruangan} ${k.nama_dosen}`.toLowerCase();
        return hay.includes(kw);
      });

      setText('jadwalPaginationInfo', `Menampilkan ${filtered.length} dari ${state.kelasList.length} kelas mata kuliah`);

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="py-8 px-5 text-center text-slate-400">Tidak ada data mata kuliah & jadwal yang cocok.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered
        .map((k) => {
          const hasConflict = conflictedIds.has(k.id_kelas);
          const ruangBadge = hasConflict
            ? `<span class="bg-red-50 text-red-600 font-bold px-2.5 py-1 rounded-full">⚠ ${escapeHtml(k.ruangan)}</span>`
            : `<span class="bg-slate-100 text-slate-700 font-semibold px-2.5 py-1 rounded-full">${escapeHtml(k.ruangan)}</span>`;

          const kuotaBadge =
            k.terdaftar >= k.kuota_maks
              ? `<span class="bg-red-50 text-red-600 font-bold px-2.5 py-1 rounded-full">${k.terdaftar}/${k.kuota_maks}</span>`
              : `<span class="bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-full">${k.terdaftar}/${k.kuota_maks}</span>`;

          return `
            <tr class="hover:bg-slate-50 transition">
              <td class="py-4 px-5 font-bold text-[#2042B8]">${escapeHtml(k.kode_mk)}</td>
              <td class="py-4 px-4">
                <p class="font-bold text-slate-900">${escapeHtml(k.nama_mk)}</p>
                <p class="text-[11px] text-slate-400">${escapeHtml(k.id_kelas)} • ${k.terdaftar > 0 ? `${k.terdaftar} mhs di KRS` : 'Belum di KRS'}</p>
              </td>
              <td class="py-4 px-3 text-center font-bold">${k.sks}</td>
              <td class="py-4 px-3 text-center">${k.semester}</td>
              <td class="py-4 px-3 text-center"><span class="bg-[#F2EFE6] px-2 py-0.5 rounded font-semibold">${escapeHtml(formatKelasLabel(k.id_kelas))}</span></td>
              <td class="py-4 px-4">
                <p class="font-bold text-slate-800">${escapeHtml(k.hari)}</p>
                <p class="text-[11px] text-slate-500">${formatTimeHHMM(k.jam_mulai)} - ${formatTimeHHMM(k.jam_selesai)} WIB</p>
              </td>
              <td class="py-4 px-3 text-center">${ruangBadge}</td>
              <td class="py-4 px-4">
                <p class="font-semibold text-slate-800">${escapeHtml(k.nama_dosen)}</p>
                <p class="text-[10px] text-slate-400">NIDN. ${escapeHtml(k.id_dosen)}</p>
              </td>
              <td class="py-4 px-3 text-center">${kuotaBadge}</td>
              <td class="py-4 px-5 text-right whitespace-nowrap">
                <div class="inline-flex items-center gap-1.5">
                  <button type="button" data-edit-kelas="${escapeHtml(k.id_kelas)}"
                    class="bg-amber-400 hover:bg-amber-500 text-slate-900 text-[11px] font-bold px-3 py-1 rounded-full transition">
                    Ubah
                  </button>
                  <button type="button" data-hapus-kelas="${escapeHtml(k.id_kelas)}"
                    class="bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold px-3 py-1 rounded-full transition">
                    Hapus
                  </button>
                </div>
              </td>
            </tr>
          `;
        })
        .join('');

      refreshIcons();
    }

    async function loadData() {
      const [periode, dosenRes] = await Promise.all([
        fetchActivePeriode(db),
        db.from('dosen_pa').select('nidn, nama').order('nama', { ascending: true }),
      ]);

      state.periode = periode;
      state.dosenList = dosenRes.data || [];
      state.kelasList = periode ? await fetchAdminClasses(db, periode.id_periode) : [];

      populateDosenSelect();
      renderStats();
      renderTable();
    }

    async function isKelasUsedInKrs(idKelas) {
      const { count, error } = await db
        .from('detail_krs')
        .select('id_kelas', { count: 'exact', head: true })
        .eq('id_kelas', idKelas);
      if (error) throw new Error(error.message);
      return (count || 0) > 0;
    }

    // Bind events
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        state.keyword = searchInput.value;
        renderTable();
      });
    }
    if (filterSemester) {
      filterSemester.addEventListener('change', () => {
        state.semesterFilter = filterSemester.value;
        renderTable();
      });
    }
    if (btnModeTambah) {
      btnModeTambah.addEventListener('click', () => {
        hideFormAlert();
        resetToTambahMode();
        if (formSection) formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    if (btnBatalForm) {
      btnBatalForm.addEventListener('click', (e) => {
        e.preventDefault();
        hideFormAlert();
        resetToTambahMode();
      });
    }

    if (tbody) {
      tbody.addEventListener('click', (e) => {
        const editBtn = e.target.closest('[data-edit-kelas]');
        if (editBtn) {
          const target = state.kelasList.find((k) => k.id_kelas === editBtn.dataset.editKelas);
          if (target) fillEditMode(target);
          return;
        }
        const delBtn = e.target.closest('[data-hapus-kelas]');
        if (delBtn) {
          const target = state.kelasList.find((k) => k.id_kelas === delBtn.dataset.hapusKelas);
          if (target) openDeleteModal(target);
        }
      });
    }

    if (btnBatalHapus) btnBatalHapus.addEventListener('click', closeDeleteModal);

    // UC-11 Alt Flow 1 & 3: Hapus Kelas
    if (btnKonfirmasiHapus) {
      btnKonfirmasiHapus.addEventListener('click', async () => {
        if (state.busy || !state.deletingIdKelas) return;
        const idKelas = state.deletingIdKelas;
        state.busy = true;
        btnKonfirmasiHapus.disabled = true;

        try {
          // Alt Flow 3: Cek apakah kelas sudah dipakai di detail_krs mahasiswa
          if (await isKelasUsedInKrs(idKelas)) {
            closeDeleteModal();
            showFormAlert(
              'Data jadwal/kelas tidak dapat diubah atau dihapus karena telah terdaftar di dalam KRS mahasiswa.',
              `Kelas ${idKelas} saat ini sudah dipilih oleh mahasiswa di tabel detail_krs.`,
              'error'
            );
            if (formSection) formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }

          const { error: delErr } = await db.from('kelas_mk').delete().eq('id_kelas', idKelas);
          if (delErr) throw new Error(`Gagal menghapus kelas: ${delErr.message}`);

          await logAktivitas(db, session.id_pengguna, `hapus kelas ${idKelas}`);

          closeDeleteModal();
          if (state.editingIdKelas === idKelas) resetToTambahMode();
          await loadData();
          showFormAlert('Data berhasil dihapus.', `Kelas ${idKelas} telah dihapus dari jadwal semester berjalan.`, 'success');
        } catch (err) {
          console.error('[SIAM Kelola Jadwal] Delete Error:', err);
          closeDeleteModal();
          showFormAlert('Gagal menghapus data kelas.', err.message, 'error');
        } finally {
          state.busy = false;
          btnKonfirmasiHapus.disabled = false;
        }
      });
    }

    // UC-11 Main Flow + Alt Flow 2 & 3: Tambah / Ubah MK & Jadwal
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (state.busy) return;
        hideFormAlert();

        if (!state.periode) {
          showFormAlert('Periode KRS aktif tidak ditemukan.', '', 'error');
          return;
        }

        const kodeMk = (inputKodeMk ? inputKodeMk.value : '').trim().toUpperCase();
        const namaMk = (inputNamaMk ? inputNamaMk.value : '').trim();
        const sks = parseInt(inputSks ? inputSks.value : '3', 10);
        const semester = parseInt(inputSemester ? inputSemester.value : '1', 10);
        const namaKelas = (inputNamaKelas ? inputNamaKelas.value : '').trim();
        const kuotaMaks = parseInt(inputKuotaAwal ? inputKuotaAwal.value : '40', 10);
        const hari = inputHari ? inputHari.value : 'Senin';
        const jamMulai = normalizeTimePG(inputJamMulai ? inputJamMulai.value : '');
        const jamSelesai = normalizeTimePG(inputJamSelesai ? inputJamSelesai.value : '');
        const ruangan = (inputRuangan ? inputRuangan.value : '').trim();
        const idDosen = inputDosen ? inputDosen.value : '';

        if (!kodeMk || !namaMk || !namaKelas || !ruangan || !idDosen) {
          showFormAlert('Semua kolom bertanda wajib (*) harus diisi.', '', 'error');
          return;
        }

        if (timeToMinutes(jamSelesai) <= timeToMinutes(jamMulai)) {
          showFormAlert('Jam selesai harus lebih besar dari jam mulai.', '', 'error');
          return;
        }

        const idKelas =
          state.mode === 'UBAH' && state.editingIdKelas
            ? state.editingIdKelas
            : buildIdKelas(kodeMk, namaKelas);

        state.busy = true;
        try {
          // Alt Flow 3: Jika Ubah, tolak bila kelas sudah terdaftar di detail_krs mahasiswa
          if (state.mode === 'UBAH') {
            if (await isKelasUsedInKrs(idKelas)) {
              showFormAlert(
                'Data jadwal/kelas tidak dapat diubah atau dihapus karena telah terdaftar di dalam KRS mahasiswa.',
                `Kelas ${idKelas} sudah masuk ke KRS mahasiswa sehingga jadwalnya dikunci.`,
                'error'
              );
              return;
            }
          } else if (state.kelasList.some((k) => k.id_kelas === idKelas)) {
            showFormAlert(
              `ID Kelas "${idKelas}" sudah terdaftar pada periode ini.`,
              'Gunakan nama kelas lain (misal A, B, atau C) atau pilih Ubah pada tabel di atas.',
              'error'
            );
            return;
          }

          // Alt Flow 2: Validasi anti-bentrok ruangan & dosen pada hari & jam yang sama
          const conflict = findAdminScheduleConflict(
            { hari, jam_mulai: jamMulai, jam_selesai: jamSelesai, ruangan, id_dosen: idDosen },
            state.kelasList,
            state.mode === 'UBAH' ? idKelas : null
          );

          if (conflict) {
            const c = conflict.conflictWith;
            const alasan =
              conflict.roomConflict && conflict.dosenConflict
                ? `Ruangan ${ruangan} dan Dosen ${c.nama_dosen}`
                : conflict.roomConflict
                ? `Ruangan ${ruangan}`
                : `Dosen ${c.nama_dosen}`;
            showFormAlert(
              'Terjadi bentrok jadwal pada ruangan/dosen yang dipilih',
              `${alasan} sudah dialokasikan untuk ${c.kode_mk} - ${c.nama_mk} (${c.id_kelas}) pada hari ${c.hari}, pukul ${formatTimeHHMM(c.jam_mulai)} - ${formatTimeHHMM(c.jam_selesai)} WIB.`,
              'error'
            );
            return;
          }

          // 1. Upsert master MataKuliah
          const { error: mkErr } = await db.from('mata_kuliah').upsert(
            {
              kode_mk: kodeMk,
              nama_mk: namaMk,
              sks,
              semester,
            },
            { onConflict: 'kode_mk' }
          );
          if (mkErr) throw new Error(`Gagal menyimpan mata kuliah: ${mkErr.message}`);

          // 2. Insert / Update KelasMK
          if (state.mode === 'UBAH') {
            const { error: updErr } = await db
              .from('kelas_mk')
              .update({
                id_dosen: idDosen,
                hari,
                jam_mulai: jamMulai,
                jam_selesai: jamSelesai,
                ruangan,
                kuota_maks: kuotaMaks,
              })
              .eq('id_kelas', idKelas);
            if (updErr) throw new Error(`Gagal memperbarui jadwal kelas: ${updErr.message}`);
            await logAktivitas(db, session.id_pengguna, `ubah jadwal kelas ${idKelas}`);
          } else {
            const { error: insErr } = await db.from('kelas_mk').insert({
              id_kelas: idKelas,
              kode_mk: kodeMk,
              id_periode: state.periode.id_periode,
              id_dosen: idDosen,
              hari,
              jam_mulai: jamMulai,
              jam_selesai: jamSelesai,
              ruangan,
              kuota_maks: kuotaMaks,
            });
            if (insErr) throw new Error(`Gagal menambah jadwal kelas: ${insErr.message}`);
            await logAktivitas(db, session.id_pengguna, `tambah jadwal kelas ${idKelas}`);
          }

          await loadData();
          const prevMode = state.mode;
          resetToTambahMode();
          showFormAlert(
            'Data berhasil disimpan',
            `Jadwal kelas ${idKelas} (${namaMk}) berhasil ${prevMode === 'UBAH' ? 'diperbarui' : 'ditambahkan'}.`,
            'success'
          );
        } catch (err) {
          console.error('[SIAM Kelola Jadwal] Save Error:', err);
          showFormAlert('Gagal menyimpan data jadwal.', err.message, 'error');
        } finally {
          state.busy = false;
        }
      });
    }

    try {
      await loadData();
      resetToTambahMode();
      hideFormAlert();
    } catch (err) {
      console.error('[SIAM Kelola Jadwal] Load Error:', err);
      showFormAlert('Gagal memuat data dari Supabase.', err.message, 'error');
    }
  }

  function bootstrap() {
    if (!global.SIAM_AUTH || typeof global.SIAM_AUTH.getSession !== 'function') return;
    const session = global.SIAM_AUTH.getSession();
    if (!session || session.peran !== 'Admin Akademik') return;
    if (typeof global.getSupabaseClient !== 'function') return;

    const db = global.getSupabaseClient();
    const filename = (global.location.pathname.split('/').pop() || '').toLowerCase();

    if (filename === 'admin-beranda.html') {
      initBerandaAdmin(db);
    } else if (filename === 'admin-kuota-kelas.html') {
      initPengaturanKuota(db, session);
    } else if (filename === 'admin-kelola-jadwal.html') {
      initKelolaJadwal(db, session);
    }
  }

  global.SIAM_ADMIN_KRS = Object.freeze({
    findAdminScheduleConflict,
    detectConflictClassIds,
    buildIdKelas,
    inferProgramStudi,
  });

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
      bootstrap();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
