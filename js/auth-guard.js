/**
 * SIAM UB — Modul KRS Online
 * Proteksi Halaman (Role Guard), Header Profile Dinamis, dan Handler Logout
 *
 * Dipasang di seluruh halaman portal:
 * - Mahasiswa (mahasiswa-*.html)       -> requiredRole: "Mahasiswa"
 * - Dosen PA (dosen-*.html)            -> requiredRole: "Dosen PA"
 * - Admin Akademik (admin-*.html)      -> requiredRole: "Admin Akademik"
 */

(function initSiamAuthGuard(global) {
  const SESSION_KEY = 'siam_session';
  const LOGIN_PAGE = 'index.html';

  /**
   * Menghitung inisial 2 huruf dari nama lengkap (mis. "Arya Putra Rahman Dhika" -> "AP").
   */
  function getInitials(nama) {
    if (!nama || typeof nama !== 'string') return 'US';
    const parts = nama
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    if (parts.length === 0) return 'US';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  /**
   * Menghitung batas maksimum SKS sesuai aturan PC-08 Modul 2:
   * IPS >= 3.00 -> 24 SKS; 2.50–2.99 -> 21 SKS; 2.00–2.49 -> 18 SKS; < 2.00 -> 15 SKS.
   */
  function getMaxSksByIps(ips) {
    const val = Number(ips);
    if (Number.isNaN(val)) return 15;
    if (val >= 3.0) return 24;
    if (val >= 2.5) return 21;
    if (val >= 2.0) return 18;
    return 15;
  }

  /**
   * Membaca sesi pengguna aktif dari localStorage secara aman.
   */
  function getSession() {
    try {
      const raw = global.localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.id_pengguna || !parsed.peran) return null;
      return parsed;
    } catch (err) {
      console.warn('[SIAM Guard] Data sesi korup, membersihkan localStorage:', err);
      global.localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  /**
   * Menentukan peran yang diwajibkan untuk halaman aktif berdasarkan
   * atribut data-required-role pada <body> atau prefix nama file HTML.
   */
  function detectRequiredRole() {
    if (document.body && document.body.dataset && document.body.dataset.requiredRole) {
      return document.body.dataset.requiredRole;
    }
    const filename = (global.location.pathname.split('/').pop() || '').toLowerCase();
    if (filename.startsWith('mahasiswa-')) return 'Mahasiswa';
    if (filename.startsWith('dosen-')) return 'Dosen PA';
    if (filename.startsWith('admin-')) return 'Admin Akademik';
    return null;
  }

  /**
   * Memastikan pengguna sudah login dan memiliki peran yang sesuai.
   * Jika tidak valid, langsung mengembalikan ke index.html.
   */
  function requireRole(expectedRole) {
    const session = getSession();
    if (!session) {
      global.location.replace(LOGIN_PAGE);
      return null;
    }
    if (expectedRole && session.peran !== expectedRole) {
      global.location.replace(LOGIN_PAGE);
      return null;
    }
    return session;
  }

  /**
   * Menghapus sesi login, mencatat log logout (best-effort), dan kembali ke index.html.
   */
  async function logout() {
    const session = getSession();
    global.localStorage.removeItem(SESSION_KEY);

    if (session && session.id_pengguna && typeof global.isSupabaseConfigured === 'function' && global.isSupabaseConfigured()) {
      try {
        const db = global.getSupabaseClient();
        await Promise.race([
          db.from('log_aktivitas').insert({
            id_pengguna: session.id_pengguna,
            aktivitas: 'logout',
          }),
          new Promise((resolve) => setTimeout(resolve, 600)),
        ]);
      } catch (err) {
        console.warn('[SIAM Guard] Gagal mencatat log logout:', err);
      }
    }

    global.location.replace(LOGIN_PAGE);
  }

  /**
   * Memperbarui elemen header profile di pojok kanan atas & identitas ringkas pada halaman Beranda.
   */
  function applyUserProfileToDOM(session) {
    if (!session) return;

    const initials = getInitials(session.nama);
    const labelInduk = session.label_induk || (session.peran === 'Mahasiswa' ? 'NIM' : session.peran === 'Dosen PA' ? 'NIDN' : 'NIP');
    const nomorInduk = session.nomor_induk || session.username || '-';
    const metaText = `${session.peran} • ${labelInduk} ${nomorInduk}`;

    // 1. Update header profile via explicit data attributes (dipasang di seluruh 10 halaman portal)
    document.querySelectorAll('[data-user-avatar]').forEach((el) => {
      // Jika elemen berisi ikon SVG Lucide (mis. halaman Admin tertentu), ganti dengan inisial teks
      el.textContent = initials;
      el.classList.add('text-xs', 'font-bold');
    });

    document.querySelectorAll('[data-user-name]').forEach((el) => {
      el.textContent = session.nama;
    });

    document.querySelectorAll('[data-user-meta]').forEach((el) => {
      el.textContent = metaText;
    });

    // 2. Fallback untuk elemen dengan ID spesifik di halaman Beranda
    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = session.nama;

    const userRoleEl = document.getElementById('userRole');
    if (userRoleEl) userRoleEl.textContent = metaText;

    // 3. Sinkronisasi identitas dasar pada Beranda Mahasiswa
    if (session.peran === 'Mahasiswa' && session.profil) {
      const welcomeNameEl = document.getElementById('welcomeName');
      if (welcomeNameEl) welcomeNameEl.textContent = session.nama;

      const statNimEl = document.getElementById('statNim');
      if (statNimEl) statNimEl.textContent = session.profil.nim || nomorInduk;

      if (typeof session.profil.ips_semester_lalu === 'number') {
        const ips = session.profil.ips_semester_lalu;
        const maxSks = getMaxSksByIps(ips);

        const statIpsEl = document.getElementById('statIps');
        if (statIpsEl) statIpsEl.textContent = ips.toFixed(2);

        const statMaxSksEl = document.getElementById('statMaxSks');
        if (statMaxSksEl) statMaxSksEl.textContent = `${maxSks} SKS`;

        const statMaxSksRuleEl = document.getElementById('statMaxSksRule');
        if (statMaxSksRuleEl) {
          if (ips >= 3.0) statMaxSksRuleEl.textContent = 'Berdasarkan IPS ≥ 3.00';
          else if (ips >= 2.5) statMaxSksRuleEl.textContent = 'Berdasarkan IPS 2.50 – 2.99';
          else if (ips >= 2.0) statMaxSksRuleEl.textContent = 'Berdasarkan IPS 2.00 – 2.49';
          else statMaxSksRuleEl.textContent = 'Berdasarkan IPS < 2.00';
        }
      }
    }

    // 4. Sinkronisasi sambutan pada Beranda Dosen PA
    if (session.peran === 'Dosen PA') {
      const welcomeDosenEl = document.getElementById('welcomeDosenName');
      if (welcomeDosenEl) welcomeDosenEl.textContent = session.nama;
    }
  }

  /**
   * Memasang event listener pada semua tombol Keluar Sistem.
   */
  function bindLogoutButtons() {
    const selector = '[data-logout], #btnLogout, aside a[href="index.html"]';
    const buttons = document.querySelectorAll(selector);
    buttons.forEach((btn) => {
      if (btn.dataset.logoutBound === 'true') return;
      btn.dataset.logoutBound = 'true';
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        logout();
      });
    });
  }

  /**
   * Jalankan guard & render header dinamis saat halaman dimuat.
   */
  function initGuard() {
    const requiredRole = detectRequiredRole();
    const session = requireRole(requiredRole);
    if (!session) return;

    applyUserProfileToDOM(session);
    bindLogoutButtons();
  }

  // Ekspor API sesi global untuk dipakai modul Tahap 3+
  global.SIAM_AUTH = Object.freeze({
    SESSION_KEY,
    getSession,
    requireRole,
    logout,
    getMaxSksByIps,
    getInitials,
  });

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initGuard);
    } else {
      initGuard();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
