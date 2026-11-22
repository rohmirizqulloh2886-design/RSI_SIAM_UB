/**
 * SIAM UB — Modul KRS Online
 * Konfigurasi Koneksi Terpusat Supabase (Supabase JS v2 via CDN)
 *
 * Cara mengisi kredensial:
 * 1. Buka Dashboard Supabase -> pilih project Anda.
 * 2. Masuk ke menu "Project Settings" -> "API" (atau "Data API").
 * 3. Salin "Project URL" ke konstanta SUPABASE_URL di bawah ini.
 * 4. Salin "anon" / "public" key ke konstanta SUPABASE_ANON_KEY di bawah ini.
 *
 * Pastikan tag CDN berikut sudah dimuat sebelum file ini di setiap halaman HTML:
 * <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 * <script src="js/supabase-client.js"></script>
 */

(function initSupabaseClient(global) {
  const SUPABASE_URL = 'https://bamdtwtytlgwjinxhlut.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_QXF0HQjrjYt7_U6U0J7K8g_Ivnq366R';

  const isPlaceholder =
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_URL.includes('YOUR_PROJECT_REF') ||
    SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY');

  let client = null;

  if (!global.supabase || typeof global.supabase.createClient !== 'function') {
    console.error(
      '[SIAM Supabase] Library @supabase/supabase-js v2 CDN belum dimuat. ' +
      'Pastikan <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> dimuat sebelum js/supabase-client.js.'
    );
  } else if (isPlaceholder) {
    console.warn(
      '[SIAM Supabase] Kredensial Supabase belum dikonfigurasi. ' +
      'Silakan isi SUPABASE_URL dan SUPABASE_ANON_KEY pada file js/supabase-client.js.'
    );
  } else {
    client = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  /**
   * Mengembalikan instance Supabase client yang aktif.
   * Melempar error informatif jika kredensial belum diisi.
   */
  function getSupabaseClient() {
    if (!client) {
      throw new Error(
        'Koneksi Supabase belum dikonfigurasi. Silakan isi SUPABASE_URL dan SUPABASE_ANON_KEY di js/supabase-client.js.'
      );
    }
    return client;
  }

  /**
   * Mengecek apakah kredensial Supabase sudah diisi dan client siap digunakan.
   */
  function isSupabaseConfigured() {
    return Boolean(client);
  }

  global.supabaseClient = client;
  global.getSupabaseClient = getSupabaseClient;
  global.isSupabaseConfigured = isSupabaseConfigured;
  global.SIAM_SUPABASE_CONFIG = Object.freeze({
    url: SUPABASE_URL,
    configured: Boolean(client),
  });
})(window);
