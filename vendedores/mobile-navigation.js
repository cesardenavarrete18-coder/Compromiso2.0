(function () {
  "use strict";

  var menu = document.getElementById("mobileCrmMenu");
  var label = document.getElementById("mobileCrmMenuLabel");
  var desktopProposal = document.getElementById("proposeLeadButton");
  var mobileProposal = document.getElementById("mobileProposeLeadButton");
  var supabaseClient = window.grupoSurSupabaseClient;
  var activeLeadId = null;
  var recoveryStorageKey = "grupoSur:reopenRecoveredLead";
  if (!menu || !label) return;

  var labels = {
    agenda: "Mi Cartera",
    pipeline: "Embudo comercial",
    ranking: "Ranking",
    quotes: "Presupuestos",
    sales: "Mis ventas",
    recalls: "Rellamados",
    home: "Nueva gestión",
    history: "Actividad reciente"
  };

  function renderHistoryOnlyProtocolRecovery() {
    var experience = document.getElementById("crmNoContactExperience");
    var target = document.getElementById("crmNoContactProtocol");
    if (!activeLeadId || !experience || experience.hidden || !target) return;

    var hasHistoricalProtocol = Boolean(target.querySelector(".crm-protocol-history"));
    var hasCurrentProtocol = Boolean(target.querySelector(".crm-protocol-day"));
    var hasRecoveryAction = Boolean(target.querySelector("[data-reconcile-protocol], [data-start-current-protocol]"));
    if (!hasHistoricalProtocol || hasCurrentProtocol || hasRecoveryAction) return;

    var panel = document.createElement("div");
    panel.className = "crm-protocol-reconciliation crm-protocol-recovery";
    panel.innerHTML = '<div><strong>Sin protocolo activo</strong><span>El historial anterior se conserva. Iniciá el protocolo actual de 18 llamadas en 9 franjas para continuar este Lead.</span></div><button type="button" data-start-current-protocol>Iniciar protocolo actual</button>';
    target.insertBefore(panel, target.firstChild);
  }

  async function startCurrentProtocol(button) {
    var errorBox = document.getElementById("crmNoContactError");
    if (!supabaseClient || !activeLeadId) return;
    button.disabled = true;
    button.textContent = "Iniciando…";
    if (errorBox) errorBox.textContent = "";

    try {
      var result = await supabaseClient.rpc("reconcile_lead_contact_protocol", { p_lead_id: activeLeadId });
      if (result.error) throw result.error;
      try { window.sessionStorage.setItem(recoveryStorageKey, activeLeadId); } catch (_) {}
      window.location.reload();
    } catch (error) {
      if (errorBox) errorBox.textContent = error && error.message ? error.message : "No se pudo iniciar el protocolo actual.";
      button.disabled = false;
      button.textContent = "Iniciar protocolo actual";
    }
  }

  function restoreRecoveredLead() {
    var leadId = null;
    try { leadId = window.sessionStorage.getItem(recoveryStorageKey); } catch (_) {}
    if (!leadId) return;

    var attempts = 0;
    var timer = window.setInterval(function () {
      attempts += 1;
      var card = document.querySelector('[data-crm-lead-id="' + leadId + '"]');
      if (card) {
        window.clearInterval(timer);
        try { window.sessionStorage.removeItem(recoveryStorageKey); } catch (_) {}
        card.click();
      } else if (attempts >= 32) {
        window.clearInterval(timer);
        try { window.sessionStorage.removeItem(recoveryStorageKey); } catch (_) {}
      }
    }, 250);
  }

  menu.addEventListener("click", function (event) {
    var item = event.target.closest("button");
    if (!item) return;
    if (item === mobileProposal) {
      menu.open = false;
      if (desktopProposal) desktopProposal.click();
      return;
    }
    var view = item.dataset.crmView || item.dataset.action;
    if (labels[view]) label.textContent = labels[view];
    menu.open = false;
  });

  document.addEventListener("click", function (event) {
    var card = event.target.closest("[data-crm-lead-id]");
    if (card) {
      activeLeadId = card.dataset.crmLeadId;
      window.setTimeout(renderHistoryOnlyProtocolRecovery, 0);
    }

    var recoveryButton = event.target.closest("[data-start-current-protocol]");
    if (recoveryButton) {
      startCurrentProtocol(recoveryButton);
      return;
    }

    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") menu.open = false;
  });

  var protocolTarget = document.getElementById("crmNoContactProtocol");
  if (protocolTarget && typeof MutationObserver === "function") {
    new MutationObserver(renderHistoryOnlyProtocolRecovery).observe(protocolTarget, { childList: true, subtree: true });
  }

  restoreRecoveredLead();
}());
