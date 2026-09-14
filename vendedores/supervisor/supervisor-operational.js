(function () {
  "use strict";

  var supabaseClient = window.grupoSurSupabaseClient;
  if (!supabaseClient) return;

  var state = {
    protocolByLead: {},
    performanceBySeller: {},
    qualification: "",
    priority: "",
    operationalFilter: "",
    adminHistoryRows: [],
    adminHistoryMonth: "",
    adminHistorySeller: "",
    adminHistoryStatus: "",
    adminHistoryLoading: false
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

  function currentMonthKey() {
    return localDateKey(new Date()).slice(0, 7);
  }

  function nextMonthKey(month) {
    var match = String(month || "").match(/^(\d{4})-(\d{2})$/);
    if (!match) return "";
    var year = Number(match[1]);
    var monthNumber = Number(match[2]);
    if (monthNumber < 1 || monthNumber > 12) return "";
    if (monthNumber === 12) return String(year + 1) + "-01";
    return String(year) + "-" + String(monthNumber + 1).padStart(2, "0");
  }

  function monthBounds(month) {
    var next = nextMonthKey(month);
    if (!next) return null;
    return {
      from: month + "-01T00:00:00-03:00",
      to: next + "-01T00:00:00-03:00"
    };
  }

  function formatDateTime(value) {
    if (!value) return "Fecha no informada";
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function money(value) {
    if (value == null || value === "") return "Importe no informado";
    return "$" + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Number(value));
  }

  function administrativeStatusLabel(value) {
    return {
      minute_pending: "Minuta pendiente",
      dealer_scoring: "Scoring concesionario",
      contract_signature: "Firma de contrato",
      quality_control: "Control de calidad",
      formation_group: "Formación de grupo",
      grouped: "Agrupada",
      cancelled: "Baja"
    }[value] || value || "Sin estado";
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

  function isOperationallyExhausted(row) {
    return Boolean(row && row.protocol_exhausted === true && ["nuevo", "no_contesta"].includes(row.operational_status));
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
    if (isOperationallyExhausted(row)) return "PROTOCOLO AGOTADO";
    if (row.protocol_status !== "active") return "";
    var total = Number(row.protocol_call_total || 18);
    var attempt = Number(row.protocol_current_call_attempt || Math.min(total, Number(row.protocol_call_completed || 0) + 1));
    var parts = ["EN PROTOCOLO", "llamada " + attempt + "/" + total];
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
    var desiredClass = "portfolio-stat" + (attention ? " attention" : "");
    var desiredHtml = "<span>" + escapeHtml(label) + "</span><strong>" + Number(value || 0) + "</strong>";
    if (article.className !== desiredClass) article.className = desiredClass;
    if (article.innerHTML !== desiredHtml) article.innerHTML = desiredHtml;
  }

  function replaceLegacyOverdueStat(container, value) {
    Array.prototype.forEach.call(container.querySelectorAll("article"), function (article) {
      var label = article.querySelector("span");
      var number = article.querySelector("strong");
      if (!label || !number || !["Vencidas", "Gestión vencida"].includes(label.textContent.trim())) return;
      if (label.textContent !== "Gestión vencida") label.textContent = "Gestión vencida";
      if (number.textContent !== String(value)) number.textContent = String(value);
      article.classList.toggle("attention", value > 0);
    });
  }

  function augmentPortfolioStats() {
    var container = document.getElementById("portfolioStats");
    if (!container) return;
    var rows = Object.keys(state.protocolByLead).map(function (id) { return state.protocolByLead[id]; });
    var now = Date.now();
    var inProtocol = rows.filter(isProtocolActive).length;
    var protocolOverdue = rows.filter(function (row) { return isProtocolOverdue(row, now); }).length;
    var exhausted = rows.filter(isOperationallyExhausted).length;
    var managementOverdue = rows.filter(function (row) { return isManagementOverdue(row, now); }).length;

    replaceLegacyOverdueStat(container, managementOverdue);
    upsertOperationalStat(container, "in_protocol", "En protocolo", inProtocol, false);
    upsertOperationalStat(container, "protocol_overdue", "Protocolo vencido", protocolOverdue, protocolOverdue > 0);
    upsertOperationalStat(container, "protocol_exhausted", "Protocolo agotado", exhausted, exhausted > 0);
  }

  function augmentSellerCards() {
    var leadRows = Object.keys(state.protocolByLead).map(function (id) { return state.protocolByLead[id]; });
    document.querySelectorAll("[data-portfolio-seller]").forEach(function (card) {
      var sellerId = card.dataset.portfolioSeller;
      var perf = state.performanceBySeller[sellerId];
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
      var desired = activeCount + " en protocolo · cumplimiento " + compliance + " · en horario " + onTime;
      if (summary.textContent !== desired) summary.textContent = desired;
    });
  }

  function augmentPortfolioRows() {
    document.querySelectorAll("[data-portfolio-lead]").forEach(function (rowElement) {
      var row = state.protocolByLead[rowElement.dataset.portfolioLead];
      var existing = rowElement.querySelector("[data-protocol-progress]");
      var shouldShow = Boolean(row && (row.protocol_status === "active" || isOperationallyExhausted(row)));
      if (!shouldShow) {
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
      var desired = protocolLabel(row);
      if (existing.textContent !== desired) existing.textContent = desired;
      existing.classList.toggle("is-overdue", isProtocolOverdue(row));
      existing.classList.toggle("is-exhausted", isOperationallyExhausted(row));
    });
  }

  function applyOperationalPortfolioFilter() {
    if (!state.operationalFilter) return;
    document.querySelectorAll("[data-portfolio-lead]").forEach(function (rowElement) {
      var row = state.protocolByLead[rowElement.dataset.portfolioLead];
      var visible = true;
      if (state.operationalFilter === "protocol") visible = isProtocolActive(row);
      if (state.operationalFilter === "protocol_overdue") visible = isProtocolOverdue(row);
      if (state.operationalFilter === "protocol_exhausted") visible = isOperationallyExhausted(row);
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
      if (priorityBadge && priority === "low" && priorityBadge.textContent !== "Prioridad baja") priorityBadge.textContent = "Prioridad baja";
      var visible = (!state.qualification || qualification === state.qualification) && (!state.priority || priority === state.priority);
      card.hidden = !visible;
    });
    var visibleCount = cards.filter(function (card) { return !card.hidden; }).length;
    var empty = document.getElementById("emptyState");
    if (empty && cards.length) empty.hidden = visibleCount > 0;
  }

  function ensureAdministrativeHistory() {
    var anchor = document.querySelector('.admin-sales-panel[data-supervisor-panel="administration"]');
    if (!anchor || document.getElementById("adminSalesHistoryPanel")) return;

    var panel = document.createElement("section");
    panel.id = "adminSalesHistoryPanel";
    panel.className = "admin-sales-history-panel";
    panel.dataset.supervisorPanel = "administration";
    panel.hidden = true;
    panel.innerHTML =
      '<div class="section-head admin-sales-history-heading"><div><h2>Histórico de ventas finalizadas</h2><p>Consultá las operaciones por el mes en que fueron finalizadas. Este período es independiente del cumplimiento de cuotas.</p></div><span id="adminSalesHistoryCount">0 ventas</span></div>' +
      '<div class="admin-sales-history-filters">' +
        '<label>Mes<input id="adminSalesHistoryMonth" type="month"></label>' +
        '<label>Vendedor<select id="adminSalesHistorySeller"><option value="">Todos</option></select></label>' +
        '<label>Estado actual<select id="adminSalesHistoryStatus"><option value="">Todos</option></select></label>' +
      '</div>' +
      '<p class="message" id="adminSalesHistoryMessage" role="status"></p>' +
      '<div class="admin-sales-history-list" id="adminSalesHistoryList"></div>';
    anchor.insertAdjacentElement("afterend", panel);

    state.adminHistoryMonth = currentMonthKey();
    document.getElementById("adminSalesHistoryMonth").value = state.adminHistoryMonth;
    document.getElementById("adminSalesHistoryMonth").addEventListener("change", function (event) {
      state.adminHistoryMonth = event.target.value;
      loadAdministrativeHistory();
    });
    document.getElementById("adminSalesHistorySeller").addEventListener("change", function (event) {
      state.adminHistorySeller = event.target.value;
      renderAdministrativeHistory();
    });
    document.getElementById("adminSalesHistoryStatus").addEventListener("change", function (event) {
      state.adminHistoryStatus = event.target.value;
      renderAdministrativeHistory();
    });
  }

  function populateAdministrativeHistoryFilters() {
    var sellerSelect = document.getElementById("adminSalesHistorySeller");
    var statusSelect = document.getElementById("adminSalesHistoryStatus");
    if (!sellerSelect || !statusSelect) return;

    var sellers = {};
    var statuses = {};
    state.adminHistoryRows.forEach(function (sale) {
      var seller = Array.isArray(sale.seller) ? sale.seller[0] : sale.seller;
      if (sale.seller_user_id) sellers[sale.seller_user_id] = seller && seller.full_name || "Vendedor";
      if (sale.status) statuses[sale.status] = administrativeStatusLabel(sale.status);
    });

    sellerSelect.innerHTML = '<option value="">Todos</option>' + Object.keys(sellers).sort(function (a, b) {
      return sellers[a].localeCompare(sellers[b], "es-AR");
    }).map(function (sellerId) {
      return '<option value="' + escapeHtml(sellerId) + '">' + escapeHtml(sellers[sellerId]) + '</option>';
    }).join("");
    if (sellers[state.adminHistorySeller]) sellerSelect.value = state.adminHistorySeller;
    else state.adminHistorySeller = "";

    statusSelect.innerHTML = '<option value="">Todos</option>' + Object.keys(statuses).sort(function (a, b) {
      return statuses[a].localeCompare(statuses[b], "es-AR");
    }).map(function (status) {
      return '<option value="' + escapeHtml(status) + '">' + escapeHtml(statuses[status]) + '</option>';
    }).join("");
    if (statuses[state.adminHistoryStatus]) statusSelect.value = state.adminHistoryStatus;
    else state.adminHistoryStatus = "";
  }

  function renderAdministrativeHistory() {
    var list = document.getElementById("adminSalesHistoryList");
    var count = document.getElementById("adminSalesHistoryCount");
    if (!list || !count) return;

    var rows = state.adminHistoryRows.filter(function (sale) {
      return (!state.adminHistorySeller || sale.seller_user_id === state.adminHistorySeller) &&
        (!state.adminHistoryStatus || sale.status === state.adminHistoryStatus);
    });
    count.textContent = rows.length === 1 ? "1 venta" : rows.length + " ventas";
    list.innerHTML = rows.length ? rows.map(function (sale) {
      var seller = Array.isArray(sale.seller) ? sale.seller[0] : sale.seller;
      var lead = Array.isArray(sale.lead) ? sale.lead[0] : sale.lead;
      return '<article class="admin-sales-history-card">' +
        '<div><span class="case-code">' + escapeHtml(sale.case_code) + '</span><strong>' + escapeHtml(lead && lead.customer_name || "Cliente") + '</strong><small>' + escapeHtml(seller && seller.full_name || "Vendedor") + ' · ' + escapeHtml(sale.vehicle || "Vehículo no informado") + '</small></div>' +
        '<div class="admin-sales-history-result"><strong>' + escapeHtml(money(sale.sale_amount)) + '</strong><span>' + escapeHtml(administrativeStatusLabel(sale.status)) + '</span><small>Finalizada ' + escapeHtml(formatDateTime(sale.finalized_at)) + '</small></div>' +
      '</article>';
    }).join("") : '<div class="sales-empty">No hay ventas finalizadas que coincidan con este mes y los filtros seleccionados.</div>';
  }

  async function loadAdministrativeHistory() {
    ensureAdministrativeHistory();
    if (state.adminHistoryLoading) return;
    var appView = document.getElementById("appView");
    var message = document.getElementById("adminSalesHistoryMessage");
    if (!appView || appView.hidden || !message) return;

    var monthInput = document.getElementById("adminSalesHistoryMonth");
    var month = monthInput && monthInput.value || state.adminHistoryMonth || currentMonthKey();
    var bounds = monthBounds(month);
    if (!bounds) return;
    state.adminHistoryMonth = month;
    state.adminHistoryLoading = true;
    message.textContent = "Cargando histórico…";
    try {
      var result = await supabaseClient
        .from("sales_cases")
        .select("id, case_code, seller_user_id, vehicle, status, sale_amount, finalized_at, seller:profiles!sales_cases_seller_user_id_fkey(full_name, seller_code), lead:leads!sales_cases_lead_id_fkey(customer_name)")
        .not("finalized_at", "is", null)
        .gte("finalized_at", bounds.from)
        .lt("finalized_at", bounds.to)
        .order("finalized_at", { ascending: false });
      if (result.error) throw result.error;
      state.adminHistoryRows = result.data || [];
      populateAdministrativeHistoryFilters();
      renderAdministrativeHistory();
      message.textContent = "";
    } catch (error) {
      state.adminHistoryRows = [];
      populateAdministrativeHistoryFilters();
      renderAdministrativeHistory();
      message.textContent = "No se pudo cargar el histórico de ventas: " + (error && error.message || "error desconocido");
    } finally {
      state.adminHistoryLoading = false;
    }
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
      ".protocol-progress-label{display:block;margin-top:6px;font-size:10px;font-weight:800;color:#1769aa}.protocol-progress-label.is-overdue,.protocol-progress-label.is-exhausted{color:#c43b24}.lead-operational-filters{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0 18px}.lead-operational-filters label{display:grid;gap:6px;font-size:11px;font-weight:800;text-transform:uppercase;color:#52657a}.lead-operational-filters select{min-width:190px;padding:11px 12px;border:1px solid #d6e1ed;border-radius:12px;background:#fff;font:inherit;text-transform:none}.temperature-preview{opacity:.65}.admin-sales-history-panel{margin-top:24px}.admin-sales-history-heading{align-items:flex-end}.admin-sales-history-filters{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0 18px}.admin-sales-history-filters label{display:grid;gap:6px;font-size:11px;font-weight:800;text-transform:uppercase;color:#52657a}.admin-sales-history-filters input,.admin-sales-history-filters select{min-width:190px;padding:11px 12px;border:1px solid #d6e1ed;border-radius:12px;background:#fff;font:inherit;text-transform:none}.admin-sales-history-list{display:grid;gap:10px}.admin-sales-history-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center;padding:16px 18px;border:1px solid #dce6f0;border-radius:14px;background:#fff}.admin-sales-history-card>div{display:grid;gap:4px}.admin-sales-history-card strong{font-size:14px}.admin-sales-history-card small,.admin-sales-history-card span{font-size:12px}.admin-sales-history-result{text-align:right}.admin-sales-history-result span{font-weight:800}@media(max-width:760px){.admin-sales-history-card{grid-template-columns:1fr}.admin-sales-history-result{text-align:left}}";
    document.head.appendChild(style);
  }

  function installObservers() {
    var portfolioRows = document.getElementById("portfolioRows");
    var leadList = document.getElementById("leadList");
    var observer = new MutationObserver(function () {
      augmentPortfolio();
      applyLeadFilters();
    });
    [portfolioRows, leadList].filter(Boolean).forEach(function (node) {
      observer.observe(node, { childList: true, subtree: false });
    });
  }

  function init() {
    installStyles();
    ensureLeadFilters();
    ensureOperationalQuickFilters();
    ensureAdministrativeHistory();
    fixLegacyCopy();
    installObservers();
    applyLeadFilters();

    var appView = document.getElementById("appView");
    if (appView) {
      new MutationObserver(function () {
        if (!appView.hidden) {
          loadOperationalData();
          loadAdministrativeHistory();
        }
      }).observe(appView, { attributes: true, attributeFilter: ["hidden"] });
    }
    var refresh = document.getElementById("refreshButton");
    if (refresh) refresh.addEventListener("click", function () {
      window.setTimeout(loadOperationalData, 250);
      window.setTimeout(loadAdministrativeHistory, 250);
    });
    document.querySelectorAll('[data-supervisor-view="portfolio"]').forEach(function (button) {
      button.addEventListener("click", function () { window.setTimeout(loadOperationalData, 100); });
    });
    document.querySelectorAll('[data-supervisor-view="administration"]').forEach(function (button) {
      button.addEventListener("click", function () { window.setTimeout(loadAdministrativeHistory, 100); });
    });
    window.setTimeout(loadOperationalData, 300);
    window.setTimeout(loadAdministrativeHistory, 300);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}());