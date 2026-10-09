// js/supabase-client.js
// Creates ONE Supabase client and attaches it to window.supabaseClient.
// Requires: @supabase/supabase-js UMD build loaded before this file.

(function () {
  if (!window.KAYN_SUPABASE_CONFIG) {
    console.error('supabase-config.js was not loaded before supabase-client.js');
    return;
  }
  const { url, anonKey } = window.KAYN_SUPABASE_CONFIG;

  if (!url || url.includes('PASTE_') || !anonKey || anonKey.includes('PASTE_')) {
    console.error('Supabase config placeholders have not been filled in.');
    return;
  }

  // window.supabase is the global provided by the UMD CDN build.
  window.supabaseClient = window.supabase.createClient(url, anonKey, {
    auth: {
      persistSession:    true,
      autoRefreshToken:  true,
      detectSessionInUrl: true
    }
  });
})();