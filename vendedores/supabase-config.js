(function () {
  "use strict";

  var config = Object.freeze({
    url: "https://cdtvuovsqwwopktdahgj.supabase.co",
    publishableKey: "sb_publishable_XM65HbXD3Qg5GRzjAiUpWg_uGiLkKCi"
  });

  window.GRUPO_SUR_SUPABASE_CONFIG = config;
  if (window.supabase && typeof window.supabase.createClient === "function") {
    var isAdminPortal = /^\/(?:administracion|vendedores\/admin)(?:\/|$)/.test(window.location.pathname);
    var isSupervisorPortal = /^\/(?:supervisores|vendedores\/supervisor)(?:\/|$)/.test(window.location.pathname);
    var isSalesAdminPortal = /^\/(?:admventas|vendedores\/admventas)(?:\/|$)/.test(window.location.pathname);
    var isSellerPortal = /^\/vendedores\/?$/.test(window.location.pathname);
    window.grupoSurSupabaseClient = window.supabase.createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: isAdminPortal
          ? "grupo-sur-admin-auth-v1"
          : isSalesAdminPortal
            ? "grupo-sur-sales-admin-auth-v1"
          : isSupervisorPortal
            ? "grupo-sur-supervisor-auth-v1"
            : "grupo-sur-seller-auth-v1"
      }
    });

    function loadCreditAdapter(src, done) {
      var script = document.createElement("script");
      script.src = src;
      script.async = false;
      if (done) script.addEventListener("load", done, { once: true });
      document.head.appendChild(script);
    }

    window.addEventListener("load", function () {
      if (!isAdminPortal && !isSellerPortal) return;
      loadCreditAdapter("/vendedores/credit-applicability-core.js?v=20260909-1", function () {
        loadCreditAdapter(isAdminPortal
          ? "/vendedores/credit-multi-vehicle-admin.js?v=20260909-1"
          : "/vendedores/credit-multi-vehicle-seller.js?v=20260909-1");
      });
    }, { once: true });
  }
}());
