(function () {
  "use strict";

  var supabaseClient = window.grupoSurSupabaseClient;
  if (!supabaseClient) return;

  var state = {
    protocolByLead: {},
    performanceBySeller: {},
    qualification: "",
    priority: "",
    operationalFilter: ""
  };
  var loading = false;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char];
    });
  }

  function localDateKey(value) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(value || new Date());
  }

  function monthStartKey() {
    var today = localDateKey(new Date());
    return today.slice(0, 7) + "-01";
  }

  function isProtocolActive(row) {
    return Boolean(row && row.protocol_status === "active");
  }

  function isProtocolOverdue(row, now) {
    return Boolean(
      isProtocolActive(row) &&
      row.next_task_due_end &&
      new Date(row.next_task_due_end).getTime() < (now || Date.now())
    );
  }

  function managementActionAt(row) {
    if (!row || isProtocolActive(row)) return null;
    if (row.operational_status === "entrevista") return row.interview_at || null;
    if (row.operational_status === "sena") return row.post_deposit_action_at || null;
    return row.manual_next_contact_at || null;
  }

  function isManagementOverdue(row, now) {
    var at = managementActionAt(row);
    return Boolean(at && new Date(at).getTime() < (now || Date.now()));
  }

  function protocolLabel(row) {
    if (!row) return "";
    if (row.protocol_status === "completed") return "PROTOCOLO AGOTADO";
    if (row.protocol_status !== "active") return "";
    var parts = ["EN PROTOCOLO"];
    if (row.protocol_current_call_attempt) parts.push("llamada " + row.protocol_current_call_attempt + "/" + (row.protocol_call_total || 18));
    if (row.protocol_current_day) parts.push("día " + row.protocol_current_day);
    if (row.protocol_current_band) parts.push(row.protocol_current_band);
    return parts.join(" · ");
  }

  async function loadOperationalData() {
    if (loading) return;
    var appView = document.getElementById("appView");
    if (!appView || appView.hidden) return;
    loading = true;
    try {
      var today = localDateKey(new Date());
      var results = await Promise.all([
        supabaseClient.rpc("get_supervisor_portfolio_followup_v2"),
        supabaseClient.rpc("get_supervisor_protocol_performance", {
          p_from: monthStartKey(),
          p_to: today
        })
      ]);
      if (!results[0].error) {
        state.protocolByLead = {};
        (results[0].data || []).forEach(function (row) { state.protocolByLead[row.lead_id] = row; });
      }
      if (!results[1].error) {
        state.performanceBySeller = {};
        (results[1].data || []).forEach(function (row) { state.performanceBySeller[row.seller_user_id] = row; });
      }
      augmentPortfolio();
    } finally {
      loading = false;
    }
  }

  function upsertOperationalStat(container, key, label, value, attention) {
    var article = container.querySelector('[data-operational-stat="' + key + '"]');
    if (!article) {
      article = document.createElement("article");
      article.dataset.operationalStat = key;
      container.appendChild(article);
    }
    article.className = "portfolio-stat" + (attention ? " attention" : "");
    article.innerHTML = "<span>" + escapeHtml(label) + "</span><strong>" + Number(value || 0) + "</strong>";
  }

  function replaceLegacyOverdueStat(container, value) {
    Array.prototype.forEach.call(container.querySelectorAll("article"), function (article) {
      var label = article.querySelector("span");
      var number = article.querySelector("strong");
      if (label && label.textContent.trim() === "Vencidas" && number) {
        label.textContent = "Gestión vencida";
        number.textContent = String(value);
        article.classList.toggle("attention", value > 0);
      }
    });
  }

  function augmentPortfolioStats() {
    var container = document.getElementById("portfolioStats");
    if (!container) return;
    var rows = Object.keys(state.protocolByLead).map(function (id) { return state.protocolByLead[id]; });
    var now = Date.now();
    var inProtocol = rows.filter(isProtocolActive).length;
    var protocolOverdue = rows.filter(function (row) { return isProtocolOverdue(row, now); }).length;
    var exhausted = rows.filter(function (row) { return row.protocol_exhausted === true && ["nuevo", "no_contesta"].includes(row.operational_status); }).length;
    var managementOverdue = rows.filter(function (row) { return isManagementOverdue(row, now); }).length;

    replaceLegacyOverdueStat(container, managementOverdue);
    upsertOperationalStat(container, "in_protocol", "En protocolo", inProtocol, false);
    upsertOperationalStat(container, "protocol_overdue", "Protocolo vencido", protocolOverdue, protocolOverdue > 0);
    upsertOperationalStat(container, "protocol_exhausted", "Protocolo agotado", exhausted, exhausted > 0);
  }

  function augmentSellerCards() {
    document.querySelectorAll("[data-portfolio-seller]").forEach(function (card) {
      var sellerId = card.dataset.portfolioSeller;
      var perf = state.performanceBySeller[sellerId];
      var leadRows = Object.keys(state.protocolByLead).map(function (id) { return state.protocolByLead[id]; });
      var activeCount = leadRows.filter(function (row) {
        return row.protocol_status === "active" && row.seller_user_id === sellerId;
      }).length;
      var summary = card.querySelector("[data-operational-seller]");
      if (!summary) {
        summary = document.createElement("small");
        summary.dataset.operationalSeller = "true";
        card.appendChild(summary);
      }
      var compliance = perf && perf.compliance_pct != null ? Number(perf.compliance_pct).toFixed(1).replace(".0", "") + "%" : "—";
      var onTime = perf && perf.on_time_pct != null ? Number(perf.on_time_pct).toFixed(1).replace(".0", "") + "%" : "—";
      summary.textContent = activeCount + " en protocolo · cumplimiento " + compliance + " · en horario " + onTime;
    });
  }

  function augmentPortfolioRows() {
    document.querySelectorAll("[data-portfolio-lead]").forEach(function (rowElement) {
      var row = state.protocolByLead[rowElement.dataset.portfolioLead];
      var existing = rowElement.querySelector("[data-protocol-progress]");
      if (!row || !["active", "completed"].includes(row.protocol_status)) {
        if (existing) existing.remove();
        return;
      }
      if (!existing) {
        existing = document.createElement("small");
        existing.dataset.protocolProgress = "true";
        existing.className = "protocol-progress-label";
        var targetCell = rowElement.children[5] || rowElement.children[6];
        if (targetCell) targetCell.appendChild(existing);
      }
      existing.textContent = protocolLabel(row);
      existing.classList.toggle("is-overdue", isProtocolOverdue(row));
      existing.classList.toggle("is-exhausted", row.protocol_status === "completed");
    });
  }

  function applyOperationalPortfolioFilter() {
    if (!state.operationalFilter) return;
    document.querySelectorAll("[data-portfolio-lead]").forEach(function (rowElement) {
      var row = state.protocolByLead[rowElement.dataset.portfolioLead];
      var visible = true;
      if (state.operationalFilter === "protocol") visible = isProtocolActive(row);
      if (state.operationalFilter === "protocol_overdue") visible = isProtocolOverdue(row);
      if (state.operationalFilter === "protocol_exhausted") visible = Boolean(row && row.protocol_exhausted === true);
      rowElement.hidden = !visible;
    });
  }

  function ensureOperationalQuickFilters() {
    var bar = document.getElementById("portfolioQuickFilters");
    if (!bar || bar.querySelector("[data-operational-filter]")) return;
    [
      ["protocol", "En protocolo"],
      ["protocol_overdue", "Protocolo vencido"],
      ["protocol_exhausted", "Protocolo agotado"]
    ].forEach(function (item) {
      var button = document.createElement("button");
      button.type = "button";
      button.dataset.operationalFilter = item[0];
      button.textContent = item[1];
      button.addEventListener("click", function () {
        state.operationalFilter = state.operationalFilter === item[0] ? "" : item[0];
        bar.querySelectorAll("[data-operational-filter]").forEach(function (node) {
          node.classList.toggle("active", node.dataset.operationalFilter === state.operationalFilter);
        });
        if (state.operationalFilter) {
          var baseSituation = document.getElementById("portfolioSituation");
          if (baseSituation) baseSituation.value = "";
          bar.querySelectorAll("[data-situation]").forEach(function (node) { node.classList.remove("active"); });
        }
        applyOperationalPortfolioFilter();
      });
      bar.appendChild(button);
    });
    bar.addEventListener("click", function (event) {
      if (event.target.closest("[data-situation]")) {
        state.operationalFilter = "";
        bar.querySelectorAll("[data-operational-filter]").forEach(function (node) { node.classList.remove("active"); });
      }
    });
  }

  function augmentPortfolio() {
    ensureOperationalQuickFilters();
    augmentPortfolioStats();
    augmentSellerCards();
    augmentPortfolioRows();
    applyOperationalPortfolioFilter();
  }

  function ensureLeadFilters() {
    var base = document.querySelector(".lead-view-filters");
    if (!base || document.getElementById("leadOperationalFilters")) return;
    var wrapper = document.createElement("div");
    wrapper.id = "leadOperationalFilters";
    wrapper.className = "lead-operational-filters";
    wrapper.innerHTML =
      '<label>Calificación IA<select id="leadQualificationFilter"><option value="">Todas</option><option value="qualified">Calificado</option><option value="follow_up">Seguimiento</option><option value="unqualified">No calificado</option></select></label>' +
      '<label>Prioridad<select id="leadPriorityFilter"><option value="">Todas</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baja</option></select></label>' +
      '<label class="temperature-preview">Temperatura comercial<select disabled title="Se habilitará cuando Seller V2 persista commercial_temperature"><option>Hot / Warm / Cold · próximamente</option></select></label>';
    base.insertAdjacentElement("afterend", wrapper);
    document.getElementById("leadQualificationFilter").addEventListener("change", function (event) {
      state.qualification = event.target.value;
      applyLeadFilters();
    });
    document.getElementById("leadPriorityFilter").addEventListener("change", function (event) {
      state.priority = event.target.value;
      applyLeadFilters();
    });
  }

  function applyLeadFilters() {
    var cards = Array.prototype.slice.call(document.querySelectorAll("#leadList .lead-card"));
    cards.forEach(function (card) {
      var qualificationBadge = card.querySelector(".badge.qualified, .badge.follow_up, .badge.unqualified");
      var priorityBadge = card.querySelector(".badge.high, .badge.normal, .badge.low");
      var qualification = qualificationBadge ? ["qualified", "follow_up", "unqualified"].find(function (key) { return qualificationBadge.classList.contains(key); }) || "" : "";
      var priority = priorityBadge ? ["high", "normal", "low"].find(function (key) { return priorityBadge.classList.contains(key); }) || "" : "";
      if (priorityBadge && priority === "low") priorityBadge.textContent = "Prioridad baja";
      var visible = (!state.qualification || qualification === state.qualification) && (!state.priority || priority === state.priority);
      card.hidden = !visible;
    });
    var visibleCount = cards.filter(function (card) { return !card.hidden; }).length;
    var empty = document.getElementById("emptyState");
    if (empty && cards.length) empty.hidden = visibleCount > 0;
  }

  function fixLegacyCopy() {
    var consent = document.querySelector("#manualLeadForm .consent-check span");
    if (consent && consent.textContent.indexOf("siete intentos") !== -1) {
      consent.textContent = "Confirmo que el cliente solicitó o autorizó este contacto comercial. El protocolo programará automáticamente 18 llamadas en 9 franjas comerciales, de lunes a sábado.";
    }
  }

  function installStyles() {
    if (document.getElementById("supervisorOperationalStyles")) return;
    var style = document.createElement("style");
    style.id = "supervisorOperationalStyles";
    style.textContent =
      ".protocol-progress-label{display:block;margin-top:6px;font-size:10px;font-weight:800;color:#1769aa}.protocol-progress-label.is-overdue,.protocol-progress-label.is-exhausted{color:#c43b24}.lead-operational-filters{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0 18px}.lead-operational-filters label{display:grid;gap:6px;font-size:11px;font-weight:800;text-transform:uppercase;color:#52657a}.lead-operational-filters select{min-width:190px;padding:11px 12px;border:1px solid #d6e1ed;border-radius:12px;background:#fff;font:inherit;text-transform:none}.temperature-preview{opacity:.65}";
    document.head.appendChild(style);
  }

  function installObservers() {
    var portfolioStats = document.getElementById("portfolioStats");
    var sellerSummary = document.getElementById("portfolioSellerSummary");
    var portfolioRows = document.getElementById("portfolioRows");
    var leadList = document.getElementById("leadList");
    var observer = new MutationObserver(function () {
      augmentPortfolio();
      applyLeadFilters();
    });
    [portfolioStats, sellerSummary, portfolioRows, leadList].filter(Boolean).forEach(function (node) {
      observer.observe(node, { childList: true, subtree: true });
    });
  }

  function init() {
    installStyles();
    ensureLeadFilters();
    ensureOperationalQuickFilters();
    fixLegacyCopy();
    installObservers();
    applyLeadFilters();

    var appView = document.getElementById("appView");
    if (appView) {
      new MutationObserver(function () {
        if (!appView.hidden) loadOperationalData();
      }).observe(appView, { attributes: true, attributeFilter: ["hidden"] });
    }
    var refresh = document.getElementById("refreshButton");
    if (refresh) refresh.addEventListener("click", function () { window.setTimeout(loadOperationalData, 250); });
    document.querySelectorAll('[data-supervisor-view="portfolio"]').forEach(function (button) {
      button.addEventListener("click", function () { window.setTimeout(loadOperationalData, 100); });
    });
    window.setTimeout(loadOperationalData, 300);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}());
