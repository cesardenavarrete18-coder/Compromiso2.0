(function () {
  "use strict";

  var config = Object.freeze({
    url: "https://cdtvuovsqwwopktdahgj.supabase.co",
    publishableKey: "sb_publishable_XM65HbXD3Qg5GRzjAiUpWg_uGiLkKCi"
  });

  window.GRUPO_SUR_SUPABASE_CONFIG = config;
  if (window.supabase && typeof window.supabase.createClient === "function") {
    window.grupoSurSupabaseClient = window.supabase.createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }
}());
