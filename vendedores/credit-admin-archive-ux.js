(function () {
  "use strict";

  var supabaseClient = window.grupoSurSupabaseClient;
  var offerList = document.getElementById("creditOfferList");
  var message = document.getElementById("creditMessage");
  if (!supabaseClient || !offerList) return;

  var state = {
    view: "active",
    offers: new Map(),
    historyCounts: new Map(),
    refreshTimer: null,
    applying: false
  };

  function historyCount(offerId) {
    return Number(state.historyCounts.get(offerId) || 0);
  }

  function setMessage(text, isError) {
    if (!message) return;
    message.textContent = text || "";
    message.classList.toggle("is-error", Boolean(isError));
  }

  function injectStyles() {
    if (document.getElementById("creditArchiveUxStyles")) return;
    var style = document.createElement("style");
    style.id = "creditArchiveUxStyles";
    style.textContent = [
      ".credit-offer-state-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 12px}",
      ".credit-offer-state-tabs{display:inline-flex;gap:6px;padding:4px;border:1px solid #e4e7ec;border-radius:10px;background:#f8fafc}",
      ".credit-offer-state-tabs button{border:0;background:transparent;border-radius:7px;padding:7px 11px;font-weight:800;color:#667085;cursor:pointer}",
      ".credit-offer-state-tabs button.is-active{background:#fff;color:#101828;box-shadow:0 1px 2px rgba(16,24,40,.08)}",
      ".credit-offer-state-help{margin:0;color:#667085;font-size:12px}",
      ".credit-offer-row[hidden]{display:none!important}"
    ].join("");
    document.head.appendChild(style);
  }

  function ensureToolbar() {
    var toolbar = document.getElementById("creditOfferStateToolbar");
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.id = "creditOfferStateToolbar";
      toolbar.className = "credit-offer-state-toolbar";
      toolbar.innerHTML = '<div class="credit-offer-state-tabs" role="tablist" aria-label="Estado de créditos"><button type="button" data-credit-offer-view="active">Activos <span data-credit-active-count></span></button><button type="button" data-credit-offer-view="archived">Archivados <span data-credit-archived-count></span></button></div><p class="credit-offer-state-help">Los archivados conservan presupuestos históricos. Las líneas pausadas sin historial también se muestran en esta sección y se identifican como “Pausada”.</p>';
      offerList.parentNode.insertBefore(toolbar, offerList);
      toolbar.addEventListener("click", function (event) {
        var button = event.target.closest("[data-credit-offer-view]");
        if (!button) return;
        state.view = button.getAttribute("data-credit-offer-view") === "archived" ? "archived" : "active";
        applyRows();
      });
    }
    return toolbar;
  }

  function updateToolbar() {
    var toolbar = ensureToolbar();
    var activeCount = 0;
    var archivedCount = 0;
    state.offers.forEach(function (offer) {
      if (offer.active === false) archivedCount += 1; else activeCount += 1;
    });
    var activeNode = toolbar.querySelector("[data-credit-active-count]");
    var archivedNode = toolbar.querySelector("[data-credit-archived-count]");
    if (activeNode) activeNode.textContent = "(" + activeCount + ")";
    if (archivedNode) archivedNode.textContent = "(" + archivedCount + ")";
    toolbar.querySelectorAll("[data-credit-offer-view]").forEach(function (button) {
      var selected = button.getAttribute("data-credit-offer-view") === state.view;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
    });
  }

  function applyRows() {
    if (state.applying) return;
    state.applying = true;
    try {
      updateToolbar();
      offerList.querySelectorAll("[data-credit-multi-row][data-credit-id]").forEach(function (row) {
        var offerId = row.getAttribute("data-credit-id");
        var offer = state.offers.get(offerId);
        if (!offer) {
          row.hidden = true;
          return;
        }

        var hasHistory = historyCount(offerId) > 0;
        var isActive = offer.active !== false;
        row.hidden = state.view === "active" ? !isActive : isActive;

        var badge = row.querySelector(".credit-multi-state");
        if (badge) {
          badge.textContent = isActive ? "Activa" : (hasHistory ? "Archivada" : "Pausada");
          badge.classList.toggle("paused", !isActive);
        }

        var toggleButton = row.querySelector("[data-toggle-credit]");
        if (toggleButton) {
          toggleButton.textContent = isActive ? (hasHistory ? "Archivar" : "Pausar") : "Activar";
          toggleButton.title = isActive && hasHistory
            ? "Archiva la condición sin romper presupuestos históricos."
            : "";
        }

        var deleteButton = row.querySelector("[data-delete-credit]");
        if (deleteButton) {
          deleteButton.hidden = hasHistory;
          deleteButton.textContent = "Borrar definitivamente";
          deleteButton.title = hasHistory
            ? "No se puede borrar porque tiene presupuestos históricos."
            : "Borra la condición y sus vínculos porque no tiene presupuestos históricos.";
        }
      });
    } finally {
      state.applying = false;
    }
  }

  async function loadMeta() {
    var results = await Promise.all([
      supabaseClient.from("bank_credit_offers").select("id,active"),
      supabaseClient.from("sales_quotes").select("bank_credit_offer_id").not("bank_credit_offer_id", "is", null)
    ]);
    var failed = results.find(function (item) { return item.error; });
    if (failed) throw failed.error;

    state.offers = new Map((results[0].data || []).map(function (offer) {
      return [offer.id, offer];
    }));
    state.historyCounts = new Map();
    (results[1].data || []).forEach(function (quote) {
      var offerId = quote.bank_credit_offer_id;
      if (!offerId) return;
      state.historyCounts.set(offerId, historyCount(offerId) + 1);
    });
    applyRows();
  }

  function scheduleRefresh(delay) {
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(function () {
      loadMeta().catch(function (error) {
        setMessage(error.message || "No se pudo actualizar el estado de los créditos.", true);
      });
    }, delay == null ? 40 : delay);
  }

  injectStyles();
  ensureToolbar();

  var observer = new MutationObserver(function () {
    scheduleRefresh(60);
  });
  observer.observe(offerList, { childList: true });

  scheduleRefresh(0);
}());
