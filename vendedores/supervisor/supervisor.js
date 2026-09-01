(function () {
  "use strict";

  var supabaseClient = window.grupoSurSupabaseClient;
  var followUpModel = window.grupoSurFollowUpModel;
  var state = { profile: null, sellers: [], settings: {}, leads: [], portfolio: {}, goals: [], templates: [], sales: [], adminSales: [], appraisals: [], conversationControls: {}, portfolioSelection: [], visiblePortfolioLeadIds: [], activeConversationLead: null, activeSale: null, activeAppraisal: null, view: "leads", filter: "pending_supervisor", search: "" };
  var loginView = document.getElementById("loginView");
  var appView = document.getElementById("appView");
  var loginForm = document.getElementById("loginForm");
  var loginMessage = document.getElementById("loginMessage");
  var pageMessage = document.getElementById("pageMessage");

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char];
    });
  }

  function initials(value) {
    return String(value || "SU").split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0); }).join("").toUpperCase();
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  function parseArgentineDateTime(dateValue, timeValue) {
    var dateText = String(dateValue || "").trim();
    var timeText = String(timeValue || "").trim();
    if (!dateText && !timeText) return null;
    if (!dateText || !timeText) throw new Error("Completá la fecha y la hora del primer contacto.");
    var match = dateText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) throw new Error("Ingresá la fecha con formato dd/mm/aaaa.");
    var day = Number(match[1]);
    var month = Number(match[2]);
    var year = Number(match[3]);
    var probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) throw new Error("La fecha del primer contacto no es válida.");
    return new Date(String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0") + "T" + timeText + ":00-03:00").toISOString();
  }

  function maskDateInput(input) {
    var digits = input.value.replace(/\D/g, "").slice(0, 8);
    input.value = digits.length > 4 ? digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4) : digits.length > 2 ? digits.slice(0, 2) + "/" + digits.slice(2) : digits;
  }

  function money(value) {
    if (value == null || value === "") return "Importe no informado";
    return "$" + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Number(value));
  }

  function marketMoney(value, currency) {
    if (value == null || value === "") return "Importe no informado";
    return (currency === "USD" ? "US$" : "$") + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Number(value));
  }

  function appraisalMarketStatus(appraisal) {
    if (!appraisal) return "Sin usado cargado";
    if (appraisal.status === "confirmed") return marketMoney(appraisal.confirmed_value, appraisal.confirmed_currency || appraisal.market_currency);
    if (appraisal.suggested_value != null) return "Sugerido " + marketMoney(appraisal.suggested_value, appraisal.market_currency);
    if (appraisal.estimate_source === "mercadolibre_request_failed") return "Consulta fallida";
    if (appraisal.estimate_source === "mercadolibre_insufficient_sample") return "Comparables insuficientes";
    return "Consulta pendiente";
  }

  function appraisalMarketDetail(appraisal) {
    if (appraisal.market_median != null) return "Mediana publicada: " + marketMoney(appraisal.market_median, appraisal.market_currency) + " · Toma sugerida (-15%): " + marketMoney(appraisal.suggested_value, appraisal.market_currency) + " · " + appraisal.reference_count + " comparables";
    if (appraisal.estimate_source === "mercadolibre_request_failed") return appraisal.estimate_basis || "La consulta a Mercado Libre no pudo completarse.";
    if (appraisal.estimate_source === "mercadolibre_insufficient_sample") return "No alcanzó el mínimo de 6 publicaciones comparables válidas.";
    return "La consulta de mercado todavía no se completó.";
  }

  function localDateKey(value) {
    var date = new Date(value);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? label : button.dataset.label;
  }

  async function getManagementProfile() {
    var userResult = await supabaseClient.auth.getUser();
    var user = userResult.data && userResult.data.user;
    if (!user || userResult.error) return null;
    var result = await supabaseClient.from("profiles").select("user_id, full_name, role, active").eq("user_id", user.id).single();
    if (result.error || !result.data || !["supervisor", "admin"].includes(result.data.role) || !result.data.active) return null;
    return result.data;
  }

  async function loadPagedRows(buildQuery) {
    var pageSize = 1000;
    var rows = [];
    for (var from = 0; ; from += pageSize) {
      var result = await buildQuery().range(from, from + pageSize - 1);
      if (result.error) return result;
      rows = rows.concat(result.data || []);
      if (!result.data || result.data.length < pageSize) break;
    }
    return { data: rows, error: null };
  }

  function loadSupervisorLeads() {
    var select = "id, customer_phone, customer_name, source_channel, source_detail, seller_code_received, qualification_status, priority, intent_summary, model_interest, routing_status, routing_reason, assigned_seller_user_id, assigned_at, last_message_at, created_at, attribution:lead_attributions(platform,campaign_name,adset_name,ad_name,headline), tiktok_attributions:lead_tiktok_attributions(identifier_type,raw_identifier,outcome,routing_reason,created_at), crm:lead_crm(status, priority, status_reason, next_contact_at, next_contact_note, next_contact_source, last_contact_at, last_contact_outcome, interview_at, sale_confirmation_status, sale_confirmed_at)";
    return loadPagedRows(function () { return supabaseClient.from("leads").select(select).order("last_message_at", { ascending: false }); });
  }

  function loadSupervisorPortfolioSummary() {
    return loadPagedRows(function () { return supabaseClient.rpc("get_supervisor_portfolio_followup").order("lead_id"); });
  }

  async function loadData(silent) {
    if (!silent) pageMessage.textContent = "Actualizando información…";
    var results = await Promise.all([
      supabaseClient.from("profiles").select("user_id, full_name, seller_code, active").eq("role", "seller").order("full_name"),
      supabaseClient.from("seller_routing_settings").select("seller_user_id, daily_quota, paused"),
      loadSupervisorLeads(),
      supabaseClient.from("lead_sale_requests").select("id, lead_id, seller_user_id, vehicle, sale_amount, notes, status, requested_at, provisional_application_id, seller:profiles!lead_sale_requests_seller_user_id_fkey(full_name, seller_code), lead:leads(customer_name, customer_phone, intent_summary), provisional:commercial_applications!lead_sale_requests_provisional_application_id_fkey(request_code, brand_name, model_name, campaign_name, first_name, last_name, document_type, document_number, cuil, primary_phone, email, employment_status, employer_name, employment_seniority, monthly_income, automatic_debit, deferred_installment, installments_paid, installments_to_pay, plan_type, agreed_price, commercial_snapshot)").eq("status", "pending").order("requested_at"),
      supabaseClient.from("sales_cases").select("id, case_code, seller_user_id, vehicle, status, cdn_scoring_status, dealer_scoring_status, contract_status, finalized_at, cancellation_reason, updated_at, seller:profiles!sales_cases_seller_user_id_fkey(full_name, seller_code), lead:leads!sales_cases_lead_id_fkey(customer_name), events:sales_case_events(stage, outcome, comment, created_at)").order("updated_at", { ascending: false }).limit(250),
      loadSupervisorPortfolioSummary(),
      supabaseClient.from("commercial_goals").select("id, period_month, seller_user_id, target_contacts, target_interviews, target_sales, target_finalized").order("period_month", { ascending: false }).limit(500),
      supabaseClient.from("contact_message_templates").select("id, step_number, title, body, active, updated_at").order("step_number"),
      supabaseClient.from("vehicle_appraisals").select("id, lead_id, brand, model, version, vehicle_year, mileage_km, condition, notes, estimated_min, estimated_max, market_median, suggested_value, market_currency, estimate_source, estimate_basis, reference_count, market_references, market_checked_at, status, confirmed_value, confirmed_currency, review_note, updated_at").order("updated_at", { ascending: false }).limit(500),
      supabaseClient.from("whatsapp_conversation_controls").select("lead_id, mode, taken_by_user_id, taken_at, released_at, last_human_message_at, updated_at").limit(500)
    ]);
    var failed = results.find(function (item) { return item.error; });
    if (failed) throw failed.error;
    state.sellers = results[0].data || [];
    state.settings = {};
    (results[1].data || []).forEach(function (item) { state.settings[item.seller_user_id] = item; });
    state.leads = results[2].data || [];
    state.sales = results[3].data || [];
    state.adminSales = results[4].data || [];
    state.portfolio = {};
    (results[5].data || []).forEach(function (item) { state.portfolio[item.lead_id] = item; });
    state.goals = results[6].data || [];
    state.templates = results[7].data || [];
    state.appraisals = results[8].data || [];
    state.conversationControls = {};
    (results[9].data || []).forEach(function (item) { state.conversationControls[item.lead_id] = item; });
    renderAll();
    pageMessage.textContent = "";
  }

  function sellerById(id) {
    return state.sellers.find(function (seller) { return seller.user_id === id; });
  }

  function crmOf(lead) {
    if (!lead || !lead.crm) return { status: "nuevo", priority: lead && lead.priority || "normal" };
    return Array.isArray(lead.crm) ? lead.crm[0] || {} : lead.crm;
  }

  function crmStatusLabel(value) {
    return { nuevo: "Nuevo", no_contesta: "No contesta", en_proceso: "En proceso", invalido: "Inválido / Erróneo", entrevista: "Entrevista", cierre: "Cierre", sena: "Seña", venta: "Venta", desistir: "Desistir" }[value] || "Nuevo";
  }

  function priorityLabel(value) {
    return { high: "Alta", normal: "Normal", low: "Baja" }[value] || "Normal";
  }

  function appraisalForLead(leadId) {
    return state.appraisals.find(function (item) { return item.lead_id === leadId; }) || null;
  }

  function conversationControlForLead(leadId) {
    return state.conversationControls[leadId] || { lead_id: leadId, mode: "ai" };
  }

  function conversationOwnerName(control) {
    if (!control || !control.taken_by_user_id) return "";
    if (state.profile && control.taken_by_user_id === state.profile.user_id) return state.profile.full_name;
    var seller = sellerById(control.taken_by_user_id);
    return seller ? seller.full_name : "otro usuario del equipo";
  }

  function renderWhatsAppInbox() {
    var list = document.getElementById("whatsappInboxList");
    if (!list) return;
    var mode = document.getElementById("whatsappModeFilter").value;
    var query = document.getElementById("whatsappSearch").value.trim().toLocaleLowerCase("es-AR");
    var rows = state.leads.filter(function (lead) {
      var isWhatsApp = ["whatsapp", "tiktok"].includes(lead.source_channel) || lead.source_detail === "meta_ads";
      var control = conversationControlForLead(lead.id);
      var haystack = [lead.customer_name, lead.customer_phone, lead.model_interest, lead.intent_summary].join(" ").toLocaleLowerCase("es-AR");
      return isWhatsApp && (mode === "all" || control.mode === mode) && (!query || haystack.includes(query));
    });
    document.getElementById("whatsappInboxEmpty").hidden = rows.length > 0;
    list.innerHTML = rows.map(function (lead) {
      var control = conversationControlForLead(lead.id);
      var seller = sellerById(lead.assigned_seller_user_id);
      return '<article class="whatsapp-inbox-row ' + (control.mode === "human" ? "is-human" : "") + '" data-whatsapp-lead-id="' + lead.id + '">' +
        '<div class="whatsapp-inbox-customer"><strong>' + escapeHtml(lead.customer_name || "+" + lead.customer_phone) + '</strong><small>+' + escapeHtml(lead.customer_phone) + ' · ' + escapeHtml(formatDate(lead.last_message_at)) + '</small></div>' +
        '<div class="whatsapp-inbox-summary"><strong>' + escapeHtml(lead.intent_summary || "Conversación sin resumen") + '</strong><small>' + escapeHtml(lead.model_interest || "Modelo a definir") + ' · ' + escapeHtml(seller ? seller.full_name : "Sin vendedor") + '</small></div>' +
        '<div><span class="conversation-mode ' + control.mode + '">' + (control.mode === "human" ? "Atención humana" : "IA activa") + '</span>' + (control.mode === "human" ? '<small class="whatsapp-inbox-owner">' + escapeHtml(conversationOwnerName(control)) + '</small>' : '') + '</div>' +
        '<button class="button secondary" type="button" data-open-whatsapp>Ver conversación</button></article>';
    }).join("");
  }

  function portfolioEntry(lead, now) {
    var summary = state.portfolio[lead.id] || {};
    return { lead: lead, summary: summary, derived: followUpModel.deriveFollowUpStatus(lead, summary, now) };
  }

  function activeSellerOptions(excludedSellerId) {
    return state.sellers.filter(function (seller) {
      return seller.active && seller.user_id !== excludedSellerId;
    }).map(function (seller) {
      return '<option value="' + seller.user_id + '">' + escapeHtml(seller.full_name + " · " + seller.seller_code) + '</option>';
    }).join("");
  }

  function renderPortfolioSelection(rows) {
    var existingLeadIds = new Set(state.leads.filter(function (lead) { return lead.assigned_seller_user_id; }).map(function (lead) { return lead.id; }));
    state.portfolioSelection = state.portfolioSelection.filter(function (leadId) { return existingLeadIds.has(leadId); });
    state.visiblePortfolioLeadIds = rows.map(function (entry) { return entry.lead.id; });
    var selected = new Set(state.portfolioSelection);
    var visibleSelected = state.visiblePortfolioLeadIds.filter(function (leadId) { return selected.has(leadId); }).length;
    var selectVisible = document.getElementById("portfolioSelectVisible");
    selectVisible.checked = Boolean(state.visiblePortfolioLeadIds.length && visibleSelected === state.visiblePortfolioLeadIds.length);
    selectVisible.indeterminate = Boolean(visibleSelected && visibleSelected < state.visiblePortfolioLeadIds.length);

    var bulkBar = document.getElementById("portfolioBulkBar");
    bulkBar.hidden = state.portfolioSelection.length === 0;
    document.getElementById("portfolioSelectedCount").textContent = state.portfolioSelection.length + (state.portfolioSelection.length === 1 ? " seleccionado" : " seleccionados");
    var sellerSelect = document.getElementById("portfolioBulkSeller");
    var selectedSeller = sellerSelect.value;
    sellerSelect.innerHTML = '<option value="">Elegí un vendedor activo</option>' + activeSellerOptions();
    if (selectedSeller && state.sellers.some(function (seller) { return seller.active && seller.user_id === selectedSeller; })) sellerSelect.value = selectedSeller;
    if (!state.portfolioSelection.length) document.getElementById("portfolioBulkMessage").textContent = "";
  }

  function relativeActionLabel(value, now) {
    if (!value) return "";
    var parts = followUpModel.elapsedParts(value, now);
    var label = parts.days ? parts.days + (parts.days === 1 ? " día" : " días") : parts.hours ? parts.hours + " h" + (parts.minutes ? " " + parts.minutes + " min" : "") : parts.minutes + " min";
    return "Vencida hace " + label;
  }

  function contactOutcomeLabel(value) {
    return { answered: "Respondió", no_answer: "No respondió", sent: "WhatsApp enviado", invalid: "Contacto inválido", no_interest: "Sin interés", requested_no_contact: "No contactar" }[value] || value || "Sin resultado informado";
  }

  function renderSellerPortfolio(entries) {
    document.getElementById("portfolioSellerSummary").innerHTML = state.sellers.filter(function (seller) { return seller.active; }).map(function (seller) {
      var sellerRows = entries.filter(function (entry) { return entry.lead.assigned_seller_user_id === seller.user_id; });
      var sellerMetrics = followUpModel.metrics(sellerRows);
      return '<button class="portfolio-seller-card' + (sellerMetrics.overdue || sellerMetrics.unmanaged ? ' attention' : '') + '" type="button" data-portfolio-seller="' + seller.user_id + '"><span class="portfolio-seller-avatar">' + escapeHtml(initials(seller.full_name)) + '</span><strong>' + escapeHtml(seller.full_name) + '</strong><small>' + sellerMetrics.active + ' activos</small><small>' + sellerMetrics.unmanaged + ' sin gestión</small><small>' + sellerMetrics.overdue + ' vencidas</small><small>' + sellerMetrics.today + ' para hoy</small><small>' + sellerMetrics.upcoming + ' próximas</small></button>';
    }).join("") || '<div class="sales-empty">Todavía no hay vendedores activos.</div>';
  }

  function renderPortfolio() {
    var sellerFilter = document.getElementById("portfolioSeller");
    var selectedSeller = sellerFilter.value;
    sellerFilter.innerHTML = '<option value="">Todos</option>' + state.sellers.filter(function (seller) { return seller.active; }).map(function (seller) {
      return '<option value="' + seller.user_id + '">' + escapeHtml(seller.full_name) + '</option>';
    }).join("");
    if (selectedSeller && state.sellers.some(function (seller) { return seller.user_id === selectedSeller; })) sellerFilter.value = selectedSeller;

    var now = new Date();
    var entries = state.leads.filter(function (lead) { return Boolean(lead.assigned_seller_user_id); }).map(function (lead) { return portfolioEntry(lead, now); });
    var kpis = followUpModel.metrics(entries);
    document.getElementById("portfolioStats").innerHTML = [
      ["Activos", kpis.active, ""],
      ["Sin gestión registrada", kpis.unmanaged, kpis.unmanaged ? "attention" : ""],
      ["Sin primer contacto", kpis.withoutFirstContact, kpis.withoutFirstContact ? "attention" : ""],
      ["Vencidas", kpis.overdue, kpis.overdue ? "attention" : ""],
      ["Hoy", kpis.today, ""],
      ["Próximas", kpis.upcoming, ""],
      ["Sin próxima acción", kpis.unscheduled, kpis.unscheduled ? "attention" : ""],
      ["Completadas hoy", kpis.completedToday, ""],
      ["Entrevistas", kpis.interviews, ""],
      ["Cierre / Seña", kpis.closing, ""]
    ].map(function (item) { return '<article class="portfolio-stat ' + item[2] + '"><span>' + item[0] + '</span><strong>' + item[1] + '</strong></article>'; }).join("");
    renderSellerPortfolio(entries);

    var filters = {
      seller: sellerFilter.value,
      status: document.getElementById("portfolioStatus").value,
      priority: document.getElementById("portfolioPriority").value,
      situation: document.getElementById("portfolioSituation").value,
      search: document.getElementById("portfolioSearch").value.trim(),
      historical: document.getElementById("portfolioHistorical").checked
    };
    var order = { unmanaged: 0, overdue: 1, today: 2, upcoming: 3, unscheduled: 4, completed: 5 };
    var rows = entries.filter(function (entry) { return followUpModel.matchesFilters(entry.lead, entry.derived, filters); }).sort(function (left, right) {
      var statusOrder = order[left.derived.key] - order[right.derived.key];
      if (statusOrder) return statusOrder;
      var leftNext = left.derived.nextAction ? new Date(left.derived.nextAction.at).getTime() : Number.MAX_SAFE_INTEGER;
      var rightNext = right.derived.nextAction ? new Date(right.derived.nextAction.at).getTime() : Number.MAX_SAFE_INTEGER;
      return leftNext - rightNext || new Date(right.lead.assigned_at) - new Date(left.lead.assigned_at);
    });

    document.getElementById("portfolioCount").textContent = rows.length + " visibles · " + kpis.active + " activos";
    var selectedIds = new Set(state.portfolioSelection);
    document.getElementById("portfolioRows").innerHTML = rows.map(function (entry) {
      var lead = entry.lead;
      var crm = crmOf(lead);
      var derived = entry.derived;
      var seller = sellerById(lead.assigned_seller_user_id);
      var appraisal = appraisalForLead(lead.id);
      var action = derived.nextAction;
      var assignmentAge = derived.withoutManagement ? '<small class="assignment-age ' + followUpModel.assignmentAttention(lead.assigned_at, now) + '">' + escapeHtml(followUpModel.elapsedLabel(lead.assigned_at, now)) + '</small>' : '';
      var completed = derived.completedToday ? '<span class="followup-secondary">COMPLETADA HOY</span>' : '';
      var overdue = derived.key === "overdue" && action ? '<small class="overdue-age">' + escapeHtml(relativeActionLabel(action.at, now)) + '</small>' : '';
      return '<tr class="followup-' + derived.key + (selectedIds.has(lead.id) ? ' is-selected' : '') + '" data-portfolio-lead="' + lead.id + '">' +
        '<td><input type="checkbox" data-portfolio-select aria-label="Seleccionar ' + escapeHtml(lead.customer_name || "Lead sin nombre") + '"' + (selectedIds.has(lead.id) ? ' checked' : '') + '></td>' +
        '<td><strong>' + escapeHtml(lead.customer_name || "Lead sin nombre") + '</strong><small>+' + escapeHtml(lead.customer_phone) + ' · ' + escapeHtml(lead.model_interest || "Modelo a definir") + '</small>' + assignmentAge + '</td>' +
        '<td><strong>' + escapeHtml(seller && seller.full_name || "Sin vendedor") + '</strong><small>' + escapeHtml(seller && seller.seller_code || "") + '</small></td>' +
        '<td><span class="portfolio-status ' + escapeHtml(crm.status || "nuevo") + '">' + escapeHtml(crmStatusLabel(crm.status)) + '</span></td>' +
        '<td><span class="portfolio-priority ' + escapeHtml(crm.priority || lead.priority || "normal") + '">' + escapeHtml(priorityLabel(crm.priority || lead.priority)) + '</span></td>' +
        '<td><span class="followup-status ' + derived.key + '">' + escapeHtml(derived.label) + '</span>' + completed + '</td>' +
        '<td><strong>' + escapeHtml(action ? action.label : "Sin próxima acción") + '</strong>' + (action ? '<small class="action-source ' + action.source + '">' + action.sourceLabel + '</small>' : '') + '</td>' +
        '<td><strong>' + escapeHtml(action ? formatDate(action.at) : "Sin programar") + '</strong>' + overdue + '</td>' +
        '<td><strong>' + escapeHtml(crm.last_contact_at ? formatDate(crm.last_contact_at) : "Sin contacto registrado") + '</strong><small>' + escapeHtml(crm.last_contact_at ? contactOutcomeLabel(crm.last_contact_outcome) : "") + '</small></td>' +
        '<td>' + (appraisal ? '<strong>' + escapeHtml(appraisalMarketStatus(appraisal)) + '</strong><small>' + escapeHtml([appraisal.brand, appraisal.model, appraisal.vehicle_year].filter(Boolean).join(" · ")) + '</small>' + (appraisal.status === "pending" && appraisal.suggested_value != null ? '<button class="button secondary appraisal-review-button" type="button" data-review-appraisal>Confirmar</button>' : '') : '<small>Sin usado cargado</small>') + '</td>' +
        '<td><button class="button secondary" type="button" data-portfolio-details>Ver detalle</button></td></tr>';
    }).join("");
    renderPortfolioSelection(rows);
    document.getElementById("portfolioEmpty").hidden = Boolean(rows.length);
    document.querySelector(".portfolio-table-wrap").hidden = !rows.length;
  }

  function renderStats() {
    var today = localDateKey(new Date());
    document.getElementById("pendingStat").textContent = state.leads.filter(function (lead) { return lead.routing_status === "pending_supervisor"; }).length;
    document.getElementById("directStat").textContent = state.leads.filter(function (lead) { return lead.routing_status === "assigned_direct" && lead.assigned_at && localDateKey(lead.assigned_at) === today; }).length;
    document.getElementById("assignedStat").textContent = state.leads.filter(function (lead) { return lead.assigned_seller_user_id && lead.assigned_at && localDateKey(lead.assigned_at) === today; }).length;
    document.getElementById("unqualifiedStat").textContent = state.leads.filter(function (lead) { return lead.qualification_status === "unqualified"; }).length;
    document.getElementById("pendingSalesStat").textContent = state.sales.length;
    document.getElementById("overdueTasksStat").textContent = state.leads.filter(function (lead) { return lead.assigned_seller_user_id; }).map(function (lead) {
      return portfolioEntry(lead, new Date()).derived;
    }).filter(function (derived) { return derived.key === "overdue"; }).length;
  }

  function monthContains(value, month) {
    return Boolean(value && String(value).slice(0, 7) === month);
  }

  function renderGoals() {
    var month = document.getElementById("goalMonth").value;
    if (!month) return;
    var sellerSelect = document.getElementById("goalSeller");
    var currentSeller = sellerSelect.value;
    sellerSelect.innerHTML = state.sellers.map(function (seller) { return '<option value="' + seller.user_id + '">' + escapeHtml(seller.full_name + " · " + seller.seller_code) + '</option>'; }).join("");
    if (!state.sellers.length) {
      document.getElementById("goalFinalized").value = 0;
      document.getElementById("goalProgress").innerHTML = '<div class="sales-empty">Todavía no hay vendedores activos.</div>';
      return;
    }
    if (currentSeller && state.sellers.some(function (seller) { return seller.user_id === currentSeller; })) sellerSelect.value = currentSeller;
    var goal = state.goals.find(function (item) { return item.seller_user_id === sellerSelect.value && String(item.period_month).slice(0, 7) === month; }) || {};
    document.getElementById("goalFinalized").value = goal.target_finalized || 0;
    document.getElementById("goalProgress").innerHTML = state.sellers.map(function (seller) {
      var sellerGoal = state.goals.find(function (item) { return item.seller_user_id === seller.user_id && String(item.period_month).slice(0, 7) === month; }) || {};
      var target = Number(sellerGoal.target_finalized || 0);
      var finalized = state.adminSales.filter(function (sale) { return sale.seller_user_id === seller.user_id && monthContains(sale.finalized_at, month); }).length;
      var percent = target ? Math.min(100, Math.round(finalized * 100 / target)) : 0;
      return '<article class="goal-progress-card"><div><span>' + escapeHtml(seller.full_name) + '</span><strong>' + finalized + ' / ' + target + ' ventas</strong></div><div class="goal-bar"><i style="width:' + percent + '%"></i></div><small>' + percent + '% de cumplimiento · ventas finalizadas</small></article>';
    }).join("");
  }

  function switchSupervisorView(view) {
    state.view = view;
    document.querySelectorAll("[data-supervisor-panel]").forEach(function (panel) { panel.hidden = panel.dataset.supervisorPanel !== view; });
    document.querySelectorAll("[data-supervisor-view]").forEach(function (button) { button.classList.toggle("active", button.dataset.supervisorView === view); });
    var titles = { leads: ["Distribución comercial", "Bandeja de leads"], whatsapp: ["Atención conversacional", "Bandeja de WhatsApp"], portfolio: ["Supervisión del equipo", "Cartera y seguimiento"], bases: ["Administración de bases", "Nuevos y rellamados"], sales: ["Control comercial", "Ventas para confirmar"], administration: ["Circuito posterior a la venta", "Seguimiento administrativo"], goals: ["Rendimiento del equipo", "Objetivos comerciales"] };
    document.querySelector(".topbar .eyebrow").textContent = titles[view][0];
    document.querySelector(".topbar h1").textContent = titles[view][1];
    if (view === "goals") { renderGoals(); renderRanking(); }
    if (view === "administration") renderInstallmentMetrics();
    if (view === "portfolio") renderPortfolio();
    if (view === "whatsapp") renderWhatsAppInbox();
    if (view === "bases") document.dispatchEvent(new CustomEvent("grupoSur:bases-open"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderTemplates() {
    document.getElementById("contactTemplates").innerHTML = state.templates.map(function (template) {
      return '<article class="template-card" data-template-id="' + template.id + '"><div><span>WhatsApp ' + template.step_number + ' de 4</span><strong>' + escapeHtml(template.title) + '</strong></div><textarea rows="4" maxlength="1500">' + escapeHtml(template.body) + '</textarea><small>Variables disponibles: {nombre}, {vendedor}, {modelo}</small><button class="button secondary" data-save-template type="button">Guardar texto</button></article>';
    }).join("") || '<div class="sales-empty">No hay plantillas configuradas.</div>';
  }

  function assignedToday(sellerId) {
    var today = localDateKey(new Date());
    return state.leads.filter(function (lead) { return lead.assigned_seller_user_id === sellerId && lead.assigned_at && localDateKey(lead.assigned_at) === today; }).length;
  }

  function renderTeam() {
    document.getElementById("teamCount").textContent = state.sellers.length === 1 ? "1 vendedor" : state.sellers.length + " vendedores";
    document.getElementById("teamGrid").innerHTML = state.sellers.map(function (seller) {
      var settings = state.settings[seller.user_id] || { daily_quota: 20, paused: false };
      var current = assignedToday(seller.user_id);
      return '<article class="team-card" data-seller-id="' + seller.user_id + '">' +
        '<span class="team-avatar">' + escapeHtml(initials(seller.full_name)) + '</span>' +
        '<div class="team-copy"><strong>' + escapeHtml(seller.full_name) + '</strong><small>' + escapeHtml(seller.seller_code) + ' · ' + current + '/' + settings.daily_quota + ' hoy</small></div>' +
        '<div class="team-controls"><label class="quota">Cupo <input data-quota type="number" min="0" max="500" value="' + settings.daily_quota + '"></label><button class="pause' + (settings.paused ? " paused" : "") + '" data-pause type="button">' + (settings.paused ? "Reanudar" : "Pausar") + '</button></div>' +
      '</article>';
    }).join("");
  }

  function filteredLeads() {
    var query = state.search.toLocaleLowerCase("es-AR");
    return state.leads.filter(function (lead) {
      var matchesFilter = state.filter === "all" || lead.routing_status === state.filter;
      var tiktokIdentifiers = (lead.tiktok_attributions || []).map(function (item) { return item.raw_identifier; }).join(" ");
      var haystack = [lead.customer_name, lead.customer_phone, lead.intent_summary, lead.model_interest, lead.seller_code_received, tiktokIdentifiers].join(" ").toLocaleLowerCase("es-AR");
      return matchesFilter && (!query || haystack.includes(query));
    });
  }

  function sellerOptions(selectedId) {
    return '<option value="">Seleccionar vendedor</option>' + state.sellers.filter(function (seller) { return seller.active; }).map(function (seller) {
      var settings = state.settings[seller.user_id] || { daily_quota: 20, paused: false };
      return '<option value="' + seller.user_id + '"' + (seller.user_id === selectedId ? " selected" : "") + (settings.paused ? " disabled" : "") + '>' + escapeHtml(seller.full_name + " · " + assignedToday(seller.user_id) + "/" + settings.daily_quota + (settings.paused ? " · pausado" : "")) + '</option>';
    }).join("");
  }

  function routingLabel(lead) {
    if (lead.routing_status === "assigned_direct") return lead.routing_reason === "valid_advisor_name" ? "Asesor identificado" : "Código TikTok válido";
    if (lead.routing_status === "assigned_manual") return "Asignación manual";
    if (["invalid_seller_code", "invalid_tiktok_code"].includes(lead.routing_reason)) return "Código TikTok no válido";
    if (lead.routing_reason === "invalid_advisor_name") return "Asesor no encontrado";
    if (lead.routing_reason === "ambiguous_advisor_name") return "Nombre ambiguo";
    if (lead.routing_reason === "daily_quota_reached") return "Cupo alcanzado";
    if (lead.routing_reason === "seller_paused") return "Vendedor pausado";
    return "Bandeja general";
  }

  function renderLeads() {
    var labels = {
      pending_supervisor: ["Leads pendientes", "La IA ya resumió la intención; elegí a quién asignar cada oportunidad."],
      assigned_direct: ["Derivaciones directas", "Ingresaron con un código válido y fueron notificadas al supervisor."],
      assigned_manual: ["Asignaciones manuales", "Oportunidades distribuidas desde esta bandeja."],
      all: ["Todos los leads", "Vista completa del flujo comercial recibido por WhatsApp."]
    };
    document.getElementById("listTitle").textContent = labels[state.filter][0];
    document.getElementById("listSubtitle").textContent = labels[state.filter][1];
    var leads = filteredLeads();
    document.getElementById("leadList").innerHTML = leads.map(function (lead) {
      var assigned = sellerById(lead.assigned_seller_user_id);
      var crm = Array.isArray(lead.crm) ? lead.crm[0] : lead.crm;
      var attribution = Array.isArray(lead.attribution) ? lead.attribution[0] : lead.attribution;
      var tiktokAttributions = (lead.tiktok_attributions || []).slice().sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      var tiktokAttribution = tiktokAttributions[0];
      var tiktokIdentifier = tiktokAttribution ? (tiktokAttribution.identifier_type === "advisor_name" ? "asesor " : "código ") + tiktokAttribution.raw_identifier : "código " + (lead.seller_code_received || "—");
      var sourceLabel = lead.source_channel === "tiktok" ? "TikTok / " + tiktokIdentifier : lead.source_detail === "meta_ads" ? "Meta Ads · " + (attribution && (attribution.ad_name || attribution.headline || attribution.campaign_name) || "Anuncio sin nombre") : lead.source_channel === "manual" ? "Carga manual · " + (lead.source_detail || "Sin detalle") : "WhatsApp orgánico";
      return '<article class="lead-card" data-lead-id="' + lead.id + '">' +
        '<div class="lead-person"><strong>' + escapeHtml(lead.customer_name || "Cliente sin nombre") + '</strong><span>+' + escapeHtml(lead.customer_phone) + ' · ' + escapeHtml(formatDate(lead.last_message_at)) + '</span><span>' + escapeHtml(sourceLabel) + '</span></div>' +
        '<div class="lead-summary"><p>' + escapeHtml(lead.intent_summary || "Pendiente de resumen") + '</p><div class="badges"><span class="badge ' + escapeHtml(lead.qualification_status) + '">' + escapeHtml(lead.qualification_status === "qualified" ? "Calificado" : lead.qualification_status === "unqualified" ? "No calificado" : "Seguimiento") + '</span><span class="badge ' + escapeHtml((crm && crm.priority) || lead.priority) + '">' + escapeHtml((crm && crm.priority) === "high" || lead.priority === "high" ? "Prioridad alta" : "Prioridad normal") + '</span><span class="badge">' + escapeHtml(crm && crm.status ? crm.status.replace(/_/g, " ") : "nuevo") + '</span><span class="badge">' + escapeHtml(routingLabel(lead)) + '</span></div></div>' +
        '<div class="assignment"><select data-seller-select aria-label="Asignar vendedor">' + sellerOptions(lead.assigned_seller_user_id) + '</select><button class="button primary" data-assign type="button">' + (assigned ? "Reasignar" : "Asignar") + '</button></div>' +
        '<button class="details" data-details type="button">Ver chat</button>' +
      '</article>';
    }).join("");
    document.getElementById("emptyState").hidden = leads.length > 0;
  }

  function renderSales() {
    document.getElementById("salesCount").textContent = state.sales.length === 1 ? "1 pendiente" : state.sales.length + " pendientes";
    document.getElementById("salesList").innerHTML = state.sales.length ? state.sales.map(function (sale) {
      var seller = Array.isArray(sale.seller) ? sale.seller[0] : sale.seller;
      var lead = Array.isArray(sale.lead) ? sale.lead[0] : sale.lead;
      var provisional = Array.isArray(sale.provisional) ? sale.provisional[0] : sale.provisional;
      return '<article class="sale-row" data-sale-id="' + sale.id + '"><div><strong>' + escapeHtml(lead && lead.customer_name || "Cliente sin nombre") + '</strong><small>+' + escapeHtml(lead && lead.customer_phone || "") + ' · ' + escapeHtml(formatDate(sale.requested_at)) + '</small>' + (provisional ? '<span class="sale-source-chip">Datero del Apto</span>' : '') + '</div><div><strong>' + escapeHtml(sale.vehicle) + '</strong><span>' + escapeHtml(sale.notes || lead && lead.intent_summary || "Sin observaciones") + '</span></div><div><span class="sale-amount">' + escapeHtml(money(sale.sale_amount)) + '</span><small>' + escapeHtml(seller && seller.full_name || "Vendedor") + ' · ' + escapeHtml(seller && seller.seller_code || "") + '</small></div><button class="button primary" data-review-sale type="button">Revisar</button></article>';
    }).join("") : '<div class="sales-empty">No hay ventas pendientes de confirmación.</div>';
  }

  function stageLabel(value) {
    return { pending: "Pendiente", approved: "Aprobado", observed: "Observado", rejected: "Rechazado", baja: "Baja", cancelled: "Baja" }[value] || value || "Pendiente";
  }

  function stageChip(label, value) {
    return '<span class="admin-stage ' + escapeHtml(value || "pending") + '"><small>' + escapeHtml(label) + '</small><b>' + escapeHtml(stageLabel(value)) + '</b></span>';
  }

  function renderAdministrativeSales() {
    document.getElementById("adminSalesCount").textContent = state.adminSales.length === 1 ? "1 operación" : state.adminSales.length + " operaciones";
    document.getElementById("adminSalesList").innerHTML = state.adminSales.length ? state.adminSales.map(function (sale) {
      var seller = Array.isArray(sale.seller) ? sale.seller[0] : sale.seller;
      var lead = Array.isArray(sale.lead) ? sale.lead[0] : sale.lead;
      var events = (sale.events || []).filter(function (item) { return item.comment; }).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      var comment = sale.cancellation_reason || (events[0] && events[0].comment) || "Sin observaciones administrativas.";
      return '<article class="admin-sale-card"><div><span class="case-code">' + escapeHtml(sale.case_code) + '</span><strong>' + escapeHtml(lead && lead.customer_name || "Cliente") + '</strong><small>' + escapeHtml(seller && seller.full_name || "Vendedor") + ' · ' + escapeHtml(sale.vehicle) + '</small></div><div class="admin-stages">' + stageChip("Scoring CDN", sale.cdn_scoring_status) + stageChip("Scoring concesionario", sale.dealer_scoring_status) + stageChip("Contrato", sale.contract_status) + '</div><div class="admin-comment"><b>' + escapeHtml(sale.status === "cancelled" ? "Motivo de baja" : "Última novedad") + '</b><span>' + escapeHtml(comment) + '</span><small>Actualizado ' + escapeHtml(formatDate(sale.updated_at)) + '</small></div></article>';
    }).join("") : '<div class="sales-empty">Todavía no hay ventas en circuito administrativo.</div>';
  }

  async function renderInstallmentMetrics() {
    var month = document.getElementById("installmentMonth").value;
    var result = await supabaseClient.rpc("get_installment_metrics", { p_month: month ? month + "-01" : null });
    var row = result.data && result.data[0];
    var target = document.getElementById("installmentMetrics");
    if (result.error || !row || !Number(row.total_installments)) {
      target.innerHTML = '<div class="sales-empty">No hay cuotas agrupadas para este mes.</div>';
      return;
    }
    target.innerHTML = [["Pagadas", row.paid_count, row.paid_percentage, "paid"], ["Promesas de pago", row.promised_count, row.promised_percentage, "promised"], ["Morosas", row.delinquent_count, row.delinquent_percentage, "delinquent"]].map(function (item) {
      return '<article class="metric-card ' + item[3] + '"><span>' + escapeHtml(item[0]) + '</span><strong>' + escapeHtml(item[2]) + '%</strong><small>' + escapeHtml(item[1]) + ' de ' + escapeHtml(row.total_installments) + ' cuotas</small></article>';
    }).join("");
  }

  async function renderRanking() {
    var month = document.getElementById("rankingMonth").value;
    var result = await supabaseClient.rpc("get_sales_performance", { p_month: month ? month + "-01" : null });
    document.getElementById("supervisorRanking").innerHTML = result.error || !result.data.length ? '<div class="sales-empty">Todavía no hay datos para este mes.</div>' : result.data.map(function (item, index) {
      return '<article class="rank-card"><span class="rank-place">' + (index + 1) + '</span><div><strong>' + escapeHtml(item.seller_name) + '</strong><small>' + escapeHtml(item.seller_code) + ' · ' + item.assigned_leads + ' leads</small></div><div class="rank-result"><b>' + item.confirmed_sales + '</b><small>' + escapeHtml(item.finalized_sales) + ' finalizadas · ' + escapeHtml(item.conversion_rate) + '%</small></div></article>';
    }).join("");
  }

  function renderAll() {
    renderStats();
    renderTeam();
    renderLeads();
    renderSales();
    renderAdministrativeSales();
    renderInstallmentMetrics();
    renderRanking();
    renderGoals();
    renderTemplates();
    renderPortfolio();
    renderWhatsAppInbox();
    document.getElementById("manualSellerSelect").innerHTML = '<option value="">Bandeja general</option>' + state.sellers.filter(function (seller) { return seller.active; }).map(function (seller) { return '<option value="' + seller.user_id + '">' + escapeHtml(seller.full_name + " · " + seller.seller_code) + '</option>'; }).join("");
  }

  async function enterApp() {
    var profile = await getManagementProfile();
    if (!profile) {
      await supabaseClient.auth.signOut({ scope: "local" });
      throw new Error("Esta cuenta no tiene permisos de supervisor o administrador.");
    }
    state.profile = profile;
    document.getElementById("profileName").textContent = profile.full_name;
    document.getElementById("avatar").textContent = initials(profile.full_name);
    document.getElementById("authLoading").hidden = true;
    loginView.hidden = true;
    appView.hidden = false;
    await loadData(false);
  }

  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    loginMessage.textContent = "";
    var button = loginForm.querySelector('button[type="submit"]');
    setBusy(button, true, "Ingresando…");
    try {
      var result = await supabaseClient.auth.signInWithPassword({ email: loginForm.elements.email.value.trim().toLowerCase(), password: loginForm.elements.password.value });
      if (result.error) throw result.error;
      await enterApp();
    } catch (error) {
      loginMessage.textContent = error.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : error.message;
    } finally {
      setBusy(button, false);
    }
  });

  document.getElementById("logoutButton").addEventListener("click", async function () {
    await supabaseClient.auth.signOut({ scope: "local" });
    state.profile = null;
    appView.hidden = true;
    document.getElementById("authLoading").hidden = true;
    loginView.hidden = false;
  });

  document.querySelector(".sidebar nav").addEventListener("click", function (event) {
    var button = event.target.closest("[data-supervisor-view]");
    if (button) switchSupervisorView(button.dataset.supervisorView);
  });

  document.querySelector(".lead-view-filters").addEventListener("click", function (event) {
    var button = event.target.closest("[data-filter]");
    if (!button) return;
    state.filter = button.dataset.filter;
    this.querySelectorAll("[data-filter]").forEach(function (item) { item.classList.toggle("active", item === button); });
    renderLeads();
  });

  document.getElementById("searchInput").addEventListener("input", function () { state.search = this.value.trim(); renderLeads(); });
  document.getElementById("refreshButton").addEventListener("click", async function () {
    setBusy(this, true, "Actualizando…");
    try { await loadData(false); } catch (error) { pageMessage.textContent = error.message; pageMessage.classList.add("error"); }
    finally { setBusy(this, false); }
  });

  document.getElementById("teamGrid").addEventListener("change", async function (event) {
    if (!event.target.matches("[data-quota]")) return;
    var card = event.target.closest("[data-seller-id]");
    var quota = Number(event.target.value);
    if (!Number.isInteger(quota) || quota < 0 || quota > 500) return;
    var current = state.settings[card.dataset.sellerId] || { paused: false };
    var result = await supabaseClient.from("seller_routing_settings").upsert({ seller_user_id: card.dataset.sellerId, daily_quota: quota, paused: current.paused, updated_by: state.profile.user_id });
    if (result.error) pageMessage.textContent = "No se pudo actualizar el cupo."; else await loadData(true);
  });

  document.getElementById("teamGrid").addEventListener("click", async function (event) {
    var button = event.target.closest("[data-pause]");
    if (!button) return;
    var card = button.closest("[data-seller-id]");
    var current = state.settings[card.dataset.sellerId] || { daily_quota: 20, paused: false };
    setBusy(button, true, "Guardando…");
    var result = await supabaseClient.from("seller_routing_settings").upsert({ seller_user_id: card.dataset.sellerId, daily_quota: current.daily_quota, paused: !current.paused, updated_by: state.profile.user_id });
    if (result.error) { pageMessage.textContent = "No se pudo cambiar el estado de derivación."; setBusy(button, false); } else await loadData(true);
  });

  function renderConversationControl(lead) {
    var control = conversationControlForLead(lead.id);
    var isHuman = control.mode === "human";
    var badge = document.getElementById("dialogConversationMode");
    badge.className = "conversation-mode " + control.mode;
    badge.textContent = isHuman ? "Atención humana" : "IA activa";
    document.getElementById("dialogConversationOwner").textContent = isHuman
      ? "Tomada por " + conversationOwnerName(control) + (control.taken_at ? " el " + formatDate(control.taken_at) : "") + "."
      : "La IA puede clasificar y responder automáticamente.";
    document.getElementById("conversationTakeover").textContent = isHuman ? "Devolver a la IA" : "Tomar conversación";
    document.getElementById("conversationTakeover").classList.toggle("secondary", isHuman);
    document.getElementById("conversationTakeover").classList.toggle("primary", !isHuman);
    document.getElementById("conversationComposer").hidden = !isHuman;
  }

  async function loadConversationMessages(lead) {
    document.getElementById("dialogConversationStatus").textContent = "Consultando mensajes…";
    var messages = await supabaseClient.from("lead_messages").select("id, direction, body, created_at, origin").eq("lead_id", lead.id).order("created_at");
    document.getElementById("conversation").innerHTML = messages.error || !messages.data.length
      ? '<div class="message-bubble">Todavía no hay mensajes disponibles.</div>'
      : messages.data.map(function (message) {
        var review = message.direction === "outbound" && message.origin === "ai"
          ? '<div class="ai-review-actions"><span>¿Esta respuesta ayudó?</span><button type="button" data-review-ai="correct" data-message-id="' + escapeHtml(message.id) + '">Correcta</button><button type="button" data-review-ai="corrected" data-message-id="' + escapeHtml(message.id) + '">Corregir</button></div>'
          : '';
        return '<div class="message-bubble ' + escapeHtml(message.direction) + '" data-message-bubble-id="' + escapeHtml(message.id) + '">' + escapeHtml(message.body || "Mensaje sin texto") + '<small>' + escapeHtml(formatDate(message.created_at)) + '</small>' + review + '</div>';
      }).join("");
    document.getElementById("dialogConversationStatus").textContent = messages.error ? "No se pudo actualizar la conversación." : (messages.data.length === 1 ? "1 mensaje" : messages.data.length + " mensajes") + " · actualizado ahora";
    var conversation = document.getElementById("conversation");
    conversation.scrollTop = conversation.scrollHeight;
  }

  function sourceLabel(lead) {
    if (lead.source_channel === "manual") return lead.source_detail || "Carga manual";
    if (lead.source_channel === "tiktok") return "TikTok";
    if (lead.source_detail === "meta_ads") return "Meta Ads";
    return lead.source_detail || "WhatsApp";
  }

  function actorLabel(activity) {
    var actor = Array.isArray(activity.actor) ? activity.actor[0] : activity.actor;
    if (!actor) return "Sistema";
    var role = actor.role === "seller" ? "Vendedor" : ["supervisor", "admin"].includes(actor.role) ? "Supervisor" : "Equipo";
    return role + " · " + (actor.full_name || "Usuario");
  }

  function activityOrigin(activity) {
    var metadata = activity.metadata || {};
    if (metadata.task_id) return "PROTOCOLO";
    if (metadata.origin === "supervisor_portfolio") return "MANUAL";
    if (metadata.origin === "ai") return "IA";
    if (metadata.recall_item_id || metadata.origin === "recall") return "RELLAMADO";
    return "HISTORIAL";
  }

  function renderLeadSupervisionOverview(lead) {
    var crm = crmOf(lead);
    var summary = state.portfolio[lead.id] || {};
    var derived = followUpModel.deriveFollowUpStatus(lead, summary, new Date());
    var seller = sellerById(lead.assigned_seller_user_id);
    var action = derived.nextAction;
    document.querySelector(".lead-supervision-actions").hidden = !derived.active;
    document.getElementById("leadSupervisionGrid").innerHTML = [
      ["Teléfono", '<a href="tel:+' + escapeHtml(String(lead.customer_phone || "").replace(/\D/g, "")) + '">+' + escapeHtml(lead.customer_phone || "—") + '</a>'],
      ["Modelo / interés", escapeHtml(lead.model_interest || "Sin modelo informado")],
      ["Origen", escapeHtml(sourceLabel(lead))],
      ["Vendedor", escapeHtml(seller ? seller.full_name + (seller.seller_code ? " · " + seller.seller_code : "") : "Sin vendedor")],
      ["Estado", escapeHtml(crmStatusLabel(crm.status))],
      ["Prioridad", escapeHtml(priorityLabel(crm.priority || lead.priority))],
      ["Asignación", escapeHtml(lead.assigned_at ? formatDate(lead.assigned_at) : "Sin fecha")],
      ["Primera gestión", escapeHtml(summary.first_management_at ? formatDate(summary.first_management_at) : "Sin gestión registrada")],
      ["Último contacto", escapeHtml(crm.last_contact_at ? formatDate(crm.last_contact_at) + " · " + contactOutcomeLabel(crm.last_contact_outcome) : "Sin contacto registrado")]
    ].map(function (item) { return '<div><small>' + item[0] + '</small><strong>' + item[1] + '</strong></div>'; }).join("");
    document.getElementById("leadSupervisionNext").innerHTML = '<div><span class="followup-status ' + derived.key + '">' + escapeHtml(derived.label) + '</span>' + (derived.completedToday ? '<span class="followup-secondary">COMPLETADA HOY</span>' : '') + '</div><strong>' + escapeHtml(action ? action.label : "Sin próxima acción programada") + '</strong><small>' + escapeHtml(action ? formatDate(action.at) : "") + '</small>' + (action ? '<span class="action-source ' + action.source + '">' + action.sourceLabel + '</span>' : '');
    document.getElementById("supervisorPriority").value = crm.priority || lead.priority || "normal";
    document.getElementById("supervisorStatus").value = ["no_contesta", "en_proceso", "invalido", "entrevista", "cierre", "sena", "desistir"].includes(crm.status) ? crm.status : "en_proceso";
    document.getElementById("supervisorScheduleSave").disabled = !derived.active;
    document.getElementById("supervisorStatusSave").disabled = !derived.active;
    document.getElementById("supervisorManagementSave").disabled = !derived.active;
    var reassignSeller = document.getElementById("supervisorReassignSeller");
    var selectedReassignSeller = reassignSeller.value;
    reassignSeller.innerHTML = '<option value="">Elegí un vendedor activo</option>' + activeSellerOptions(lead.assigned_seller_user_id);
    if (selectedReassignSeller && state.sellers.some(function (item) { return item.active && item.user_id === selectedReassignSeller && item.user_id !== lead.assigned_seller_user_id; })) reassignSeller.value = selectedReassignSeller;
    document.getElementById("supervisorReassignSave").disabled = !derived.active || reassignSeller.options.length < 2;
    var nextParts = crm.next_contact_source === "manual" && crm.next_contact_at ? new Date(crm.next_contact_at) : null;
    if (nextParts) {
      document.getElementById("supervisorNextDate").value = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" }).format(nextParts);
      document.getElementById("supervisorNextTime").value = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }).format(nextParts);
      document.getElementById("supervisorNextNote").value = crm.next_contact_note || "";
    } else {
      document.getElementById("supervisorNextDate").value = "";
      document.getElementById("supervisorNextTime").value = "";
      document.getElementById("supervisorNextNote").value = "";
    }
  }

  async function loadLeadSupervisionHistory(lead) {
    var target = document.getElementById("leadSupervisionHistory");
    target.innerHTML = '<div class="sales-empty">Cargando historial…</div>';
    var result = await supabaseClient.from("lead_activities").select("id, activity_type, title, detail, metadata, created_at, actor:profiles!lead_activities_actor_user_id_fkey(full_name,role)").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(150);
    if (result.error) { target.innerHTML = '<div class="sales-empty">No se pudo cargar el historial.</div>'; return; }
    target.innerHTML = (result.data || []).map(function (activity) {
      return '<article class="lead-history-item"><div><span class="action-source history">' + escapeHtml(activityOrigin(activity)) + '</span><strong>' + escapeHtml(activity.title) + '</strong><small>' + escapeHtml(formatDate(activity.created_at)) + '</small></div><p>' + escapeHtml(activity.detail || "Sin observaciones") + '</p><b>' + escapeHtml(actorLabel(activity)) + '</b></article>';
    }).join("") || '<div class="sales-empty">Todavía no hay actividades registradas.</div>';
  }

  async function openLeadConversation(lead) {
    state.activeConversationLead = lead;
    document.getElementById("dialogLeadName").textContent = lead.customer_name || "+" + lead.customer_phone;
    document.getElementById("dialogLeadSummary").textContent = lead.intent_summary || "Sin resumen disponible.";
    document.getElementById("conversation").innerHTML = '<div class="message-bubble">Cargando conversación…</div>';
    document.getElementById("conversationHumanMessage").value = "";
    document.getElementById("conversationHumanError").textContent = "";
    document.getElementById("conversationReviewMessage").textContent = "";
    document.getElementById("leadSupervisionMessage").textContent = "";
    document.getElementById("supervisorComment").value = "";
    document.getElementById("supervisorReassignReason").value = "";
    document.getElementById("supervisorStatusNote").value = "";
    document.getElementById("supervisorManagementNote").value = "";
    renderLeadSupervisionOverview(lead);
    renderConversationControl(lead);
    if (!document.getElementById("leadDialog").open) document.getElementById("leadDialog").showModal();
    await Promise.all([loadConversationMessages(lead), loadLeadSupervisionHistory(lead)]);
  }

  async function refreshActiveLeadDetail() {
    if (!state.activeConversationLead) return;
    var leadId = state.activeConversationLead.id;
    await loadData(true);
    var lead = state.leads.find(function (item) { return item.id === leadId; });
    if (!lead) return;
    state.activeConversationLead = lead;
    renderLeadSupervisionOverview(lead);
    await loadLeadSupervisionHistory(lead);
  }

  async function runSupervisorManagement(action, payload, button, successMessage) {
    if (!state.activeConversationLead) return;
    var message = document.getElementById("leadSupervisionMessage");
    message.textContent = "";
    message.classList.add("error");
    setBusy(button, true, "Guardando…");
    var params = Object.assign({ p_lead_id: state.activeConversationLead.id, p_action: action }, payload || {});
    var result = await supabaseClient.rpc("supervisor_manage_lead", params);
    if (result.error) {
      message.textContent = result.error.message;
      setBusy(button, false);
      return;
    }
    await refreshActiveLeadDetail();
    message.classList.remove("error");
    message.textContent = successMessage;
    setBusy(button, false);
  }

  document.getElementById("supervisorNextDate").addEventListener("input", function () { maskDateInput(this); });
  document.getElementById("supervisorReassignSave").addEventListener("click", async function () {
    if (!state.activeConversationLead) return;
    var sellerId = document.getElementById("supervisorReassignSeller").value;
    var reason = document.getElementById("supervisorReassignReason").value.trim() || "Reasignación individual desde Cartera y seguimiento";
    var message = document.getElementById("leadSupervisionMessage");
    message.textContent = "";
    message.classList.add("error");
    if (!sellerId) { message.textContent = "Elegí un vendedor activo para reasignar el Lead."; return; }
    setBusy(this, true, "Reasignando…");
    var result = await supabaseClient.rpc("reassign_leads_to_seller", {
      p_lead_ids: [state.activeConversationLead.id],
      p_seller_user_id: sellerId,
      p_reason: reason
    });
    if (result.error) { message.textContent = result.error.message; setBusy(this, false); return; }
    document.getElementById("supervisorReassignReason").value = "";
    await refreshActiveLeadDetail();
    message.classList.remove("error");
    message.textContent = "Lead reasignado y protocolo de contacto reiniciado para el nuevo vendedor.";
    setBusy(this, false);
  });
  document.getElementById("supervisorCommentSave").addEventListener("click", async function () {
    if (!state.activeConversationLead) return;
    var comment = document.getElementById("supervisorComment").value.trim();
    var message = document.getElementById("leadSupervisionMessage");
    message.textContent = "";
    message.classList.add("error");
    if (comment.length < 2) { message.textContent = "Escribí un comentario antes de guardar."; return; }
    setBusy(this, true, "Guardando…");
    var result = await supabaseClient.rpc("add_lead_comment", { p_lead_id: state.activeConversationLead.id, p_comment: comment });
    if (result.error) { message.textContent = result.error.message; setBusy(this, false); return; }
    document.getElementById("supervisorComment").value = "";
    await refreshActiveLeadDetail();
    message.classList.remove("error");
    message.textContent = "Comentario agregado al historial.";
    setBusy(this, false);
  });
  document.getElementById("supervisorScheduleSave").addEventListener("click", function () {
    var nextContact;
    var message = document.getElementById("leadSupervisionMessage");
    message.classList.add("error");
    try {
      nextContact = parseArgentineDateTime(document.getElementById("supervisorNextDate").value, document.getElementById("supervisorNextTime").value);
    } catch (error) {
      message.textContent = error.message.replace("primer contacto", "próxima acción");
      return;
    }
    runSupervisorManagement("schedule", {
      p_next_contact_at: nextContact,
      p_next_contact_note: document.getElementById("supervisorNextNote").value.trim()
    }, this, "Próxima acción guardada y atribuida a Supervisión.");
  });
  document.getElementById("supervisorStatusSave").addEventListener("click", function () {
    runSupervisorManagement("status", {
      p_status: document.getElementById("supervisorStatus").value,
      p_priority: document.getElementById("supervisorPriority").value,
      p_note: document.getElementById("supervisorStatusNote").value.trim()
    }, this, "Estado comercial actualizado.");
  });
  document.getElementById("supervisorManagementSave").addEventListener("click", function () {
    runSupervisorManagement("management", {
      p_contact_outcome: document.getElementById("supervisorManagementOutcome").value,
      p_note: document.getElementById("supervisorManagementNote").value.trim()
    }, this, "Gestión registrada con atribución de Supervisor.");
  });

  document.getElementById("conversationRefresh").addEventListener("click", async function () {
    if (!state.activeConversationLead) return;
    setBusy(this, true, "Actualizando…");
    await loadData(true);
    renderConversationControl(state.activeConversationLead);
    await loadConversationMessages(state.activeConversationLead);
    setBusy(this, false);
  });

  document.getElementById("conversationTakeover").addEventListener("click", async function () {
    if (!state.activeConversationLead) return;
    var control = conversationControlForLead(state.activeConversationLead.id);
    var nextMode = control.mode === "human" ? "ai" : "human";
    setBusy(this, true, nextMode === "human" ? "Tomando…" : "Devolviendo…");
    var result = await supabaseClient.rpc("set_whatsapp_conversation_mode", { p_lead_id: state.activeConversationLead.id, p_mode: nextMode });
    if (result.error) {
      document.getElementById("conversationHumanError").textContent = result.error.message;
      setBusy(this, false);
      return;
    }
    await loadData(true);
    renderConversationControl(state.activeConversationLead);
    setBusy(this, false);
  });

  document.getElementById("conversationHumanSend").addEventListener("click", async function () {
    if (!state.activeConversationLead) return;
    var input = document.getElementById("conversationHumanMessage");
    var errorBox = document.getElementById("conversationHumanError");
    var message = input.value.trim();
    errorBox.textContent = "";
    if (!message) { errorBox.textContent = "Escribí un mensaje antes de enviarlo."; return; }
    setBusy(this, true, "Enviando…");
    var result = await supabaseClient.functions.invoke("whatsapp-human-message", { body: { leadId: state.activeConversationLead.id, message: message } });
    if (result.error || !result.data || !result.data.sent) {
      errorBox.textContent = result.data && result.data.error || "No se pudo enviar el mensaje por WhatsApp.";
      setBusy(this, false);
      return;
    }
    input.value = "";
    await loadData(true);
    await loadConversationMessages(state.activeConversationLead);
    setBusy(this, false);
  });

  async function saveAiReview(messageId, rating, expectedReply, button) {
    var status = document.getElementById("conversationReviewMessage");
    status.textContent = "";
    setBusy(button, true, "Guardando…");
    var result = await supabaseClient.rpc("review_ai_message", {
      p_message_id: messageId,
      p_rating: rating,
      p_expected_reply: expectedReply || ""
    });
    if (result.error) {
      status.textContent = result.error.message;
      status.classList.add("error");
      setBusy(button, false);
      return;
    }
    status.textContent = rating === "correct" ? "Respuesta aprobada. La IA podrá usarla como ejemplo." : "Corrección guardada. La IA podrá usarla como ejemplo desde el próximo mensaje.";
    status.classList.remove("error");
    var bubble = document.querySelector('[data-message-bubble-id="' + messageId + '"]');
    if (bubble) {
      bubble.classList.add("is-reviewed");
      var actions = bubble.querySelector(".ai-review-actions");
      if (actions) actions.innerHTML = '<span>Revisada por Supervisión</span>';
    }
  }

  document.getElementById("conversation").addEventListener("click", function (event) {
    var button = event.target.closest("[data-review-ai]");
    if (!button) return;
    var bubble = button.closest("[data-message-bubble-id]");
    if (button.dataset.reviewAi === "correct") {
      saveAiReview(button.dataset.messageId, "correct", "", button);
      return;
    }
    var existing = bubble.querySelector(".ai-correction-editor");
    if (existing) { existing.remove(); return; }
    var editor = document.createElement("div");
    editor.className = "ai-correction-editor";
    editor.innerHTML = '<label>Respuesta que debería enviar la IA<textarea maxlength="4096" rows="4"></textarea></label><div><button class="ai-correction-save" type="button">Guardar corrección</button><button class="ai-correction-cancel" type="button">Cancelar</button></div>';
    bubble.appendChild(editor);
    editor.querySelector("textarea").focus();
    editor.querySelector(".ai-correction-cancel").addEventListener("click", function () { editor.remove(); });
    editor.querySelector(".ai-correction-save").addEventListener("click", function () {
      var reply = editor.querySelector("textarea").value.trim();
      if (reply.length < 2) {
        document.getElementById("conversationReviewMessage").textContent = "Escribí la respuesta correcta antes de guardarla.";
        document.getElementById("conversationReviewMessage").classList.add("error");
        return;
      }
      saveAiReview(button.dataset.messageId, "corrected", reply, this);
    });
  });

  document.getElementById("whatsappModeFilter").addEventListener("change", renderWhatsAppInbox);
  document.getElementById("whatsappSearch").addEventListener("input", renderWhatsAppInbox);
  document.getElementById("whatsappInboxList").addEventListener("click", async function (event) {
    var row = event.target.closest("[data-whatsapp-lead-id]");
    if (!row || !event.target.closest("[data-open-whatsapp]")) return;
    var lead = state.leads.find(function (item) { return item.id === row.dataset.whatsappLeadId; });
    if (lead) await openLeadConversation(lead);
  });

  document.getElementById("leadList").addEventListener("click", async function (event) {
    var card = event.target.closest("[data-lead-id]");
    if (!card) return;
    var lead = state.leads.find(function (item) { return item.id === card.dataset.leadId; });
    if (event.target.closest("[data-assign]")) {
      var button = event.target.closest("[data-assign]");
      var sellerId = card.querySelector("[data-seller-select]").value;
      if (!sellerId) { pageMessage.textContent = "Elegí un vendedor antes de asignar."; return; }
      setBusy(button, true, "Asignando…");
      var update = await supabaseClient.rpc("assign_lead_to_seller", { p_lead_id: lead.id, p_seller_user_id: sellerId });
      if (!update.error) {
        await loadData(true);
      } else {
        pageMessage.textContent = "No se pudo asignar el lead.";
        setBusy(button, false);
      }
      return;
    }
    if (event.target.closest("[data-details]")) {
      await openLeadConversation(lead);
    }
  });

  function syncPortfolioQuickFilters() {
    var selected = document.getElementById("portfolioSituation").value;
    document.querySelectorAll("#portfolioQuickFilters [data-situation]").forEach(function (button) { button.classList.toggle("active", button.dataset.situation === selected); });
  }

  document.querySelector(".portfolio-filters").addEventListener("input", function () { syncPortfolioQuickFilters(); renderPortfolio(); });
  document.querySelector(".portfolio-filters").addEventListener("change", function () { syncPortfolioQuickFilters(); renderPortfolio(); });
  document.getElementById("portfolioQuickFilters").addEventListener("click", function (event) {
    var button = event.target.closest("[data-situation]");
    if (!button) return;
    document.getElementById("portfolioSituation").value = button.dataset.situation;
    syncPortfolioQuickFilters();
    renderPortfolio();
  });
  document.getElementById("portfolioSellerSummary").addEventListener("click", function (event) {
    var card = event.target.closest("[data-portfolio-seller]");
    if (!card) return;
    document.getElementById("portfolioSeller").value = card.dataset.portfolioSeller;
    renderPortfolio();
  });
  document.getElementById("portfolioSelectVisible").addEventListener("change", function () {
    var selected = new Set(state.portfolioSelection);
    state.visiblePortfolioLeadIds.forEach(function (leadId) {
      if (this.checked) selected.add(leadId); else selected.delete(leadId);
    }, this);
    state.portfolioSelection = Array.from(selected);
    renderPortfolio();
  });
  document.getElementById("portfolioRows").addEventListener("change", function (event) {
    var checkbox = event.target.closest("[data-portfolio-select]");
    var row = event.target.closest("[data-portfolio-lead]");
    if (!checkbox || !row) return;
    var selected = new Set(state.portfolioSelection);
    if (checkbox.checked) selected.add(row.dataset.portfolioLead); else selected.delete(row.dataset.portfolioLead);
    state.portfolioSelection = Array.from(selected);
    renderPortfolio();
  });
  document.getElementById("portfolioClearSelection").addEventListener("click", function () {
    state.portfolioSelection = [];
    document.getElementById("portfolioBulkReason").value = "";
    renderPortfolio();
  });
  document.getElementById("portfolioBulkReassign").addEventListener("click", async function () {
    var sellerId = document.getElementById("portfolioBulkSeller").value;
    var reason = document.getElementById("portfolioBulkReason").value.trim();
    var message = document.getElementById("portfolioBulkMessage");
    message.textContent = "";
    if (!state.portfolioSelection.length) { message.textContent = "Seleccioná al menos un Lead."; return; }
    if (!sellerId) { message.textContent = "Elegí un vendedor activo."; return; }
    if (reason.length < 3) { message.textContent = "Indicá el motivo de la reasignación masiva."; return; }
    var leadIds = state.portfolioSelection.slice();
    setBusy(this, true, "Reasignando…");
    var result = await supabaseClient.rpc("reassign_leads_to_seller", {
      p_lead_ids: leadIds,
      p_seller_user_id: sellerId,
      p_reason: reason
    });
    if (result.error) { message.textContent = result.error.message; setBusy(this, false); return; }
    state.portfolioSelection = [];
    document.getElementById("portfolioBulkReason").value = "";
    await loadData(true);
    pageMessage.textContent = leadIds.length + (leadIds.length === 1 ? " Lead reasignado." : " Leads reasignados en una única operación atómica.");
    setBusy(this, false);
  });
  document.getElementById("meliConnectButton").addEventListener("click", async function () {
    setBusy(this, true, "Preparando…");
    var result = await supabaseClient.functions.invoke("mercadolibre-oauth-start", { body: {} });
    if (result.error || !result.data || !result.data.authorizationUrl) {
      pageMessage.textContent = result.data && result.data.error || "No se pudo iniciar la conexión con Mercado Libre.";
      setBusy(this, false);
      return;
    }
    window.location.assign(result.data.authorizationUrl);
  });
  document.getElementById("portfolioRows").addEventListener("click", function (event) {
    var row = event.target.closest("[data-portfolio-lead]");
    if (!row) return;
    var lead = state.leads.find(function (item) { return item.id === row.dataset.portfolioLead; });
    if (event.target.closest("[data-review-appraisal]")) {
      var appraisal = appraisalForLead(lead.id);
      if (!appraisal) return;
      state.activeAppraisal = appraisal;
      document.getElementById("appraisalReviewTitle").textContent = "Tasación de " + (lead.customer_name || "cliente");
      document.getElementById("appraisalReviewSummary").innerHTML = '<strong>' + escapeHtml([appraisal.brand, appraisal.model, appraisal.version, appraisal.vehicle_year].filter(Boolean).join(" · ")) + '</strong><span>' + escapeHtml(new Intl.NumberFormat("es-AR").format(appraisal.mileage_km) + " km") + '</span><span>' + escapeHtml(appraisalMarketDetail(appraisal)) + '</span><span>' + escapeHtml(appraisalMarketStatus(appraisal)) + '</span>';
      document.getElementById("appraisalConfirmedValue").value = appraisal.confirmed_value || appraisal.suggested_value || "";
      document.getElementById("appraisalReviewNote").value = appraisal.review_note || "";
      document.getElementById("appraisalReviewMessage").textContent = "";
      document.getElementById("appraisalReviewDialog").showModal();
      return;
    }
    if (event.target.closest("[data-portfolio-details]") && lead) openLeadConversation(lead);
  });

  document.getElementById("appraisalConfirmButton").addEventListener("click", async function () {
    if (!state.activeAppraisal) return;
    var value = Number(document.getElementById("appraisalConfirmedValue").value);
    var message = document.getElementById("appraisalReviewMessage");
    message.textContent = "";
    if (!Number.isFinite(value) || value <= 0) { message.textContent = "Ingresá un valor de tasación válido."; return; }
    setBusy(this, true, "Confirmando…");
    var result = await supabaseClient.rpc("review_lead_vehicle_appraisal", {
      p_appraisal_id: state.activeAppraisal.id,
      p_confirmed_value: value,
      p_review_note: document.getElementById("appraisalReviewNote").value.trim()
    });
    if (result.error) { message.textContent = result.error.message; setBusy(this, false); return; }
    document.getElementById("appraisalReviewDialog").close();
    state.activeAppraisal = null;
    await loadData(true);
    pageMessage.textContent = "Tasación confirmada y visible para el vendedor.";
    setBusy(this, false);
  });

  document.getElementById("manualLeadButton").addEventListener("click", function () {
    document.getElementById("manualLeadForm").reset();
    document.getElementById("manualLeadMessage").textContent = "";
    document.getElementById("manualLeadDialog").showModal();
  });

  document.getElementById("manualLeadSubmit").addEventListener("click", async function () {
    var form = document.getElementById("manualLeadForm");
    var message = document.getElementById("manualLeadMessage");
    var name = form.elements.customerName.value.trim();
    var phone = form.elements.customerPhone.value.trim();
    message.textContent = "";
    if (name.length < 2 || phone.length < 6) { message.textContent = "Completá el nombre y el teléfono del cliente."; return; }
    var nextContactAt = null;
    if (!form.elements.contactConsent.checked) { message.textContent = "Confirmá que el cliente autorizó el contacto comercial."; return; }
    setBusy(this, true, "Guardando…");
    var result = await supabaseClient.rpc("create_manual_lead", {
      p_customer_name: name,
      p_customer_phone: phone,
      p_source_detail: form.elements.sourceDetail.value.trim(),
      p_model_interest: form.elements.modelInterest.value.trim(),
      p_intent_summary: form.elements.summary.value.trim(),
      p_priority: form.elements.priority.value,
      p_seller_user_id: form.elements.sellerId.value || null,
      p_next_contact_at: nextContactAt
    });
    if (result.error) { message.textContent = result.error.message; setBusy(this, false); return; }
    var consentUpdate = await supabaseClient.from("leads").update({ contact_consent_at: new Date().toISOString(), contact_consent_source: "carga_manual_supervisor" }).eq("id", result.data);
    if (consentUpdate.error) { message.textContent = consentUpdate.error.message; setBusy(this, false); return; }
    document.getElementById("manualLeadDialog").close();
    await loadData(true);
    pageMessage.textContent = "Lead cargado correctamente.";
    setBusy(this, false);
  });

  function provisionalReviewHtml(sale) {
    var provisional = Array.isArray(sale.provisional) ? sale.provisional[0] : sale.provisional;
    if (!provisional) return "";
    return '<section class="provisional-review"><div class="provisional-review-title"><span>Datero del Apto</span><strong>' + escapeHtml(provisional.request_code) + '</strong></div><div class="provisional-review-grid">' +
      '<div><small>Cliente</small><strong>' + escapeHtml(provisional.first_name + " " + provisional.last_name) + '</strong></div>' +
      '<div><small>' + escapeHtml(provisional.document_type) + ' / CUIL</small><strong>' + escapeHtml(provisional.document_number + " · " + provisional.cuil) + '</strong></div>' +
      '<div><small>Contacto</small><strong>' + escapeHtml(provisional.primary_phone + " · " + provisional.email) + '</strong></div>' +
      '<div><small>Vehículo y plan</small><strong>' + escapeHtml([provisional.brand_name, provisional.model_name, provisional.plan_type].filter(Boolean).join(" · ")) + '</strong></div>' +
      '<div><small>Valor final del plan</small><strong>' + escapeHtml(money(provisional.agreed_price)) + '</strong></div>' +
      '<div><small>Situación laboral</small><strong>' + escapeHtml(provisional.employment_status + " · " + provisional.employer_name) + '</strong></div>' +
      '<div><small>Ingreso declarado</small><strong>' + escapeHtml(money(provisional.monthly_income)) + '</strong></div>' +
    '</div><p>Este datero es provisorio y no registra pagos. Si aprobás la venta, la minuta definitiva volverá al vendedor en “Mis ventas”.</p></section>';
  }

  document.getElementById("salesList").addEventListener("click", function (event) {
    var button = event.target.closest("[data-review-sale]");
    if (!button) return;
    var row = button.closest("[data-sale-id]");
    var sale = state.sales.find(function (item) { return item.id === row.dataset.saleId; });
    if (!sale) return;
    state.activeSale = sale;
    var seller = Array.isArray(sale.seller) ? sale.seller[0] : sale.seller;
    var lead = Array.isArray(sale.lead) ? sale.lead[0] : sale.lead;
    document.getElementById("saleReviewTitle").textContent = "Venta de " + (lead && lead.customer_name || "cliente");
    document.getElementById("saleReviewSummary").innerHTML = '<strong>' + escapeHtml(sale.vehicle) + ' · ' + escapeHtml(money(sale.sale_amount)) + '</strong><span>Informada por ' + escapeHtml(seller && seller.full_name || "Vendedor") + ' el ' + escapeHtml(formatDate(sale.requested_at)) + '</span><span>' + escapeHtml(sale.notes || "Sin observaciones") + '</span>' + provisionalReviewHtml(sale);
    document.getElementById("saleReviewNote").value = "";
    document.getElementById("saleReviewMessage").textContent = "";
    document.getElementById("saleReviewDialog").showModal();
  });

  async function reviewSale(approved, button) {
    if (!state.activeSale) return;
    var message = document.getElementById("saleReviewMessage");
    var note = document.getElementById("saleReviewNote").value.trim();
    message.textContent = "";
    if (!approved && note.length < 3) { message.textContent = "Indicá el motivo del rechazo para orientar al vendedor."; return; }
    setBusy(button, true, approved ? "Confirmando…" : "Rechazando…");
    var result = await supabaseClient.rpc("review_lead_sale", { p_request_id: state.activeSale.id, p_approved: approved, p_review_note: note });
    if (result.error) { message.textContent = result.error.message; setBusy(button, false); return; }
    document.getElementById("saleReviewDialog").close();
    state.activeSale = null;
    await loadData(true);
    pageMessage.textContent = approved ? "Venta confirmada y sumada al ranking." : "La venta fue observada y volvió a Cierre.";
    setBusy(button, false);
  }

  document.getElementById("saleApproveButton").addEventListener("click", function () { reviewSale(true, this); });
  document.getElementById("saleRejectButton").addEventListener("click", function () { reviewSale(false, this); });
  document.getElementById("rankingMonth").addEventListener("change", renderRanking);
  document.getElementById("installmentMonth").addEventListener("change", renderInstallmentMetrics);
  document.getElementById("goalMonth").addEventListener("change", renderGoals);
  document.getElementById("goalSeller").addEventListener("change", renderGoals);
  document.getElementById("goalSave").addEventListener("click", async function () {
    var month = document.getElementById("goalMonth").value;
    var sellerId = document.getElementById("goalSeller").value;
    if (!month || !sellerId) { pageMessage.textContent = "Elegí un mes y un vendedor."; return; }
    var existing = state.goals.find(function (item) { return item.seller_user_id === sellerId && String(item.period_month).slice(0, 7) === month; });
    var payload = {
      period_month: month + "-01",
      seller_user_id: sellerId,
      target_contacts: 0,
      target_interviews: 0,
      target_sales: 0,
      target_finalized: Number(document.getElementById("goalFinalized").value || 0),
      created_by: state.profile.user_id
    };
    setBusy(this, true, "Guardando…");
    var result = existing ? await supabaseClient.from("commercial_goals").update(payload).eq("id", existing.id) : await supabaseClient.from("commercial_goals").insert(payload);
    if (result.error) pageMessage.textContent = result.error.message; else { await loadData(true); pageMessage.textContent = "Objetivo de ventas guardado para el vendedor."; }
    setBusy(this, false);
  });
  document.getElementById("contactTemplates").addEventListener("click", async function (event) {
    var button = event.target.closest("[data-save-template]");
    if (!button) return;
    var card = button.closest("[data-template-id]");
    var body = card.querySelector("textarea").value.trim();
    if (body.length < 10) { pageMessage.textContent = "La plantilla debe tener al menos 10 caracteres."; return; }
    setBusy(button, true, "Guardando…");
    var result = await supabaseClient.from("contact_message_templates").update({ body: body, updated_by: state.profile.user_id }).eq("id", card.dataset.templateId);
    if (result.error) pageMessage.textContent = result.error.message; else { await loadData(true); pageMessage.textContent = "Plantilla de seguimiento actualizada."; }
    setBusy(button, false);
  });

  var rankingNow = new Date();
  document.getElementById("rankingMonth").value = rankingNow.getFullYear() + "-" + String(rankingNow.getMonth() + 1).padStart(2, "0");
  document.getElementById("installmentMonth").value = document.getElementById("rankingMonth").value;
  document.getElementById("goalMonth").value = document.getElementById("rankingMonth").value;

  if (!supabaseClient) { document.getElementById("authLoading").hidden = true; loginView.hidden = false; loginMessage.textContent = "No se pudo conectar con Supabase."; return; }
  supabaseClient.auth.getUser().then(function (result) {
    if (result.data && result.data.user) {
      enterApp().catch(function (error) { document.getElementById("authLoading").hidden = true; loginView.hidden = false; appView.hidden = true; loginMessage.textContent = error.message; });
      return;
    }
    document.getElementById("authLoading").hidden = true;
    loginView.hidden = false;
  });
  window.setInterval(function () { if (state.profile) loadData(true).catch(function () {}); }, 30000);
}());
