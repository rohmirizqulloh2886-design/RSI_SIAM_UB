/**
 * SIAM UB — Modul KRS Online
 * Tahap 3B: Logic Portal Dosen PA (Beranda + UC-08 Approval KRS + UC-09 Catatan Revisi)
 *
 * Halaman yang ditangani:
 * - dosen-beranda.html          (Statistik Mahasiswa Bimbingan, Pengajuan Terbaru & Progres)
 * - dosen-persetujuan-krs.html  (UC-08 Approval KRS & UC-09 Memberikan Catatan Revisi)
 */

(function initDosenKrsModule(global) {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getMaxSksByIps(ips) {
    const val = Number(ips);
    if (Number.isNaN(val)) return 15;
    if (val >= 3.0) return 24;
    if (val >= 2.5) return 21;
    if (val >= 2.0) return 18;
    return 15;
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

  function formatDateTimeID(dateInput) {
    if (!dateInput) return '-';
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return String(dateInput);
    const datePart = d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const timePart = d
      .toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
      .replace('.', ':');
    return `${datePart}, ${timePart} WIB`;
  }

  function formatKelasLabel(idKelas) {
    if (!idKelas) return '-';
    const parts = String(idKelas).split('-');
    return parts.length >= 2 ? `SI-${parts[parts.length - 1]}` : idKelas;
  }

  function refreshIcons() {
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons();
    }
  }

  function getStatusBadgeHtml(status) {
    if (status === 'Disetujui') {
      return `<span class="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 font-bold px-3 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> Disetujui</span>`;
    }
    if (status === 'Perlu Revisi') {
      return `<span class="inline-flex items-center gap-1.5 bg-red-50 text-red-700 font-bold px-3 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-red-600"></span> Perlu Revisi</span>`;
    }
    if (status === 'Menunggu Persetujuan') {
      return `<span class="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 font-bold px-3 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Menunggu Persetujuan</span>`;
    }
    return `<span class="inline-flex items-center gap-1.5 bg-blue-50 text-[#2042B8] font-bold px-3 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-[#2042B8]"></span> KRS Sementara</span>`;
  }

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

  async function fetchDosenBimbinganData(db, nidn, idPeriode) {
    const { data: mhsList, error: mhsErr } = await db
      .from('mahasiswa')
      .select('nim, id_pengguna, nama, ips_semester_lalu, id_dosen_pa')
      .eq('id_dosen_pa', nidn)
      .order('nama', { ascending: true });

    if (mhsErr) throw new Error(`Gagal memuat mahasiswa bimbingan: ${mhsErr.message}`);

    const nims = (mhsList || []).map((m) => m.nim);
    let krsList = [];

    if (nims.length > 0 && idPeriode) {
      const { data: krsRows, error: krsErr } = await db
        .from('krs')
        .select('id_krs, nim, id_periode, status, tanggal_pengajuan, total_sks')
        .eq('id_periode', idPeriode)
        .in('nim', nims)
        .order('tanggal_pengajuan', { ascending: false, nullsFirst: false });

      if (krsErr) throw new Error(`Gagal memuat data KRS bimbingan: ${krsErr.message}`);
      krsList = krsRows || [];
    }

    const mhsMap = new Map((mhsList || []).map((m) => [m.nim, m]));
    const enrichedKrs = krsList.map((k) => ({
      ...k,
      mahasiswa: mhsMap.get(k.nim) || null,
    }));

    return { mhsList: mhsList || [], krsList: enrichedKrs };
  }

  async function fetchKrsDetailItems(db, idKrs) {
    const [detailRes, catatanRes] = await Promise.all([
      db
        .from('detail_krs')
        .select(`
          id_krs,
          id_kelas,
          kelas_mk (
            id_kelas,
            kode_mk,
            hari,
            jam_mulai,
            jam_selesai,
            ruangan,
            mata_kuliah ( kode_mk, nama_mk, sks, semester )
          )
        `)
        .eq('id_krs', idKrs),
      db
        .from('catatan_revisi')
        .select('id_catatan, catatan, tanggal')
        .eq('id_krs', idKrs)
        .order('tanggal', { ascending: false })
        .limit(1),
    ]);

    if (detailRes.error) throw new Error(`Gagal memuat detail KRS: ${detailRes.error.message}`);

    const items = (detailRes.data || [])
      .map((row) => {
        const k = row.kelas_mk;
        if (!k) return null;
        return {
          id_kelas: k.id_kelas,
          kode_mk: k.kode_mk,
          nama_mk: k.mata_kuliah ? k.mata_kuliah.nama_mk : k.kode_mk,
          sks: k.mata_kuliah ? Number(k.mata_kuliah.sks) : 0,
          hari: k.hari,
          jam_mulai: k.jam_mulai,
          jam_selesai: k.jam_selesai,
          ruangan: k.ruangan,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.kode_mk.localeCompare(b.kode_mk));

    const latestNote = catatanRes.data && catatanRes.data.length > 0 ? catatanRes.data[0] : null;
    return { items, latestNote };
  }

  // ---------------------------------------------------------------------------
  // 1. BERANDA DOSEN PA (dosen-beranda.html)
  // ---------------------------------------------------------------------------

  async function initBerandaDosen(db, session) {
    const nidn = session.profil && session.profil.nidn ? session.profil.nidn : session.nomor_induk;

    try {
      const periode = await fetchActivePeriode(db);
      const { mhsList, krsList } = await fetchDosenBimbinganData(
        db,
        nidn,
        periode ? periode.id_periode : null
      );

      const totalBimbingan = mhsList.length;
      const menunggu = krsList.filter((k) => k.status === 'Menunggu Persetujuan');
      const disetujui = krsList.filter((k) => k.status === 'Disetujui');
      const revisi = krsList.filter((k) => k.status === 'Perlu Revisi');

      const setHtml = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
      };
      const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };

      setText('statBimbingan', String(totalBimbingan));
      setHtml('statMenunggu', `${menunggu.length} <span class="text-base font-bold">KRS</span>`);
      setHtml('statDisetujui', `${disetujui.length} <span class="text-base font-bold">KRS</span>`);
      setHtml('statRevisi', `${revisi.length} <span class="text-base font-bold">KRS</span>`);

      // Progres Semester
      const pct = totalBimbingan > 0 ? Math.round((disetujui.length / totalBimbingan) * 100) : 0;
      setText('dosenRingkasanSemester', `Semester ${periode ? periode.semester : '-'}`);
      setText(
        'dosenRingkasanProgres',
        `${pct}% (${disetujui.length} dari ${totalBimbingan}) mahasiswa bimbingan telah menyelesaikan persetujuan KRS.`
      );
      const bar = document.getElementById('dosenProgressBar');
      if (bar) bar.style.width = `${pct}%`;

      // Daftar Pengajuan Terbaru (prioritaskan Menunggu Persetujuan, lalu pengajuan terbaru lain)
      const listEl = document.getElementById('listPengajuanTerbaru');
      if (listEl) {
        const submitted = krsList
          .filter((k) => k.status !== 'KRS Sementara')
          .sort((a, b) => {
            if (a.status === 'Menunggu Persetujuan' && b.status !== 'Menunggu Persetujuan') return -1;
            if (b.status === 'Menunggu Persetujuan' && a.status !== 'Menunggu Persetujuan') return 1;
            return new Date(b.tanggal_pengajuan || 0) - new Date(a.tanggal_pengajuan || 0);
          });

        if (submitted.length === 0) {
          listEl.innerHTML = `
            <p class="text-xs text-slate-400 py-4 text-center">
              Tidak ada pengajuan KRS saat ini dari mahasiswa bimbingan Anda.
            </p>
          `;
        } else {
          listEl.innerHTML = submitted
            .slice(0, 4)
            .map((k) => {
              const nama = k.mahasiswa ? k.mahasiswa.nama : k.nim;
              const badgeCls =
                k.status === 'Disetujui'
                  ? 'bg-emerald-50 text-emerald-700'
                  : k.status === 'Perlu Revisi'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-amber-50 text-amber-700';
              const badgeText =
                k.status === 'Menunggu Persetujuan' ? 'Menunggu Tinjauan' : k.status;

              return `
                <a href="dosen-persetujuan-krs.html?id_krs=${encodeURIComponent(k.id_krs)}"
                  class="flex items-center justify-between gap-4 p-3.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200/70 transition">
                  <div class="flex items-center gap-3.5">
                    <div class="w-10 h-10 rounded-full bg-blue-50 text-[#2042B8] text-xs font-bold flex items-center justify-center shrink-0">
                      ${escapeHtml(getInitials(nama))}
                    </div>
                    <div>
                      <p class="text-xs font-bold text-slate-900">${escapeHtml(nama)}</p>
                      <p class="text-[11px] text-slate-500 mt-0.5">${k.total_sks} SKS • Diajukan ${escapeHtml(formatDateTimeID(k.tanggal_pengajuan))}</p>
                    </div>
                  </div>
                  <span class="${badgeCls} text-[11px] font-bold px-3.5 py-1.5 rounded-full shrink-0">
                    ${escapeHtml(badgeText)}
                  </span>
                </a>
              `;
            })
            .join('');
        }
      }
    } catch (err) {
      console.error('[SIAM Beranda Dosen] Error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. PERSETUJUAN KRS (dosen-persetujuan-krs.html — UC-08 & UC-09)
  // ---------------------------------------------------------------------------

  async function initPersetujuanKrs(db, session) {
    const nidn = session.profil && session.profil.nidn ? session.profil.nidn : session.nomor_induk;

    const alertBox = document.getElementById('alertDosenApproval');
    const alertText = document.getElementById('alertDosenApprovalText');
    const countBadge = document.getElementById('countDaftarKrsDosen');
    const tbodyDaftar = document.getElementById('tbodyDaftarMahasiswa');
    const detailCard = document.getElementById('detailKrsCard');
    const detailTitle = document.getElementById('detailKrsTitle');
    const detailSemester = document.getElementById('detailKrsSemester');
    const tbodyDetail = document.getElementById('tbodyDetailKrs');
    const detailIps = document.getElementById('detailIpsMhs');
    const detailMaxSks = document.getElementById('detailMaxSksMhs');
    const detailTotalMk = document.getElementById('detailTotalMkMhs');
    const detailTotalSks = document.getElementById('detailTotalSksMhs');
    const detailRevisiBox = document.getElementById('detailCatatanRevisiBox');
    const detailRevisiText = document.getElementById('detailCatatanRevisiText');
    const actionButtons = document.getElementById('actionButtonsDosen');
    const actionStatusNote = document.getElementById('actionStatusNoteDosen');
    const btnSetujui = document.getElementById('btnSetujuiKrs');
    const btnPerluRevisi = document.getElementById('btnPerluRevisiKrs');

    const modalRevisi = document.getElementById('modalRevisi');
    const modalRevisiMhs = document.getElementById('modalRevisiMhs');
    const formRevisi = document.getElementById('formCatatanRevisi');
    const textareaRevisi = document.getElementById('catatanRevisi');
    const errorRevisi = document.getElementById('errorCatatanRevisi');
    const btnBatalRevisi = document.getElementById('btnBatalRevisi');
    const btnKirimRevisi = document.getElementById('btnKirimRevisi');
    const filterContainer = document.getElementById('filterStatusDosen');

    const state = {
      periode: null,
      krsList: [],
      selectedKrsId: null,
      statusFilter: 'ALL',
      busy: false,
    };

    function showAlert(message, type = 'success') {
      if (!alertBox || !alertText) return;
      alertBox.classList.remove(
        'hidden',
        'bg-emerald-50',
        'border-emerald-200',
        'text-emerald-800',
        'bg-red-50',
        'border-red-200',
        'text-red-800',
        'bg-amber-50',
        'border-amber-200',
        'text-amber-800'
      );
      if (type === 'error') {
        alertBox.classList.add('bg-red-50', 'border-red-200', 'text-red-800');
      } else if (type === 'warning') {
        alertBox.classList.add('bg-amber-50', 'border-amber-200', 'text-amber-800');
      } else {
        alertBox.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
      }
      alertText.textContent = message;
    }

    function openRevisiModal(krs) {
      if (!modalRevisi) return;
      if (modalRevisiMhs) {
        const nama = krs.mahasiswa ? krs.mahasiswa.nama : krs.nim;
        modalRevisiMhs.textContent = `Mahasiswa: ${nama} (${krs.nim})`;
      }
      if (textareaRevisi) textareaRevisi.value = '';
      if (errorRevisi) errorRevisi.classList.add('hidden');
      modalRevisi.classList.remove('hidden');
      modalRevisi.classList.add('flex');
      if (textareaRevisi) textareaRevisi.focus();
    }

    function closeRevisiModal() {
      if (!modalRevisi) return;
      modalRevisi.classList.add('hidden');
      modalRevisi.classList.remove('flex');
    }

    function renderFilterButtons() {
      if (!filterContainer) return;
      filterContainer.querySelectorAll('[data-filter-status]').forEach((btn) => {
        const isActive = btn.dataset.filterStatus === state.statusFilter;
        btn.className = isActive
          ? 'bg-[#2042B8] text-white text-[11px] font-bold px-3 py-1 rounded-full transition'
          : 'bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-semibold px-3 py-1 rounded-full transition';
      });
    }

    function renderDaftarKrs() {
      if (!tbodyDaftar) return;

      const filtered = state.krsList.filter((k) => {
        if (state.statusFilter === 'ALL') return true;
        return k.status === state.statusFilter;
      });

      const menungguCount = state.krsList.filter((k) => k.status === 'Menunggu Persetujuan').length;
      if (countBadge) {
        countBadge.textContent = `${filtered.length} Mahasiswa (${menungguCount} Menunggu)`;
      }

      if (filtered.length === 0) {
        const emptyMsg =
          state.statusFilter === 'Menunggu Persetujuan' || state.krsList.length === 0
            ? 'Tidak ada pengajuan KRS saat ini dari mahasiswa bimbingan Anda.'
            : 'Tidak ada KRS mahasiswa bimbingan pada filter status ini.';
        tbodyDaftar.innerHTML = `
          <tr>
            <td colspan="6" class="py-8 px-4 text-center text-slate-400">${emptyMsg}</td>
          </tr>
        `;
        return;
      }

      tbodyDaftar.innerHTML = filtered
        .map((k) => {
          const nama = k.mahasiswa ? k.mahasiswa.nama : k.nim;
          const isSelected = k.id_krs === state.selectedKrsId;
          const rowCls = isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50/70 transition';
          const btnCls = isSelected
            ? 'bg-[#2042B8] text-white font-bold px-4 py-1.5 rounded-full inline-flex items-center gap-1.5 transition'
            : 'bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold px-4 py-1.5 rounded-full inline-flex items-center gap-1.5 transition';

          return `
            <tr class="${rowCls}">
              <td class="py-4 px-4">
                <p class="font-bold text-slate-900">${escapeHtml(nama)}</p>
                <p class="text-[11px] text-slate-500 mt-0.5">S1 Sistem Informasi • IPS ${k.mahasiswa ? Number(k.mahasiswa.ips_semester_lalu).toFixed(2) : '-'}</p>
              </td>
              <td class="py-4 px-4 font-mono text-slate-600">${escapeHtml(k.nim)}</td>
              <td class="py-4 px-4 text-slate-600">${escapeHtml(formatDateTimeID(k.tanggal_pengajuan))}</td>
              <td class="py-4 px-4 font-bold text-[#2042B8]">${k.total_sks} SKS</td>
              <td class="py-4 px-4">${getStatusBadgeHtml(k.status)}</td>
              <td class="py-4 px-4 text-right">
                <button type="button" data-tinjau-krs="${escapeHtml(k.id_krs)}" class="${btnCls}">
                  <i data-lucide="eye" class="w-3.5 h-3.5"></i> ${isSelected ? 'Sedang Ditinjau' : 'Tinjau'}
                </button>
              </td>
            </tr>
          `;
        })
        .join('');

      refreshIcons();
    }

    async function renderDetailKrs(idKrs, scrollToPanel = false) {
      const krs = state.krsList.find((k) => k.id_krs === idKrs);
      if (!krs || !detailCard) {
        if (detailCard) detailCard.classList.add('hidden');
        return;
      }

      state.selectedKrsId = krs.id_krs;
      renderDaftarKrs();
      detailCard.classList.remove('hidden');

      const nama = krs.mahasiswa ? krs.mahasiswa.nama : krs.nim;
      const ips = krs.mahasiswa ? Number(krs.mahasiswa.ips_semester_lalu || 0) : 0;
      const maxSks = getMaxSksByIps(ips);

      if (detailTitle) detailTitle.textContent = `Detail KRS — ${nama} (${krs.nim})`;
      if (detailSemester) {
        detailSemester.textContent = `Semester ${state.periode ? state.periode.semester : '-'}`;
      }
      if (tbodyDetail) {
        tbodyDetail.innerHTML = `<tr><td colspan="6" class="py-6 px-4 text-center text-slate-400">Memuat rincian mata kuliah...</td></tr>`;
      }

      const { items, latestNote } = await fetchKrsDetailItems(db, krs.id_krs);
      const totalSks = items.reduce((sum, i) => sum + Number(i.sks || 0), 0);

      if (tbodyDetail) {
        if (items.length === 0) {
          tbodyDetail.innerHTML = `<tr><td colspan="6" class="py-6 px-4 text-center text-slate-400">Belum ada mata kuliah pada KRS ini.</td></tr>`;
        } else {
          tbodyDetail.innerHTML = items
            .map(
              (item) => `
              <tr>
                <td class="py-3.5 px-4 font-mono font-bold text-slate-600">${escapeHtml(item.kode_mk)}</td>
                <td class="py-3.5 px-4 font-bold text-slate-800">${escapeHtml(item.nama_mk)}</td>
                <td class="py-3.5 px-4 text-center font-semibold">${item.sks}</td>
                <td class="py-3.5 px-4 text-center font-medium text-slate-600">${escapeHtml(formatKelasLabel(item.id_kelas))}</td>
                <td class="py-3.5 px-4 text-slate-600">${escapeHtml(item.hari)}, ${formatTimeHHMM(item.jam_mulai)} - ${formatTimeHHMM(item.jam_selesai)}</td>
                <td class="py-3.5 px-4 text-right text-slate-600">${escapeHtml(item.ruangan)}</td>
              </tr>
            `
            )
            .join('');
        }
      }

      if (detailIps) detailIps.textContent = ips.toFixed(2);
      if (detailMaxSks) detailMaxSks.textContent = `${maxSks} SKS`;
      if (detailTotalMk) detailTotalMk.textContent = `${items.length} MK`;
      if (detailTotalSks) detailTotalSks.textContent = `Total SKS: ${totalSks} SKS`;

      // Tampilkan catatan revisi terakhir jika ada
      if (detailRevisiBox && detailRevisiText) {
        if (krs.status === 'Perlu Revisi' && latestNote) {
          detailRevisiBox.classList.remove('hidden');
          detailRevisiText.textContent = `"${latestNote.catatan}" (${formatDateTimeID(latestNote.tanggal)})`;
        } else {
          detailRevisiBox.classList.add('hidden');
        }
      }

      // Tombol aksi Setujui / Perlu Revisi hanya aktif saat status 'Menunggu Persetujuan'
      const canReview = krs.status === 'Menunggu Persetujuan';
      if (actionButtons) actionButtons.classList.toggle('hidden', !canReview);
      if (actionStatusNote) {
        actionStatusNote.classList.toggle('hidden', canReview);
        if (!canReview) {
          actionStatusNote.innerHTML = `Status KRS saat ini: ${getStatusBadgeHtml(krs.status)}`;
        }
      }

      if (scrollToPanel) {
        detailCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      refreshIcons();
    }

    async function loadData(preferredKrsId = null) {
      state.periode = await fetchActivePeriode(db);
      const { krsList } = await fetchDosenBimbinganData(
        db,
        nidn,
        state.periode ? state.periode.id_periode : null
      );

      // Urutkan: Menunggu Persetujuan paling atas
      state.krsList = krsList.sort((a, b) => {
        const rank = {
          'Menunggu Persetujuan': 1,
          'Perlu Revisi': 2,
          'Disetujui': 3,
          'KRS Sementara': 4,
        };
        return (rank[a.status] || 9) - (rank[b.status] || 9);
      });

      renderFilterButtons();
      renderDaftarKrs();

      const targetId =
        preferredKrsId ||
        (state.selectedKrsId && state.krsList.some((k) => k.id_krs === state.selectedKrsId)
          ? state.selectedKrsId
          : state.krsList.length > 0
          ? state.krsList[0].id_krs
          : null);

      if (targetId) {
        await renderDetailKrs(targetId, false);
      } else if (detailCard) {
        detailCard.classList.add('hidden');
      }
    }

    // UC-08 / PC-20: Setujui KRS
    async function handleSetujui() {
      if (state.busy || !state.selectedKrsId) return;
      const krs = state.krsList.find((k) => k.id_krs === state.selectedKrsId);
      if (!krs) return;

      state.busy = true;
      if (btnSetujui) btnSetujui.disabled = true;

      try {
        const { error: updErr } = await db
          .from('krs')
          .update({ status: 'Disetujui' })
          .eq('id_krs', krs.id_krs);

        if (updErr) throw new Error(`Gagal menyetujui KRS: ${updErr.message}`);

        // Kirim notifikasi ke Mahasiswa
        if (krs.mahasiswa && krs.mahasiswa.id_pengguna) {
          await db.from('notifikasi').insert({
            id_penerima: krs.mahasiswa.id_pengguna,
            pesan: `KRS Anda untuk semester ${state.periode ? state.periode.semester : ''} telah disetujui oleh ${session.nama}.`,
            sudah_dibaca: false,
          });
        }

        // Catat ke log_aktivitas
        await db.from('log_aktivitas').insert({
          id_pengguna: session.id_pengguna,
          aktivitas: `menyetujui KRS ${krs.nim}`,
        });

        await loadData(krs.id_krs);
        showAlert(
          `KRS milik ${krs.mahasiswa ? krs.mahasiswa.nama : krs.nim} telah disetujui dan notifikasi dikirim ke mahasiswa.`,
          'success'
        );
      } catch (err) {
        console.error('[SIAM Persetujuan KRS] Error approveKRS:', err);
        showAlert(err.message || 'Gagal menyetujui KRS.', 'error');
      } finally {
        state.busy = false;
        if (btnSetujui) btnSetujui.disabled = false;
      }
    }

    // UC-09 / PC-21 & PC-22: Simpan Catatan Revisi + Ubah Status 'Perlu Revisi'
    async function handleSubmitRevisi(event) {
      event.preventDefault();
      if (state.busy || !state.selectedKrsId) return;
      const krs = state.krsList.find((k) => k.id_krs === state.selectedKrsId);
      if (!krs) return;

      const catatan = textareaRevisi ? textareaRevisi.value.trim() : '';
      if (!catatan) {
        if (errorRevisi) {
          errorRevisi.textContent = 'Catatan revisi wajib diisi';
          errorRevisi.classList.remove('hidden');
        }
        return;
      }

      if (errorRevisi) errorRevisi.classList.add('hidden');
      state.busy = true;
      if (btnKirimRevisi) btnKirimRevisi.disabled = true;

      try {
        // 1. Simpan ke tabel catatan_revisi
        const { error: noteErr } = await db.from('catatan_revisi').insert({
          id_krs: krs.id_krs,
          id_dosen_pa: nidn,
          catatan,
        });
        if (noteErr) throw new Error(`Gagal menyimpan catatan revisi: ${noteErr.message}`);

        // 2. Ubah status KRS menjadi 'Perlu Revisi'
        const { error: updErr } = await db
          .from('krs')
          .update({ status: 'Perlu Revisi' })
          .eq('id_krs', krs.id_krs);
        if (updErr) throw new Error(`Gagal memperbarui status KRS: ${updErr.message}`);

        // 3. Kirim notifikasi ke Mahasiswa
        if (krs.mahasiswa && krs.mahasiswa.id_pengguna) {
          const shortNote = catatan.length > 180 ? `${catatan.slice(0, 177)}...` : catatan;
          await db.from('notifikasi').insert({
            id_penerima: krs.mahasiswa.id_pengguna,
            pesan: `KRS Anda memerlukan revisi dari ${session.nama}: "${shortNote}"`,
            sudah_dibaca: false,
          });
        }

        // 4. Catat ke log_aktivitas
        await db.from('log_aktivitas').insert({
          id_pengguna: session.id_pengguna,
          aktivitas: `meminta revisi KRS ${krs.nim}`,
        });

        closeRevisiModal();
        await loadData(krs.id_krs);
        showAlert(
          `Catatan revisi berhasil dikirim. Status KRS ${krs.mahasiswa ? krs.mahasiswa.nama : krs.nim} berubah menjadi Perlu Revisi.`,
          'warning'
        );
      } catch (err) {
        console.error('[SIAM Persetujuan KRS] Error rejectKRS:', err);
        if (errorRevisi) {
          errorRevisi.textContent = err.message || 'Gagal menyimpan catatan revisi.';
          errorRevisi.classList.remove('hidden');
        }
      } finally {
        state.busy = false;
        if (btnKirimRevisi) btnKirimRevisi.disabled = false;
      }
    }

    // Bind events
    if (filterContainer) {
      filterContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-filter-status]');
        if (!btn) return;
        state.statusFilter = btn.dataset.filterStatus;
        renderFilterButtons();
        renderDaftarKrs();
      });
    }

    if (tbodyDaftar) {
      tbodyDaftar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-tinjau-krs]');
        if (!btn) return;
        renderDetailKrs(btn.dataset.tinjauKrs, true);
      });
    }

    if (btnSetujui) btnSetujui.addEventListener('click', handleSetujui);
    if (btnPerluRevisi) {
      btnPerluRevisi.addEventListener('click', () => {
        const krs = state.krsList.find((k) => k.id_krs === state.selectedKrsId);
        if (krs) openRevisiModal(krs);
      });
    }
    if (btnBatalRevisi) btnBatalRevisi.addEventListener('click', closeRevisiModal);
    if (formRevisi) formRevisi.addEventListener('submit', handleSubmitRevisi);

    try {
      const params = new URLSearchParams(global.location.search);
      await loadData(params.get('id_krs'));
    } catch (err) {
      console.error('[SIAM Persetujuan KRS] Load Error:', err);
      showAlert(`Gagal memuat data persetujuan KRS: ${err.message}`, 'error');
    }
  }

  function bootstrap() {
    if (!global.SIAM_AUTH || typeof global.SIAM_AUTH.getSession !== 'function') return;
    const session = global.SIAM_AUTH.getSession();
    if (!session || session.peran !== 'Dosen PA') return;
    if (typeof global.getSupabaseClient !== 'function') return;

    const db = global.getSupabaseClient();
    const filename = (global.location.pathname.split('/').pop() || '').toLowerCase();

    if (filename === 'dosen-beranda.html') {
      initBerandaDosen(db, session);
    } else if (filename === 'dosen-persetujuan-krs.html') {
      initPersetujuanKrs(db, session);
    }
  }

  global.SIAM_DOSEN_KRS = Object.freeze({
    getMaxSksByIps,
  });

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
      bootstrap();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
