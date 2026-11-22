/**
 * SIAM UB — Modul KRS Online
 * UC-01 / PC-01: Autentikasi Pengguna, Validasi Lockout 5 Menit, Session & Role Routing
 *
 * Acuan:
 * - docs/rangkuman_konteks_project_siam.md
 * - docs/KELOMPOK 1_MODUL 2.docx_4.pdf (UC-01, SD-01, PC-01)
 */

(function initSiamAuth(global) {
  const SESSION_KEY = 'siam_session';
  const MAX_FAILED_ATTEMPTS = 3;
  const LOCK_DURATION_MINUTES = 5;

  const ROLE_ROUTES = Object.freeze({
    'Mahasiswa': 'mahasiswa-beranda.html',
    'Dosen PA': 'dosen-beranda.html',
    'Admin Akademik': 'admin-beranda.html',
  });

  // Daftar akun demo sesuai seed data di supabase_schema.sql
  const DEMO_ACCOUNTS = Object.freeze([
    {
      role: 'Mahasiswa',
      badgeClass: 'bg-blue-50 text-[#2042B8] border-blue-100',
      nama: 'Arya Putra Rahman Dhika',
      labelId: 'NIM',
      username: '255150407111067',
      password: 'mahasiswa123',
      keterangan: 'IPS 3.25 • Maks 24 SKS • Status: KRS Sementara',
    },
    {
      role: 'Dosen PA',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-100',
      nama: 'Lia Ninda Safitri',
      labelId: 'NIDN',
      username: '0012058801',
      password: 'dosen123',
      keterangan: 'Dosen Pembimbing Akademik • 3 Mahasiswa Bimbingan',
    },
    {
      role: 'Admin Akademik',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      nama: 'Budi Santoso',
      labelId: 'NIP',
      username: '198503122010011001',
      password: 'admin123',
      keterangan: 'Pengelola Kuota Kelas & Jadwal Mata Kuliah',
    },
  ]);

  /**
   * Pure-JS SHA-256 fallback untuk environment non-HTTPS (mis. file:// atau HTTP LAN)
   * dimana Web Crypto API (crypto.subtle) tidak tersedia.
   */
  function sha256Fallback(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }

    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    let result = '';

    const words = [];
    const utf8 = unescape(encodeURIComponent(ascii));
    const asciiBitLength = utf8.length * 8;

    let hash = sha256Fallback.h || [];
    const k = sha256Fallback.k || [];
    let primeCounter = k.length;

    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) {
          isComposite[i] = candidate;
        }
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }

    sha256Fallback.h = hash.slice(0, 8);
    sha256Fallback.k = k;
    hash = sha256Fallback.h.slice(0, 8);

    const padded = utf8 + '\x80';
    let padStr = padded;
    while ((padStr.length % 64) - 56) padStr += '\x00';
    for (let i = 0; i < padStr.length; i++) {
      const j = padStr.charCodeAt(i);
      words[i >> 2] |= j << (((3 - i) % 4) * 8);
    }
    words[words.length] = (asciiBitLength / maxWord) | 0;
    words[words.length] = asciiBitLength;

    for (let j = 0; j < words.length; ) {
      const w = words.slice(j, (j += 16));
      const oldHash = hash.slice(0, 8);

      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15];
        const w2 = w[i - 2];
        const a = hash[0];
        const e = hash[4];
        const temp1 =
          hash[7] +
          (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
          ((e & hash[5]) ^ (~e & hash[6])) +
          k[i] +
          (w[i] =
            i < 16
              ? w[i]
              : (w[i - 16] +
                  (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                  w[i - 7] +
                  (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
                0);
        const temp2 =
          (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
          ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
        hash.pop();
      }

      for (let i = 0; i < 8; i++) {
        hash[i] = (hash[i] + oldHash[i]) | 0;
      }
    }

    for (let i = 0; i < 8; i++) {
      for (let j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }

  /**
   * Menghasilkan hash SHA-256 hex (lowercase) dari password plaintext.
   */
  async function hashPassword(password) {
    if (global.crypto && global.crypto.subtle && typeof TextEncoder !== 'undefined') {
      const data = new TextEncoder().encode(password);
      const digest = await global.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
    return sha256Fallback(password);
  }

  /**
   * Format sisa waktu kunci akun menjadi menit & detik yang mudah dibaca.
   */
  function formatRemainingTime(ms) {
    const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
      return `${minutes} menit ${seconds} detik`;
    }
    return `${seconds} detik`;
  }

  /**
   * Menampilkan pesan alert pada halaman login.
   */
  function showLoginAlert(message, type = 'error', detail = '') {
    const alertBox = document.getElementById('loginAlert');
    const alertText = document.getElementById('loginAlertText');
    const alertDetail = document.getElementById('loginAlertDetail');
    if (!alertBox || !alertText) return;

    alertBox.classList.remove(
      'hidden',
      'bg-red-50',
      'border-red-200',
      'text-red-800',
      'bg-amber-50',
      'border-amber-200',
      'text-amber-900',
      'bg-emerald-50',
      'border-emerald-200',
      'text-emerald-800'
    );

    if (type === 'success') {
      alertBox.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
    } else if (type === 'warning') {
      alertBox.classList.add('bg-amber-50', 'border-amber-200', 'text-amber-900');
    } else {
      alertBox.classList.add('bg-red-50', 'border-red-200', 'text-red-800');
    }

    alertText.textContent = message;
    if (alertDetail) {
      if (detail) {
        alertDetail.textContent = detail;
        alertDetail.classList.remove('hidden');
      } else {
        alertDetail.textContent = '';
        alertDetail.classList.add('hidden');
      }
    }
  }

  function hideLoginAlert() {
    const alertBox = document.getElementById('loginAlert');
    if (alertBox) alertBox.classList.add('hidden');
  }

  function setLoadingState(isLoading) {
    const btn = document.getElementById('btnLogin');
    if (!btn) return;
    btn.disabled = isLoading;
    if (isLoading) {
      btn.dataset.originalText = btn.textContent.trim();
      btn.textContent = 'Memverifikasi kredensial...';
      btn.classList.add('opacity-75', 'cursor-wait');
    } else {
      btn.textContent = btn.dataset.originalText || 'Masuk ke Portal';
      btn.classList.remove('opacity-75', 'cursor-wait');
    }
  }

  /**
   * Mengambil detail profil pengguna berdasarkan perannya
   * (Mahasiswa / Dosen PA / Admin Akademik).
   */
  async function fetchRoleProfile(db, pengguna) {
    if (pengguna.peran === 'Mahasiswa') {
      const { data, error } = await db
        .from('mahasiswa')
        .select('nim, id_pengguna, nama, ips_semester_lalu, id_dosen_pa, dosen_pa(nidn, nama)')
        .eq('id_pengguna', pengguna.id_pengguna)
        .maybeSingle();

      if (error || !data) {
        throw new Error('Data profil Mahasiswa tidak ditemukan di database.');
      }

      return {
        nama: data.nama,
        nomor_induk: data.nim,
        label_induk: 'NIM',
        profil: {
          nim: data.nim,
          nama: data.nama,
          ips_semester_lalu: Number(data.ips_semester_lalu),
          id_dosen_pa: data.id_dosen_pa,
          nama_dosen_pa: data.dosen_pa ? data.dosen_pa.nama : null,
        },
      };
    }

    if (pengguna.peran === 'Dosen PA') {
      const { data, error } = await db
        .from('dosen_pa')
        .select('nidn, id_pengguna, nama')
        .eq('id_pengguna', pengguna.id_pengguna)
        .maybeSingle();

      if (error || !data) {
        throw new Error('Data profil Dosen PA tidak ditemukan di database.');
      }

      return {
        nama: data.nama,
        nomor_induk: data.nidn,
        label_induk: 'NIDN',
        profil: {
          nidn: data.nidn,
          nama: data.nama,
        },
      };
    }

    if (pengguna.peran === 'Admin Akademik') {
      const { data, error } = await db
        .from('admin_akademik')
        .select('nip, id_pengguna, nama')
        .eq('id_pengguna', pengguna.id_pengguna)
        .maybeSingle();

      if (error || !data) {
        throw new Error('Data profil Admin Akademik tidak ditemukan di database.');
      }

      return {
        nama: data.nama,
        nomor_induk: data.nip,
        label_induk: 'NIP',
        profil: {
          nip: data.nip,
          nama: data.nama,
        },
      };
    }

    throw new Error(`Peran pengguna "${pengguna.peran}" tidak dikenali oleh sistem.`);
  }

  /**
   * PC-01: AuthController.login(username, password)
   */
  async function authenticateUser(rawUsername, rawPassword) {
    const db = global.getSupabaseClient();
    const username = rawUsername.trim();
    const password = rawPassword;

    if (!username || !password) {
      return { ok: false, type: 'error', message: 'NIM / NIP dan Password wajib diisi.' };
    }

    // 1. Pengguna.findByUsername(username)
    const { data: pengguna, error: findErr } = await db
      .from('pengguna')
      .select('id_pengguna, username, password, peran, jumlah_gagal, waktu_kunci')
      .eq('username', username)
      .maybeSingle();

    if (findErr) {
      console.error('[SIAM Auth] Error mencari pengguna:', findErr);
      return {
        ok: false,
        type: 'error',
        message: 'Gagal terhubung ke database Supabase.',
        detail: findErr.message || 'Periksa koneksi internet dan konfigurasi Supabase Anda.',
      };
    }

    // 2. JIKA pengguna kosong -> "Username atau password salah"
    if (!pengguna) {
      return {
        ok: false,
        type: 'error',
        message: 'Username atau password salah',
      };
    }

    let currentFailedCount = Number(pengguna.jumlah_gagal || 0);

    // 3 & 4. Cek status kunci akun (Pengguna.isTerkunci & reset otomatis jika 5 menit sudah lewat)
    if (pengguna.waktu_kunci) {
      const lockUntil = new Date(pengguna.waktu_kunci);
      const now = new Date();
      if (now < lockUntil) {
        const sisa = formatRemainingTime(lockUntil.getTime() - now.getTime());
        return {
          ok: false,
          type: 'warning',
          message: 'Akun sedang dikunci, silakan coba beberapa saat lagi',
          detail: `Sisa waktu kunci akun: ${sisa}.`,
        };
      }

      // Masa kunci 5 menit sudah lewat -> reset percobaan gagal
      const { error: resetExpiredErr } = await db
        .from('pengguna')
        .update({ jumlah_gagal: 0, waktu_kunci: null })
        .eq('id_pengguna', pengguna.id_pengguna);

      if (resetExpiredErr) {
        console.warn('[SIAM Auth] Gagal mereset status kunci akun yang sudah kedaluwarsa:', resetExpiredErr);
      }
      currentFailedCount = 0;
    }

    // 5. Verifikasi hash(password) === pengguna.password
    const hashedInput = await hashPassword(password);
    if (hashedInput === pengguna.password) {
      // Reset percobaan gagal & waktu kunci
      await db
        .from('pengguna')
        .update({ jumlah_gagal: 0, waktu_kunci: null })
        .eq('id_pengguna', pengguna.id_pengguna);

      // Ambil profil detail sesuai peran
      const roleProfile = await fetchRoleProfile(db, pengguna);

      // Catat ke LogAktivitas
      const { error: logErr } = await db.from('log_aktivitas').insert({
        id_pengguna: pengguna.id_pengguna,
        aktivitas: 'login',
      });
      if (logErr) {
        console.warn('[SIAM Auth] Gagal mencatat LogAktivitas login:', logErr);
      }

      // Simpan sesi lengkap ke localStorage
      const sessionData = {
        id_pengguna: pengguna.id_pengguna,
        username: pengguna.username,
        peran: pengguna.peran,
        nama: roleProfile.nama,
        nomor_induk: roleProfile.nomor_induk,
        label_induk: roleProfile.label_induk,
        profil: roleProfile.profil,
        login_at: new Date().toISOString(),
      };
      global.localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));

      const redirectUrl = ROLE_ROUTES[pengguna.peran];
      if (!redirectUrl) {
        return {
          ok: false,
          type: 'error',
          message: `Halaman tujuan untuk peran "${pengguna.peran}" tidak ditemukan.`,
        };
      }

      return {
        ok: true,
        type: 'success',
        message: `Login berhasil sebagai ${pengguna.peran}. Mengarahkan ke Beranda...`,
        session: sessionData,
        redirectUrl,
      };
    }

    // 6. Password salah -> tambahPercobaanGagal
    const nextFailedCount = Math.min(MAX_FAILED_ATTEMPTS, currentFailedCount + 1);

    if (nextFailedCount >= MAX_FAILED_ATTEMPTS) {
      // Kunci akun selama 5 menit (Pengguna.kunciAkun(username, 5))
      const lockUntilIso = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000).toISOString();
      await db
        .from('pengguna')
        .update({
          jumlah_gagal: MAX_FAILED_ATTEMPTS,
          waktu_kunci: lockUntilIso,
        })
        .eq('id_pengguna', pengguna.id_pengguna);

      return {
        ok: false,
        type: 'error',
        message: 'Akun dikunci 5 menit',
        detail: 'Anda telah gagal login 3 kali berturut-turut. Silakan coba kembali setelah 5 menit.',
      };
    }

    await db
      .from('pengguna')
      .update({ jumlah_gagal: nextFailedCount })
      .eq('id_pengguna', pengguna.id_pengguna);

    return {
      ok: false,
      type: 'error',
      message: 'Username atau password salah',
      detail: `Percobaan gagal ${nextFailedCount} dari ${MAX_FAILED_ATTEMPTS}. Akun akan dikunci 5 menit setelah 3 kali gagal.`,
    };
  }

  /**
   * Merender panel daftar akun demo & memasang klik isi otomatis pada index.html.
   */
  function setupDemoAccountsPanel() {
    const btnDemo = document.getElementById('btnDemoAccount');
    const panel = document.getElementById('demoAccountsPanel');
    const listContainer = document.getElementById('demoAccountsList');
    const chevron = document.getElementById('demoAccountChevron');
    const inputUser = document.getElementById('nim_nip');
    const inputPass = document.getElementById('password');
    const btnLogin = document.getElementById('btnLogin');

    if (!btnDemo || !panel || !listContainer) return;

    listContainer.innerHTML = DEMO_ACCOUNTS.map(
      (acc, idx) => `
        <button type="button" data-demo-index="${idx}"
          class="w-full text-left bg-slate-50 hover:bg-blue-50/70 border border-slate-200/80 hover:border-[#2042B8]/40 rounded-xl p-3 transition group">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${acc.badgeClass}">
              ${acc.role}
            </span>
            <span class="text-[10px] font-semibold text-[#2042B8] opacity-80 group-hover:opacity-100">
              Klik untuk isi →
            </span>
          </div>
          <p class="text-xs font-bold text-slate-800 mt-1.5">${acc.nama}</p>
          <p class="text-[11px] font-mono text-slate-600 mt-0.5">
            ${acc.labelId}: <strong>${acc.username}</strong> • Pass: <strong>${acc.password}</strong>
          </p>
          <p class="text-[10px] text-slate-400 mt-0.5">${acc.keterangan}</p>
        </button>
      `
    ).join('');

    btnDemo.addEventListener('click', () => {
      const isHidden = panel.classList.toggle('hidden');
      if (chevron) {
        chevron.textContent = isHidden ? '▸' : '▾';
      }
    });

    listContainer.addEventListener('click', (event) => {
      const card = event.target.closest('[data-demo-index]');
      if (!card) return;
      const account = DEMO_ACCOUNTS[Number(card.dataset.demoIndex)];
      if (!account) return;

      if (inputUser) inputUser.value = account.username;
      if (inputPass) inputPass.value = account.password;
      hideLoginAlert();

      // Highlight ringan agar pengguna langsung melihat input telah terisi
      [inputUser, inputPass].forEach((el) => {
        if (!el) return;
        el.classList.add('ring-2', 'ring-blue-500/40', 'border-[#2042B8]');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-blue-500/40', 'border-[#2042B8]');
        }, 900);
      });

      if (btnLogin) btnLogin.focus();
    });
  }

  /**
   * Inisialisasi halaman Login (index.html).
   */
  function initLoginPage() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    setupDemoAccountsPanel();

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      hideLoginAlert();

      const inputUser = document.getElementById('nim_nip');
      const inputPass = document.getElementById('password');
      const username = inputUser ? inputUser.value : '';
      const password = inputPass ? inputPass.value : '';

      setLoadingState(true);
      try {
        const result = await authenticateUser(username, password);
        showLoginAlert(result.message, result.type, result.detail || '');

        if (result.ok && result.redirectUrl) {
          setTimeout(() => {
            global.location.replace(result.redirectUrl);
          }, 350);
        }
      } catch (err) {
        console.error('[SIAM Auth] Kesalahan tak terduga saat login:', err);
        showLoginAlert(
          err.message || 'Terjadi kesalahan saat memproses login.',
          'error'
        );
      } finally {
        setLoadingState(false);
      }
    });
  }

  // Ekspor untuk pengujian & utilitas lintas skrip
  global.SIAM_LOGIN = Object.freeze({
    hashPassword,
    authenticateUser,
    DEMO_ACCOUNTS,
    ROLE_ROUTES,
    SESSION_KEY,
  });

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initLoginPage);
    } else {
      initLoginPage();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
