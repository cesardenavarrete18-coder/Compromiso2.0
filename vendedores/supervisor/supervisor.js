(function () {
  "use strict";

  var supabaseClient = window.grupoSurSupabaseClient;
  var state = { profile: null, sellers: [], settings: {}, leads: [], tasks: [], goals: [], templates: [], sales: [], adminSales: [], activeSale: null, activeConversationLeadId: null, view: "leads", filter: "pending_supervisor", search: "" };
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
    return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
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

  async function loadData(silent) {
    if (!silent) pageMessage.textContent = "Actualizando información…";
    var results = await Promise.all([
      supabaseClient.from("profiles").select("user_id, full_name, seller_code, active").eq("role", "seller").order("full_name"),
      supabaseClient.from("seller_routing_settings").select("seller_user_id, daily_quota, paused"),
      supabaseClient.from("leads").select("id, customer_phone, customer_name, source_channel, source_detail, seller_code_received, qualification_status, priority, intent_summary, model_interest, routing_status, routing_reason, assigned_seller_user_id, assigned_at, last_message_at, created_at, attribution:lead_attributions(platform,campaign_name,adset_name,ad_name,headline), crm:lead_crm(status, priority, next_contact_at, last_contact_at, interview_at, sale_confirmation_status, sale_confirmed_at)").order("last_message_at", { ascending: false }).limit(500),
      supabaseClient.from("lead_sale_requests").select("id, lead_id, seller_user_id, vehicle, sale_amount, notes, status, requested_at, seller:profiles!lead_sale_requests_seller_user_id_fkey(full_name, seller_code), lead:leads(customer_name, customer_phone, intent_summary)").eq("status", "pending").order("requested_at"),
      supabaseClient.from("sales_cases").select("id, case_code, seller_user_id, vehicle, status, cdn_scoring_status, dealer_scoring_status, contract_status, finalized_at, cancellation_reason, updated_at, seller:profiles!sales_cases_seller_user_id_fkey(full_name, seller_code), lead:leads!sales_cases_lead_id_fkey(customer_name), events:sales_case_events(stage, outcome, comment, created_at)").order("updated_at", { ascending: false }).limit(250),
      supabaseClient.from("lead_contact_tasks").select("id, lead_id, seller_user_id, channel, call_attempt, message_step, due_start, due_end, status, outcome, lead:leads(customer_name,customer_phone,model_interest), seller:profiles!lead_contact_tasks_seller_user_id_fkey(full_name,seller_code)").eq("status", "pending").order("due_start").limit(1000),
      supabaseClient.from("commercial_goals").select("id, period_month, seller_user_id, target_contacts, target_interviews, target_sales, target_finalized").order("period_month", { ascending: false }).limit(500),
      supabaseClient.from("contact_message_templates").select("id, step_number, title, body, active, updated_at").order("step_number")
    ]);
    var failed = results.find(function (item) { return item.error; });
    if (failed) throw failed.error;
    state.sellers = results[0].data || [];
    state.settings = {};
    (results[1].data || []).forEach(function (item) { state.settings[item.seller_user_id] = item; });
    state.leads = results[2].data || [];
    state.sales = results[3].data || [];
    state.adminSales = results[4].data || [];
    state.tasks = results[5].data || [];
    state.goals = results[6].data || [];
    state.templates = results[7].data || [];
    renderAll();
    pageMessage.textContent = "";
  }

  function sellerById(id) {
    return state.sellers.find(function (seller) { return seller.user_id === id; });
  }

  function renderStats() {
    var today = localDateKey(new Date());
    document.getElementById("pendingStat").textContent = state.leads.filter(function (lead) { return lead.routing_status === "pending_supervisor"; }).length;
    document.getElementById("directStat").textContent = state.leads.filter(function (lead) { return lead.routing_status === "assigned_direct" && lead.assigned_at && localDateKey(lead.assigned_at) === today; }).length;
    document.getElementById("assignedStat").textContent = state.leads.filter(function (lead) { return lead.assigned_seller_user_id && lead.assigned_at && localDateKey(lead.assigned_at) === today; }).length;
    document.getElementById("unqualifiedStat").textContent = state.leads.filter(function (lead) { return lead.qualification_status === "unqualified"; }).length;
    document.getElementById("pendingSalesStat").textContent = state.sales.length;
    document.getElementById("overdueTasksStat").textContent = state.tasks.filter(function (task) { return new Date(task.due_end).getTime() < Date.now(); }).length;
  }

  function renderOperations() {
    var now = Date.now();
    var today = localDateKey(new Date());
    var overdue = state.tasks.filter(function (task) { return new Date(task.due_end).getTime() < now; });
    var todayTasks = state.tasks.filter(function (task) { return localDateKey(task.due_start) === today; });
    document.getElementById("operationsSummary").innerHTML = state.sellers.map(function (seller) {
      var sellerTasks = state.tasks.filter(function (task) { return task.seller_user_id === seller.user_id; });
      var sellerOverdue = sellerTasks.filter(function (task) { return new Date(task.due_end).getTime() < now; }).length;
      var sellerToday = sellerTasks.filter(function (task) { return localDateKey(task.due_start) === today; }).length;
      return '<article class="operation-seller' + (sellerOverdue ? ' attention' : '') + '"><span>' + escapeHtml(initials(seller.full_name)) + '</span><div><strong>' + escapeHtml(seller.full_name) + '</strong><small>' + sellerToday + ' acciones hoy · ' + sellerOverdue + ' vencidas</small></div><b>' + sellerTasks.length + '</b></article>';
    }).join("") || '<div class="sales-empty">Todavía no hay vendedores activos.</div>';
    document.getElementById("operationsTasks").innerHTML = overdue.concat(todayTasks.filter(function (task) { return !overdue.some(function (item) { return item.id === task.id; }); })).slice(0, 12).map(function (task) {
      var lead = Array.isArray(task.lead) ? task.lead[0] : task.lead;
      var seller = Array.isArray(task.seller) ? task.seller[0] : task.seller;
      var isOverdue = new Date(task.due_end).getTime() < now;
      return '<article class="operation-task' + (isOverdue ? ' overdue' : '') + '"><div><strong>' + escapeHtml(task.channel === "call" ? "Llamada " + task.call_attempt + " de 3" : "WhatsApp " + task.message_step + " de 4") + '</strong><small>' + escapeHtml(formatDate(task.due_start)) + '</small></div><div><strong>' + escapeHtml(lead && lead.customer_name || "Cliente") + '</strong><small>' + escapeHtml(lead && lead.model_interest || "Modelo a definir") + '</small></div><span>' + escapeHtml(seller && seller.full_name || "Sin vendedor") + '</span></article>';
    }).join("") || '<div class="sales-empty">No hay acciones vencidas ni programadas para hoy.</div>';
    document.getElementById("operationsCaption").textContent = overdue.length + " vencidas · " + todayTasks.length + " programadas para hoy";
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
    var titles = { leads: ["Distribución comercial", "Bandeja de leads"], bases: ["Administración de bases", "Nuevos y rellamados"], followup: ["Cumplimiento operativo", "Proceso de seguimiento"], sales: ["Control comercial", "Ventas para confirmar"], administration: ["Circuito posterior a la venta", "Seguimiento administrativo"], goals: ["Rendimiento del equipo", "Objetivos comerciales"] };
    document.querySelector(".topbar .eyebrow").textContent = titles[view][0];
    document.querySelector(".topbar h1").textContent = titles[view][1];
    if (view === "goals") { renderGoals(); renderRanking(); }
    if (view === "administration") renderInstallmentMetrics();
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
      var haystack = [lead.customer_name, lead.customer_phone, lead.intent_summary, lead.model_interest, lead.seller_code_received].join(" ").toLocaleLowerCase("es-AR");
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
    if (lead.routing_status === "assigned_direct") return "Código válido";
    if (lead.routing_status === "assigned_manual") return "Asignación manual";
    if (lead.routing_reason === "invalid_seller_code") return "Código no válido";
    if (lead.routing_reason === "daily_quota_reached") return "Cupo alcanzado";
    if (lead.routing_reason === "seller_paused") return "Vendedor pausado";
    return "Bandeja general";
  }

  async function loadConversation(leadId) {
    if (!leadId) return;
    var messages = await supabaseClient.from("lead_messages").select("direction, body, created_at").eq("lead_id", leadId).order("created_at");
    if (state.activeConversationLeadId !== leadId) return;
    var conversation = document.getElementById("conversation");
    var status = document.getElementById("dialogConversationStatus");
    if (messages.error || !messages.data.length) {
      conversation.innerHTML = '<div class="message-bubble">Todavía no hay mensajes disponibles.</div>';
      status.textContent = "Sin mensajes para mostrar";
      return;
    }
    conversation.innerHTML = messages.data.map(function (message) { return '<div class="message-bubble ' + escapeHtml(message.direction) + '">' + escapeHtml(message.body || "Mensaje sin texto") + '<small>' + escapeHtml(formatDate(message.created_at)) + '</small></div>'; }).join("");
    var lastMessage = messages.data[messages.data.length - 1];
    status.textContent = lastMessage.direction === "outbound"
      ? "Pendiente de filtrado · esperando respuesta del cliente desde " + formatDate(lastMessage.created_at)
      : "El cliente respondió · último mensaje " + formatDate(lastMessage.created_at);
    conversation.scrollTop = conversation.scrollHeight;
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
      var sourceLabel = lead.source_channel === "tiktok" ? "TikTok / código " + (lead.seller_code_received || "—") : lead.source_detail === "meta_ads" ? "Meta Ads · " + (attribution && (attribution.ad_name || attribution.headline || attribution.campaign_name) || "Anuncio sin nombre") : lead.source_channel === "manual" ? "Carga manual · " + (lead.source_detail || "Sin detalle") : "WhatsApp orgánico";
      return '<article class="lead-card" data-lead-id="' + lead.id + '">' +
        '<div class="lead-person"><strong>' + escapeHtml(lead.customer_name || "Cliente sin nombre") + '</strong><span>+' + escapeHtml(lead.customer_phone) + ' · ' + escapeHtml(formatDate(lead.last_message_at)) + '</span><span>' + escapeHtml(sourceLabel) + '</span></div>' +
        '<div class="lead-summary"><p>' + escapeHtml(lead.intent_summary || "Pendiente de resumen") + '</p><div class="badges"><span class="badge ' + escapeHtml(lead.qualification_status) + '">' + escapeHtml(lead.qualification_status === "qualified" ? "Calificado" : lead.qualification_status === "unqualified" ? "No calificado" : "Pendiente de filtrado") + '</span><span class="badge ' + escapeHtml((crm && crm.priority) || lead.priority) + '">' + escapeHtml((crm && crm.priority) === "high" || lead.priority === "high" ? "Prioridad alta" : "Prioridad normal") + '</span><span class="badge">' + escapeHtml(crm && crm.status ? crm.status.replace(/_/g, " ") : "nuevo") + '</span><span class="badge">' + escapeHtml(routingLabel(lead)) + '</span></div></div>' +
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
      return '<article class="sale-row" data-sale-id="' + sale.id + '"><div><strong>' + escapeHtml(lead && lead.customer_name || "Cliente sin nombre") + '</strong><small>+' + escapeHtml(lead && lead.customer_phone || "") + ' · ' + escapeHtml(formatDate(sale.requested_at)) + '</small></div><div><strong>' + escapeHtml(sale.vehicle) + '</strong><span>' + escapeHtml(sale.notes || lead && lead.intent_summary || "Sin observaciones") + '</span></div><div><span class="sale-amount">' + escapeHtml(money(sale.sale_amount)) + '</span><small>' + escapeHtml(seller && seller.full_name || "Vendedor") + ' · ' + escapeHtml(seller && seller.seller_code || "") + '</small></div><button class="button primary" data-review-sale type="button">Revisar</button></article>';
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
    renderOperations();
    renderGoals();
    renderTemplates();
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
      document.getElementById("dialogLeadName").textContent = lead.customer_name || "+" + lead.customer_phone;
      document.getElementById("dialogLeadSummary").textContent = lead.intent_summary || "Sin resumen disponible.";
      document.getElementById("conversation").innerHTML = '<div class="message-bubble">Cargando conversación…</div>';
      document.getElementById("dialogConversationStatus").textContent = "Consultando mensajes…";
      state.activeConversationLeadId = lead.id;
      document.getElementById("leadDialog").showModal();
      await loadConversation(lead.id);
    }
  });

  document.getElementById("conversationRefresh").addEventListener("click", function () {
    loadConversation(state.activeConversationLeadId).catch(function () {});
  });
  document.getElementById("leadDialog").addEventListener("close", function () { state.activeConversationLeadId = null; });

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
    document.getElementById("saleReviewSummary").innerHTML = '<strong>' + escapeHtml(sale.vehicle) + ' · ' + escapeHtml(money(sale.sale_amount)) + '</strong><span>Informada por ' + escapeHtml(seller && seller.full_name || "Vendedor") + ' el ' + escapeHtml(formatDate(sale.requested_at)) + '</span><span>' + escapeHtml(sale.notes || "Sin observaciones") + '</span>';
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
  window.setInterval(function () {
    if (state.profile && state.activeConversationLeadId && document.getElementById("leadDialog").open) loadConversation(state.activeConversationLeadId).catch(function () {});
  }, 10000);
}());
