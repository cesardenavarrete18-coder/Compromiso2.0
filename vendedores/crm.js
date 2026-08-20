(function () {
  "use strict";

  var supabaseClient = window.grupoSurSupabaseClient;
  if (!supabaseClient) return;

  var STAGES = [
    { value: "nuevo", label: "Nuevo" },
    { value: "no_contesta", label: "No contesta" },
    { value: "en_proceso", label: "En proceso" },
    { value: "invalido", label: "Inválido / Erróneo" },
    { value: "entrevista", label: "Entrevista" },
    { value: "cierre", label: "Cierre" },
    { value: "sena", label: "Seña" },
    { value: "venta", label: "Venta" },
    { value: "desistir", label: "Desistir" }
  ];
  var CLOSED_STAGES = ["venta", "desistir", "invalido"];
  var state = { leads: [], tasks: [], appraisals: [], saleQuotes: [], activeLead: null, view: "agenda", searchAgenda: "", searchPipeline: "", loading: false };
  var leadDialog = document.getElementById("crmLeadDialog");
  var commentDialog = document.getElementById("crmCommentDialog");
  var saleDialog = document.getElementById("crmSaleDialog");
  var answeredDialog = document.getElementById("crmAnsweredDialog");
  var appraisalDialog = document.getElementById("crmAppraisalDialog");
  var pendingAnsweredTaskId = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char];
    });
  }

  function stageLabel(value) {
    var stage = STAGES.find(function (item) { return item.value === value; });
    return stage ? stage.label : "Nuevo";
  }

  function crmOf(lead) {
    if (!lead || !lead.crm) return { status: "nuevo", priority: lead && lead.priority || "normal", sale_confirmation_status: "none" };
    return Array.isArray(lead.crm) ? lead.crm[0] || {} : lead.crm;
  }

  function attributionOf(lead) {
    if (!lead || !lead.attribution) return null;
    return Array.isArray(lead.attribution) ? lead.attribution[0] || null : lead.attribution;
  }

  function appraisalForLead(leadId) {
    return state.appraisals.find(function (item) { return item.lead_id === leadId; }) || null;
  }

  function conditionLabel(value) {
    return { excellent: "Excelente", good: "Bueno", fair: "Regular", to_review: "A revisar" }[value] || "A revisar";
  }

  function marketMoney(value, currency) {
    if (value == null || value === "") return "Importe no informado";
    return (currency === "USD" ? "US$" : "$") + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Number(value));
  }

  function renderAppraisalSummary(leadId) {
    var appraisal = appraisalForLead(leadId);
    var target = document.getElementById("crmAppraisalSummary");
    target.hidden = !appraisal;
    if (!appraisal) { target.innerHTML = ""; return; }
    var valueText = appraisal.status === "confirmed"
      ? "Valor confirmado: " + marketMoney(appraisal.confirmed_value, appraisal.confirmed_currency || appraisal.market_currency)
      : appraisal.estimated_min != null && appraisal.estimated_max != null
        ? "Mercado publicado: " + marketMoney(appraisal.estimated_min, appraisal.market_currency) + " a " + marketMoney(appraisal.estimated_max, appraisal.market_currency)
        : "Sin referencia de mercado suficiente";
    var suggestedText = appraisal.suggested_value != null ? " · Toma sugerida (-15%): " + marketMoney(appraisal.suggested_value, appraisal.market_currency) : "";
    target.innerHTML = '<div><strong>' + escapeHtml([appraisal.brand, appraisal.model, appraisal.version, appraisal.vehicle_year].filter(Boolean).join(" · ")) + '</strong><span>' + escapeHtml(new Intl.NumberFormat("es-AR").format(appraisal.mileage_km) + " km · " + conditionLabel(appraisal.condition) + " · " + valueText + suggestedText) + '</span>' + (appraisal.reference_count ? '<small>' + escapeHtml(appraisal.reference_count + " comparables activos · consulta " + formatDate(appraisal.market_checked_at)) + '</small>' : '') + '</div><b class="' + (appraisal.status === "confirmed" ? "confirmed" : "") + '">' + escapeHtml(appraisal.status === "confirmed" ? "Tasación confirmada" : "Tasación pendiente de confirmación") + '</b>';
  }

  function tasksForLead(leadId) {
    var tasks = state.tasks.filter(function (task) { return task.lead_id === leadId; });
    var pending = tasks.find(function (task) { return task.status === "pending"; });
    var latest = tasks.slice().sort(function (a, b) { return new Date(b.due_start) - new Date(a.due_start); })[0];
    var sequenceId = pending && pending.sequence_id || latest && latest.sequence_id;
    return tasks.filter(function (task) { return task.sequence_id === sequenceId; }).sort(function (a, b) { return a.sequence_order - b.sequence_order; });
  }

  function nextPendingTask(leadId) {
    return tasksForLead(leadId).find(function (task) { return task.status === "pending"; }) || null;
  }

  function taskTitle(task) {
    return task.channel === "call" ? "Llamada " + task.call_attempt + " de 3" : "WhatsApp " + task.message_step + " de 4";
  }

  function protocolProgress(leadId) {
    var tasks = tasksForLead(leadId);
    if (!tasks.length) return null;
    var completed = tasks.filter(function (task) { return ["completed", "skipped"].includes(task.status); }).length;
    return { completed: completed, total: tasks.length, pending: nextPendingTask(leadId) };
  }

  function personalizedMessage(task, lead) {
    var template = Array.isArray(task.template) ? task.template[0] : task.template;
    var body = template && template.body || "Hola {nombre}, quería retomar tu consulta comercial.";
    var sellerNode = document.getElementById("sidebarSellerName");
    var sellerName = sellerNode && sellerNode.textContent && sellerNode.textContent !== "Vendedor" ? sellerNode.textContent : "tu asesor comercial";
    if (!lead.customer_name) body = body.replace("Hola {nombre}, ¿cómo estás?", "Hola, ¿cómo estás?");
    return body.replace(/\{nombre\}/g, lead.customer_name || "")
      .replace(/\{vendedor\}/g, sellerName)
      .replace(/\{modelo\}/g, lead.model_interest || "tu próximo 0 km");
  }

  function formatDate(value, includeWeekday) {
    if (!value) return "Sin programar";
    return new Intl.DateTimeFormat("es-AR", {
      weekday: includeWeekday ? "short" : undefined,
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(new Date(value));
  }

  function localDateKey(value) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  }

  function dateParts(value) {
    if (!value) return { date: "", time: "" };
    var parts = new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date(value));
    var values = {};
    parts.forEach(function (part) { if (part.type !== "literal") values[part.type] = part.value; });
    return { date: values.day + "/" + values.month + "/" + values.year, time: values.hour + ":" + values.minute };
  }

  function parseArgentineDateTime(dateValue, timeValue, fieldLabel) {
    var dateText = String(dateValue || "").trim();
    var timeText = String(timeValue || "").trim();
    if (!dateText && !timeText) return null;
    if (!dateText || !timeText) throw new Error("Completá la fecha y la hora de " + fieldLabel + ".");
    var match = dateText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) throw new Error("Ingresá la fecha de " + fieldLabel + " con formato dd/mm/aaaa.");
    var day = Number(match[1]);
    var month = Number(match[2]);
    var year = Number(match[3]);
    var timeMatch = timeText.match(/^(\d{2}):(\d{2})$/);
    if (!timeMatch) throw new Error("Ingresá una hora válida para " + fieldLabel + ".");
    var probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) throw new Error("La fecha de " + fieldLabel + " no es válida.");
    return new Date(String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0") + "T" + timeMatch[1] + ":" + timeMatch[2] + ":00-03:00").toISOString();
  }

  function maskDateInput(input) {
    var digits = input.value.replace(/\D/g, "").slice(0, 8);
    input.value = digits.length > 4 ? digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4) : digits.length > 2 ? digits.slice(0, 2) + "/" + digits.slice(2) : digits;
  }

  function money(value) {
    if (value == null || value === "") return "Sin informar";
    return "$" + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Number(value));
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? label : button.dataset.originalLabel;
  }

  function normalizeSearch(value) {
    return String(value || "").trim().toLocaleLowerCase("es-AR");
  }

  function matchesSearch(lead, query) {
    if (!query) return true;
    return [lead.customer_name, lead.customer_phone, lead.model_interest, lead.intent_summary, lead.source_detail]
      .join(" ").toLocaleLowerCase("es-AR").includes(query);
  }

  async function loadLeads(silent) {
    if (state.loading) return;
    state.loading = true;
    var message = document.getElementById("crmAgendaMessage");
    if (!silent) message.textContent = "Actualizando agenda…";
    try {
      var responses = await Promise.all([
        supabaseClient.from("leads").select(
          "id, customer_id, customer_phone, customer_name, source_channel, source_detail, qualification_status, priority, intent_summary, model_interest, assigned_at, last_message_at, created_at, attribution:lead_attributions(platform,source_type,campaign_name,adset_name,ad_name,headline,source_url), crm:lead_crm(status, priority, status_reason, next_contact_at, next_contact_note, last_contact_at, last_contact_outcome, interview_at, interview_location, deposit_amount, deposit_at, cold_base_at, sale_confirmation_status, sale_requested_at, sale_confirmed_at, vehicle_sold, sale_amount, updated_at)"
        ).order("last_message_at", { ascending: false }).limit(500),
        supabaseClient.from("lead_contact_tasks").select("id, sequence_id, lead_id, sequence_order, channel, call_attempt, message_step, due_start, due_end, status, outcome, note, completed_at, template:contact_message_templates(title,body)").order("due_start", { ascending: true }).limit(3500),
        supabaseClient.from("vehicle_appraisals").select("id, lead_id, brand, model, version, vehicle_year, mileage_km, condition, notes, estimated_min, estimated_max, market_median, suggested_value, market_currency, estimate_source, estimate_basis, reference_count, market_references, market_checked_at, status, confirmed_value, confirmed_currency, review_note, updated_at").order("updated_at", { ascending: false }).limit(500)
      ]);
      if (responses[0].error) throw responses[0].error;
      if (responses[1].error) throw responses[1].error;
      if (responses[2].error) throw responses[2].error;
      state.leads = responses[0].data || [];
      state.tasks = responses[1].data || [];
      state.appraisals = responses[2].data || [];
      renderAgenda();
      renderPipeline();
      message.textContent = "";
      message.classList.remove("error");
    } catch (error) {
      message.textContent = error.message || "No se pudo cargar la agenda.";
      message.classList.add("error");
    } finally {
      state.loading = false;
    }
  }

  function renderSummary() {
    var now = Date.now();
    var counts = {
      overdue: state.leads.filter(function (lead) { var crm = crmOf(lead); return crm.next_contact_at && new Date(crm.next_contact_at).getTime() < now && !CLOSED_STAGES.includes(crm.status); }).length,
      today: state.leads.filter(function (lead) { var crm = crmOf(lead); return crm.next_contact_at && new Date(crm.next_contact_at).getTime() >= now && localDateKey(crm.next_contact_at) === localDateKey(new Date()) && !CLOSED_STAGES.includes(crm.status); }).length,
      newLead: state.leads.filter(function (lead) { var crm = crmOf(lead); return crm.status === "nuevo" && !crm.next_contact_at; }).length,
      interview: state.leads.filter(function (lead) { var crm = crmOf(lead); return crm.status === "entrevista" && crm.interview_at && new Date(crm.interview_at).getTime() >= now; }).length,
      closing: state.leads.filter(function (lead) { return ["cierre", "sena"].includes(crmOf(lead).status); }).length
    };
    document.getElementById("crmSummary").innerHTML = [
      ["urgent", "Vencidos", counts.overdue, "Requieren acción"],
      ["today", "Para hoy", counts.today, "Contactos programados"],
      ["", "Nuevos", counts.newLead, "Todavía sin gestionar"],
      ["interview", "Entrevistas", counts.interview, "Próximas visitas"],
      ["closing", "Cierre / Seña", counts.closing, "Máxima prioridad"]
    ].map(function (item) {
      return '<article class="crm-stat ' + item[0] + '"><span>' + item[1] + '</span><strong>' + item[2] + '</strong><small>' + item[3] + '</small></article>';
    }).join("");
  }

  function leadCard(lead) {
    var crm = crmOf(lead);
    var next = crm.next_contact_at;
    var isOverdue = next && new Date(next).getTime() < Date.now() && !CLOSED_STAGES.includes(crm.status);
    var pendingSale = crm.sale_confirmation_status === "pending";
    var progress = protocolProgress(lead.id);
    return '<article class="crm-lead-card" data-crm-lead-id="' + lead.id + '">' +
      '<div class="crm-card-top"><div><strong>' + escapeHtml(lead.customer_name || "Cliente sin nombre") + '</strong><small>+' + escapeHtml(lead.customer_phone) + '</small></div><span class="crm-stage" data-stage="' + escapeHtml(crm.status || "nuevo") + '">' + escapeHtml(stageLabel(crm.status)) + '</span></div>' +
      '<p class="crm-card-summary">' + escapeHtml(lead.intent_summary || lead.model_interest || "Sin resumen comercial") + '</p>' +
      '<div class="crm-card-tags"><span>' + escapeHtml(lead.model_interest || "Modelo a definir") + '</span>' +
        '<span class="' + (crm.priority === "high" ? "high" : "") + '">' + escapeHtml(crm.priority === "high" ? "Prioridad alta" : crm.priority === "low" ? "Prioridad baja" : "Prioridad normal") + '</span>' +
        (pendingSale ? '<span class="high">Venta por confirmar</span>' : '') +
        (progress ? '<span class="protocol">Seguimiento ' + progress.completed + '/' + progress.total + '</span>' : '') + '</div>' +
      '<div class="crm-card-footer"><time class="' + (isOverdue ? "overdue" : "") + '">' + escapeHtml(next ? (isOverdue ? "Vencido · " : "Próximo · ") + formatDate(next) : crm.status === "nuevo" ? "Pendiente de primer contacto" : "Sin próxima tarea") + '</time><button class="crm-open" type="button">Gestionar</button></div>' +
    '</article>';
  }

  function agendaGroup(title, items, emptyText) {
    return '<section class="agenda-group' + (title === "Sin próxima acción" ? ' requires-action' : '') + '"><div class="agenda-group-head"><h3>' + escapeHtml(title) + '</h3><span>' + items.length + '</span></div>' +
      (items.length ? '<div class="agenda-cards">' + items.map(leadCard).join("") + '</div>' : '<div class="agenda-empty">' + escapeHtml(emptyText) + '</div>') + '</section>';
  }

  function renderAgenda() {
    var query = normalizeSearch(state.searchAgenda);
    var leads = state.leads.filter(function (lead) { return matchesSearch(lead, query); });
    var today = localDateKey(new Date());
    var now = Date.now();
    var overdue = leads.filter(function (lead) { var crm = crmOf(lead); return crm.next_contact_at && new Date(crm.next_contact_at).getTime() < now && !CLOSED_STAGES.includes(crm.status); }).sort(function (a, b) { return new Date(crmOf(a).next_contact_at) - new Date(crmOf(b).next_contact_at); });
    var forToday = leads.filter(function (lead) { var crm = crmOf(lead); return crm.next_contact_at && new Date(crm.next_contact_at).getTime() >= now && localDateKey(crm.next_contact_at) === today && !CLOSED_STAGES.includes(crm.status); }).sort(function (a, b) { return new Date(crmOf(a).next_contact_at) - new Date(crmOf(b).next_contact_at); });
    var newLeads = leads.filter(function (lead) { var crm = crmOf(lead); return crm.status === "nuevo" && !crm.next_contact_at; });
    var unscheduled = leads.filter(function (lead) { var crm = crmOf(lead); return !crm.next_contact_at && !CLOSED_STAGES.includes(crm.status) && crm.status !== "nuevo"; });
    var next = leads.filter(function (lead) { var crm = crmOf(lead); return crm.next_contact_at && new Date(crm.next_contact_at).getTime() >= now && localDateKey(crm.next_contact_at) !== today && !CLOSED_STAGES.includes(crm.status); }).sort(function (a, b) { return new Date(crmOf(a).next_contact_at) - new Date(crmOf(b).next_contact_at); });
    document.getElementById("crmAgenda").innerHTML =
      agendaGroup("Contactos vencidos", overdue, "No tenés seguimientos vencidos.") +
      agendaGroup("Sin próxima acción", unscheduled, "Todas las gestiones activas tienen un próximo paso definido.") +
      agendaGroup("Programados para hoy", forToday, "No hay contactos programados para hoy.") +
      agendaGroup("Nuevos por atender", newLeads, "No tenés leads nuevos pendientes.") +
      agendaGroup("Próximos contactos", next.slice(0, 30), "Todavía no programaste próximos contactos.");
    renderSummary();
  }

  function renderPipeline() {
    var query = normalizeSearch(state.searchPipeline);
    var leads = state.leads.filter(function (lead) { return matchesSearch(lead, query); });
    document.getElementById("crmPipeline").innerHTML = STAGES.filter(function (stage) { return stage.value !== "invalido"; }).map(function (stage) {
      var items = leads.filter(function (lead) { return (crmOf(lead).status || "nuevo") === stage.value; });
      return '<section class="pipeline-column"><div class="pipeline-head"><strong>' + escapeHtml(stage.label) + '</strong><span>' + items.length + '</span></div><div class="pipeline-cards">' +
        (items.length ? items.map(leadCard).join("") : '<div class="pipeline-empty">Sin leads en este estado</div>') + '</div></section>';
    }).join("");
  }

  async function loadRanking() {
    var monthValue = document.getElementById("crmRankingMonth").value;
    var firstDay = monthValue ? monthValue + "-01" : null;
    var result = await supabaseClient.rpc("get_sales_performance", { p_month: firstDay });
    var data = result.data || [];
    if (result.error) {
      document.getElementById("crmRankingBody").innerHTML = '<tr><td colspan="6">No se pudo cargar el ranking.</td></tr>';
      return;
    }
    document.getElementById("crmPodium").innerHTML = data.slice(0, 3).map(function (item, index) {
      return '<article class="podium-card"><span class="place">' + (index + 1) + '</span><h3>' + escapeHtml(item.seller_name) + '</h3><p>' + escapeHtml(item.seller_code) + ' · ' + escapeHtml(item.conversion_rate) + '% de conversión</p><strong>' + item.confirmed_sales + ' venta' + (Number(item.confirmed_sales) === 1 ? '' : 's') + '</strong></article>';
    }).join("") || '<div class="agenda-empty">Todavía no hay vendedores activos.</div>';
    document.getElementById("crmRankingBody").innerHTML = data.map(function (item, index) {
      return '<tr><td><strong>#' + (index + 1) + '</strong></td><td><strong>' + escapeHtml(item.seller_name) + '</strong><small>' + escapeHtml(item.seller_code) + '</small></td><td>' + item.confirmed_sales + '</td><td>' + item.finalized_sales + '</td><td>' + item.assigned_leads + '</td><td>' + escapeHtml(item.conversion_rate) + '%</td></tr>';
    }).join("") || '<tr><td colspan="6">Todavía no hay datos para este mes.</td></tr>';
  }

  function openView(viewName) {
    state.view = viewName;
    document.querySelectorAll(".view").forEach(function (view) { view.classList.remove("is-active"); });
    var target = document.getElementById("crm" + viewName.charAt(0).toUpperCase() + viewName.slice(1) + "View");
    if (target) target.classList.add("is-active");
    document.getElementById("stepper").hidden = true;
    document.getElementById("pageTitle").textContent = viewName === "agenda" ? "Mi agenda comercial" : viewName === "pipeline" ? "Embudo de oportunidades" : viewName === "quotes" ? "Presupuestos comerciales" : viewName === "sales" ? "Mis ventas" : viewName === "recalls" ? "Panel de rellamados" : "Ranking del equipo";
    document.getElementById("headerKicker").textContent = viewName === "recalls" ? "Base histórica asignada" : "CRM Grupo Sur Automotores";
    document.querySelectorAll(".nav-item").forEach(function (item) { item.classList.toggle("is-active", item.dataset.crmView === viewName); });
    if (viewName === "ranking") loadRanking();
    else if (viewName === "quotes" && window.grupoSurSales) window.grupoSurSales.loadQuotes();
    else if (viewName === "sales" && window.grupoSurSales) window.grupoSurSales.loadSales();
    else if (viewName === "recalls") document.dispatchEvent(new CustomEvent("grupoSur:recalls-open"));
    else loadLeads(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderNextCard(lead) {
    var crm = crmOf(lead);
    var attribution = attributionOf(lead);
    var origin = lead.source_channel === "manual" ? "Carga manual · " + (lead.source_detail || "Sin detalle") : lead.source_channel === "tiktok" ? "TikTok" : lead.source_detail === "meta_ads" ? "Meta Ads · " + (attribution && (attribution.ad_name || attribution.headline || attribution.campaign_name) || "Anuncio de WhatsApp") : "WhatsApp orgánico";
    document.getElementById("crmNextCard").innerHTML = '<span>Próxima acción</span><strong>' + escapeHtml(crm.next_contact_at ? formatDate(crm.next_contact_at, true) : "Sin programar") + '</strong><dl>' +
      '<div><dt>Motivo</dt><dd>' + escapeHtml(crm.next_contact_note || "No indicado") + '</dd></div>' +
      '<div><dt>Último contacto</dt><dd>' + escapeHtml(crm.last_contact_at ? formatDate(crm.last_contact_at) : "Todavía sin contacto") + '</dd></div>' +
      '<div><dt>Origen</dt><dd>' + escapeHtml(origin) + '</dd></div>' +
      (crm.interview_at ? '<div><dt>Entrevista</dt><dd>' + escapeHtml(formatDate(crm.interview_at, true) + (crm.interview_location ? " · " + crm.interview_location : "")) + '</dd></div>' : '') +
      (crm.deposit_amount ? '<div><dt>Seña</dt><dd>' + escapeHtml(money(crm.deposit_amount)) + '</dd></div>' : '') +
    '</dl>';
  }

  async function loadTimeline(leadId) {
    var result = await supabaseClient.from("lead_activities").select("id, activity_type, title, detail, metadata, created_at, actor:profiles(full_name)").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(100);
    document.getElementById("crmTimeline").innerHTML = result.error || !result.data.length ? '<div class="agenda-empty">Todavía no hay movimientos registrados.</div>' : result.data.map(function (item) {
      var actor = Array.isArray(item.actor) ? item.actor[0] : item.actor;
      return '<article class="timeline-item"><strong>' + escapeHtml(item.title) + '</strong>' + (item.detail ? '<span>' + escapeHtml(item.detail) + '</span>' : '') + '<small>' + escapeHtml(formatDate(item.created_at, true) + ' · ' + (actor && actor.full_name || "Sistema")) + '</small></article>';
    }).join("");
  }

  async function loadChat(leadId) {
    var result = await supabaseClient.from("lead_messages").select("direction, body, message_type, created_at").eq("lead_id", leadId).order("created_at").limit(200);
    document.getElementById("crmChat").innerHTML = result.error || !result.data.length ? '<div class="agenda-empty">No hay mensajes disponibles.</div>' : result.data.map(function (message) {
      return '<div class="crm-chat-bubble ' + escapeHtml(message.direction) + '">' + escapeHtml(message.body || "Mensaje sin texto") + '<small>' + escapeHtml(formatDate(message.created_at)) + '</small></div>';
    }).join("");
  }

  function updateConditionalFields() {
    var status = document.getElementById("crmStatusInput").value;
    var terminalStatus = ["desistir", "invalido"].includes(status);
    document.querySelectorAll("[data-status-field]").forEach(function (field) { field.classList.toggle("visible", field.dataset.statusField === status); });
    document.querySelectorAll("[data-next-contact-field]").forEach(function (field) { field.hidden = terminalStatus; });
    if (terminalStatus) {
      document.getElementById("crmNextContactDateInput").value = "";
      document.getElementById("crmNextContactTimeInput").value = "";
      document.getElementById("crmNextContactNoteInput").value = "";
    }
    var automated = state.activeLead && nextPendingTask(state.activeLead.id) && ["nuevo", "no_contesta"].includes(status);
    var help = {
      no_contesta: automated ? "El proceso de seguimiento ya programó automáticamente el próximo intento." : "Programá el próximo intento.",
      entrevista: "La entrevista requiere día, hora y, de ser posible, sucursal.",
      cierre: "Este lead quedará automáticamente en prioridad alta.",
      sena: "Registrá el importe de la seña; la venta seguirá requiriendo confirmación.",
      invalido: "Explicá por qué el teléfono o contacto es inválido.",
      desistir: "Indicá el motivo. El lead pasará a la base fría para remarketing."
    };
    document.getElementById("crmFormHelp").textContent = automated ? "El checklist propone los intentos recomendados. Podés conservar esa fecha o definir manualmente el próximo contacto." : (help[status] || "Guardá un resumen breve y programá el próximo paso cuando corresponda.");
  }

  function renderProtocol(lead) {
    var tasks = tasksForLead(lead.id);
    var container = document.getElementById("crmProtocol");
    if (!tasks.length) {
      container.innerHTML = '<div class="agenda-empty">Este Lead no tiene un proceso de seguimiento activo. Podés gestionarlo de forma manual.</div>';
      return;
    }
    var progress = protocolProgress(lead.id);
    var nextTask = nextPendingTask(lead.id);
    container.innerHTML = '<div class="protocol-heading"><div><span class="protocol-kicker">Organización comercial</span><strong>Proceso de seguimiento</strong><span>3 llamadas · 4 WhatsApp · distribuidos en 3 días hábiles</span></div><span class="protocol-progress"><b>' + progress.completed + '</b><small>de ' + progress.total + '</small></span></div>' +
      '<div class="protocol-task-list">' + tasks.map(function (task) {
        var pending = task.status === "pending";
        var isNext = nextTask && nextTask.id === task.id;
        var due = formatDate(task.due_start, true) + " a " + new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" }).format(new Date(task.due_end));
        var body = task.channel === "whatsapp" ? personalizedMessage(task, lead) : "";
        var completedAt = task.completed_at ? new Date(task.completed_at).getTime() : null;
        var insideWindow = completedAt && completedAt >= new Date(task.due_start).getTime() && completedAt <= new Date(task.due_end).getTime();
        return '<article class="protocol-task ' + escapeHtml(task.status) + (isNext ? ' is-next' : '') + (task.completed_at ? (insideWindow ? ' on-time' : ' outside-window') : '') + '">' +
          '<span class="protocol-task-number">' + task.sequence_order + '</span><div class="protocol-task-main"><div class="protocol-task-title"><div><span class="protocol-channel">' + escapeHtml(task.channel === "call" ? "Llamada" : "WhatsApp") + '</span><strong>' + escapeHtml(taskTitle(task)) + '</strong></div><div class="protocol-task-meta">' + (isNext ? '<em>Próximo paso</em>' : '') + '<small>' + escapeHtml(due) + '</small></div></div>' +
          (body ? '<p>' + escapeHtml(body) + '</p>' : '<p>Contactá al cliente dentro de esta franja y registrá el resultado.</p>') +
          (pending ? '<div class="protocol-actions">' + (task.channel === "call" ?
            '<a href="tel:+' + String(lead.customer_phone).replace(/\D/g, "") + '">Llamar ahora</a><button type="button" data-contact-task="' + task.id + '" data-contact-outcome="no_answer">No respondió</button><button class="success" type="button" data-contact-task="' + task.id + '" data-contact-outcome="answered">Respondió</button>' :
            '<button class="whatsapp secondary" type="button" data-open-whatsapp="' + encodeURIComponent(body) + '">Abrir WhatsApp</button><button class="whatsapp" type="button" data-contact-task="' + task.id + '" data-contact-outcome="sent">Marcar enviado</button>') + '</div>' :
            '<div class="protocol-result">' + escapeHtml(task.status === "cancelled" ? "Cancelada" : task.outcome === "answered" ? "Respondió" : task.outcome === "no_answer" ? "No respondió" : task.outcome === "sent" ? "Enviado" : "Completada") + (task.completed_at ? " · " + escapeHtml(formatDate(task.completed_at)) + (insideWindow ? " · Cumplida en horario" : " · Fuera de franja") : "") + '</div>') +
          '</div></article>';
      }).join("") + '</div>';
  }

  async function loadCustomerHistory(lead) {
    var container = document.getElementById("crmCustomerHistory");
    if (!lead.customer_id) { container.innerHTML = '<div class="agenda-empty">Todavía no hay una ficha unificada del cliente.</div>'; return; }
    var result = await supabaseClient.from("leads").select("id, customer_name, source_channel, model_interest, intent_summary, qualification_status, created_at").eq("customer_id", lead.customer_id).order("created_at", { ascending: false }).limit(20);
    if (result.error) { container.innerHTML = '<div class="agenda-empty">No se pudo cargar el historial de consultas.</div>'; return; }
    container.innerHTML = (result.data || []).map(function (item) {
      return '<article class="customer-history-item"><strong>' + escapeHtml(formatDate(item.created_at, true)) + ' · ' + escapeHtml(item.model_interest || "Modelo a definir") + '</strong><span>' + escapeHtml(item.intent_summary || "Consulta comercial") + '</span><small>' + escapeHtml(item.source_channel === "manual" ? "Carga manual" : item.source_channel === "tiktok" ? "TikTok" : "WhatsApp") + (item.id === lead.id ? " · Consulta actual" : " · Consulta anterior") + '</small></article>';
    }).join("") || '<div class="agenda-empty">No hay consultas anteriores.</div>';
  }

  async function openLead(leadId) {
    var lead = state.leads.find(function (item) { return item.id === leadId; });
    if (!lead) return;
    state.activeLead = lead;
    var crm = crmOf(lead);
    document.getElementById("crmLeadName").textContent = lead.customer_name || "Cliente sin nombre";
    document.getElementById("crmLeadMeta").textContent = "+" + lead.customer_phone + " · ingresó " + formatDate(lead.created_at);
    document.getElementById("crmLeadStage").textContent = stageLabel(crm.status);
    document.getElementById("crmClientSummary").innerHTML = '<strong>' + escapeHtml(lead.intent_summary || "Sin resumen comercial") + '</strong><p>' + escapeHtml(crm.status_reason || "") + '</p><div class="tags"><span>' + escapeHtml(lead.model_interest || "Modelo a definir") + '</span><span>' + escapeHtml(lead.qualification_status === "qualified" ? "Calificado por IA" : "Seguimiento") + '</span><span>' + escapeHtml(crm.priority === "high" ? "Prioridad alta" : crm.priority === "low" ? "Prioridad baja" : "Prioridad normal") + '</span></div>';
    document.getElementById("crmCallLink").href = "tel:+" + String(lead.customer_phone).replace(/\D/g, "");
    document.getElementById("crmStatusInput").innerHTML = (crm.status === "venta" ? STAGES.filter(function (stage) { return stage.value === "venta"; }) : STAGES.filter(function (stage) { return stage.value !== "venta"; })).map(function (stage) { return '<option value="' + stage.value + '"' + (stage.value === crm.status ? ' selected' : '') + '>' + escapeHtml(stage.label) + '</option>'; }).join("");
    document.getElementById("crmPriorityInput").value = crm.priority || "normal";
    document.getElementById("crmNoteInput").value = "";
    var nextContactParts = dateParts(crm.next_contact_at);
    document.getElementById("crmNextContactDateInput").value = nextContactParts.date;
    document.getElementById("crmNextContactTimeInput").value = nextContactParts.time;
    document.getElementById("crmNextContactNoteInput").value = crm.next_contact_note || "";
    var interviewParts = dateParts(crm.interview_at);
    document.getElementById("crmInterviewDateInput").value = interviewParts.date;
    document.getElementById("crmInterviewTimeInput").value = interviewParts.time;
    document.getElementById("crmInterviewLocationInput").value = crm.interview_location || "";
    document.getElementById("crmDepositInput").value = crm.deposit_amount || "";
    document.getElementById("crmFormError").textContent = "";
    var saleButton = document.getElementById("crmSaleButton");
    var managementButton = document.getElementById("crmSaveManagement");
    document.getElementById("crmStatusInput").disabled = crm.status === "venta";
    managementButton.disabled = crm.status === "venta";
    managementButton.textContent = crm.status === "venta" ? "Venta confirmada" : "Guardar gestión";
    saleButton.disabled = crm.sale_confirmation_status === "pending" || crm.sale_confirmation_status === "confirmed";
    saleButton.textContent = crm.sale_confirmation_status === "pending" ? "Datero pendiente" : crm.sale_confirmation_status === "confirmed" ? "Venta confirmada" : "Enviar datero";
    renderAppraisalSummary(lead.id);
    renderNextCard(lead);
    renderProtocol(lead);
    updateConditionalFields();
    document.querySelectorAll("[data-crm-tab]").forEach(function (button) { button.classList.toggle("active", button.dataset.crmTab === "manage"); });
    document.querySelectorAll("[data-crm-panel]").forEach(function (panel) { panel.classList.toggle("active", panel.dataset.crmPanel === "manage"); });
    if (!leadDialog.open) leadDialog.showModal();
    await Promise.all([loadTimeline(lead.id), loadChat(lead.id), loadCustomerHistory(lead)]);
  }

  async function saveManagement() {
    if (!state.activeLead) return;
    var button = document.getElementById("crmSaveManagement");
    var status = document.getElementById("crmStatusInput").value;
    var note = document.getElementById("crmNoteInput").value.trim();
    var deposit = document.getElementById("crmDepositInput").value;
    var errorBox = document.getElementById("crmFormError");
    var terminalStatus = ["desistir", "invalido"].includes(status);
    errorBox.textContent = "";
    var nextContact = null;
    var interview = null;
    try {
      if (!terminalStatus) {
        nextContact = parseArgentineDateTime(document.getElementById("crmNextContactDateInput").value, document.getElementById("crmNextContactTimeInput").value, "próximo contacto");
      }
      if (status === "entrevista") {
        interview = parseArgentineDateTime(document.getElementById("crmInterviewDateInput").value, document.getElementById("crmInterviewTimeInput").value, "la entrevista");
      }
    } catch (error) {
      errorBox.textContent = error.message;
      return;
    }
    if (status === "no_contesta" && !nextContact) {
      var automatedTask = nextPendingTask(state.activeLead.id);
      nextContact = automatedTask ? automatedTask.due_start : null;
    }
    if (status === "no_contesta" && !nextContact) { errorBox.textContent = "Programá el próximo intento de contacto."; return; }
    if (nextContact && new Date(nextContact).getTime() <= Date.now()) { errorBox.textContent = "El próximo contacto debe quedar programado a futuro."; return; }
    if (["nuevo", "no_contesta", "en_proceso", "cierre", "sena"].includes(status) && !nextContact) { errorBox.textContent = "Programá la próxima acción antes de guardar."; return; }
    if (nextContact && document.getElementById("crmNextContactNoteInput").value.trim().length < 3) { errorBox.textContent = "Indicá el motivo del próximo contacto."; return; }
    if (status === "entrevista" && !interview) { errorBox.textContent = "Indicá la fecha y hora de la entrevista."; return; }
    if (status === "sena" && (!deposit || Number(deposit) <= 0)) { errorBox.textContent = "Indicá el importe de la seña."; return; }
    if (["invalido", "desistir"].includes(status) && note.length < 3) { errorBox.textContent = "Explicá brevemente el motivo."; return; }
    setBusy(button, true, "Guardando…");
    var result = await supabaseClient.rpc("record_lead_follow_up", {
      p_lead_id: state.activeLead.id,
      p_status: status,
      p_note: note,
      p_next_contact_at: nextContact,
      p_next_contact_note: terminalStatus ? "" : document.getElementById("crmNextContactNoteInput").value.trim(),
      p_contact_outcome: note,
      p_interview_at: interview,
      p_interview_location: document.getElementById("crmInterviewLocationInput").value.trim(),
      p_deposit_amount: deposit ? Number(deposit) : null,
      p_priority: document.getElementById("crmPriorityInput").value
    });
    if (result.error) { errorBox.textContent = result.error.message; setBusy(button, false); return; }
    await loadLeads(true);
    leadDialog.close();
    setBusy(button, false);
  }

  async function saveComment() {
    if (!state.activeLead) return;
    var comment = document.getElementById("crmCommentInput").value.trim();
    var errorBox = document.getElementById("crmCommentError");
    var button = document.getElementById("crmCommentSave");
    errorBox.textContent = "";
    if (comment.length < 2) { errorBox.textContent = "Escribí un comentario antes de guardar."; return; }
    setBusy(button, true, "Guardando…");
    var result = await supabaseClient.rpc("add_lead_comment", { p_lead_id: state.activeLead.id, p_comment: comment });
    if (result.error) { errorBox.textContent = result.error.message; setBusy(button, false); return; }
    document.getElementById("crmCommentInput").value = "";
    commentDialog.close();
    await loadTimeline(state.activeLead.id);
    await loadLeads(true);
    setBusy(button, false);
  }

  async function requestSale() {
    if (!state.activeLead) return;
    var vehicle = document.getElementById("crmSaleVehicle").value.trim();
    var amount = document.getElementById("crmSaleAmount").value;
    var errorBox = document.getElementById("crmSaleError");
    var button = document.getElementById("crmSaleSubmit");
    errorBox.textContent = "";
    if (vehicle.length < 2) { errorBox.textContent = "Indicá el vehículo vendido."; return; }
    setBusy(button, true, "Enviando…");
    var result = await supabaseClient.rpc("request_lead_sale_v2", { p_lead_id: state.activeLead.id, p_vehicle: vehicle, p_amount: amount ? Number(amount) : null, p_notes: document.getElementById("crmSaleNotes").value.trim(), p_quote_id: document.getElementById("crmSaleQuote").value || null });
    if (result.error) { errorBox.textContent = result.error.message; setBusy(button, false); return; }
    saleDialog.close();
    await loadLeads(true);
    await openLead(state.activeLead.id);
    setBusy(button, false);
  }

  async function completeContactTask(taskId, outcome) {
    if (!state.activeLead) return;
    var result = await supabaseClient.rpc("complete_contact_task_with_follow_up", { p_task_id: taskId, p_outcome: outcome, p_note: "", p_next_contact_at: null, p_next_contact_note: "" });
    if (result.error) {
      document.getElementById("crmFormError").textContent = result.error.message;
      return;
    }
    await loadLeads(true);
    leadDialog.close();
  }

  function suggestedFollowUp() {
    var candidate = new Date();
    candidate.setDate(candidate.getDate() + 1);
    while ([0, 6].includes(candidate.getDay())) candidate.setDate(candidate.getDate() + 1);
    candidate.setHours(10, 0, 0, 0);
    return dateParts(candidate.toISOString());
  }

  function openAnsweredFollowUp(taskId) {
    pendingAnsweredTaskId = taskId;
    var suggested = suggestedFollowUp();
    document.getElementById("crmAnsweredDate").value = suggested.date;
    document.getElementById("crmAnsweredTime").value = suggested.time;
    document.getElementById("crmAnsweredNote").value = "";
    document.getElementById("crmAnsweredError").textContent = "";
    answeredDialog.showModal();
  }

  async function saveAnsweredFollowUp() {
    if (!pendingAnsweredTaskId) return;
    var errorBox = document.getElementById("crmAnsweredError");
    var button = document.getElementById("crmAnsweredSave");
    var note = document.getElementById("crmAnsweredNote").value.trim();
    var nextContact;
    errorBox.textContent = "";
    try {
      nextContact = parseArgentineDateTime(document.getElementById("crmAnsweredDate").value, document.getElementById("crmAnsweredTime").value, "próximo contacto");
    } catch (error) {
      errorBox.textContent = error.message;
      return;
    }
    if (!nextContact || new Date(nextContact).getTime() <= Date.now()) { errorBox.textContent = "Elegí una fecha y hora futura."; return; }
    if (note.length < 3) { errorBox.textContent = "Indicá brevemente cuál es el próximo paso."; return; }
    setBusy(button, true, "Guardando…");
    var result = await supabaseClient.rpc("complete_contact_task_with_follow_up", {
      p_task_id: pendingAnsweredTaskId,
      p_outcome: "answered",
      p_note: "El cliente respondió",
      p_next_contact_at: nextContact,
      p_next_contact_note: note
    });
    if (result.error) { errorBox.textContent = result.error.message; setBusy(button, false); return; }
    pendingAnsweredTaskId = null;
    answeredDialog.close();
    await loadLeads(true);
    leadDialog.close();
    setBusy(button, false);
  }

  document.addEventListener("click", function (event) {
    var nav = event.target.closest("[data-crm-view]");
    if (nav) { openView(nav.dataset.crmView); return; }
    var card = event.target.closest("[data-crm-lead-id]");
    if (card) { openLead(card.dataset.crmLeadId); return; }
    var tab = event.target.closest("[data-crm-tab]");
    if (tab) {
      document.querySelectorAll("[data-crm-tab]").forEach(function (button) { button.classList.toggle("active", button === tab); });
      document.querySelectorAll("[data-crm-panel]").forEach(function (panel) { panel.classList.toggle("active", panel.dataset.crmPanel === tab.dataset.crmTab); });
      return;
    }
    var contactTask = event.target.closest("[data-contact-task]");
    if (contactTask) {
      if (contactTask.dataset.contactOutcome === "answered") openAnsweredFollowUp(contactTask.dataset.contactTask);
      else completeContactTask(contactTask.dataset.contactTask, contactTask.dataset.contactOutcome);
      return;
    }
    var openWhatsapp = event.target.closest("[data-open-whatsapp]");
    if (openWhatsapp && state.activeLead) {
      var phone = String(state.activeLead.customer_phone || "").replace(/\D/g, "");
      window.open("https://wa.me/" + phone + "?text=" + openWhatsapp.dataset.openWhatsapp, "_blank", "noopener");
    }
  });

  document.getElementById("crmStatusInput").addEventListener("change", updateConditionalFields);
  document.getElementById("crmSaveManagement").addEventListener("click", saveManagement);
  document.getElementById("crmCommentButton").addEventListener("click", function () { document.getElementById("crmCommentError").textContent = ""; commentDialog.showModal(); });
  document.getElementById("crmCommentSave").addEventListener("click", saveComment);
  document.getElementById("crmAppraisalButton").addEventListener("click", function () {
    if (!state.activeLead) return;
    var form = document.getElementById("crmAppraisalForm");
    var appraisal = appraisalForLead(state.activeLead.id) || {};
    form.elements.brand.value = appraisal.brand || "";
    form.elements.model.value = appraisal.model || state.activeLead.model_interest || "";
    form.elements.version.value = appraisal.version || "";
    form.elements.vehicleYear.value = appraisal.vehicle_year || "";
    form.elements.mileageKm.value = appraisal.mileage_km || "";
    form.elements.condition.value = appraisal.condition || "good";
    form.elements.notes.value = appraisal.notes || "";
    document.getElementById("crmAppraisalError").textContent = "";
    appraisalDialog.showModal();
  });
  document.querySelector("#crmAppraisalDialog .crm-dialog-close").addEventListener("click", function () { appraisalDialog.close(); });
  document.getElementById("crmAppraisalForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!state.activeLead) return;
    var form = event.currentTarget;
    var errorBox = document.getElementById("crmAppraisalError");
    var button = document.getElementById("crmAppraisalSubmit");
    errorBox.textContent = "";
    setBusy(button, true, "Guardando…");
    var result = await supabaseClient.rpc("save_lead_vehicle_appraisal", {
      p_lead_id: state.activeLead.id,
      p_brand: form.elements.brand.value.trim(),
      p_model: form.elements.model.value.trim(),
      p_version: form.elements.version.value.trim(),
      p_vehicle_year: Number(form.elements.vehicleYear.value),
      p_mileage_km: Number(form.elements.mileageKm.value),
      p_condition: form.elements.condition.value,
      p_notes: form.elements.notes.value.trim()
    });
    if (result.error) {
      errorBox.textContent = result.error.message;
      setBusy(button, false);
      return;
    }
    var appraisalId = result.data;
    var estimate = await supabaseClient.functions.invoke("vehicle-market-reference", { body: { appraisalId: appraisalId } });
    await loadLeads(true);
    renderAppraisalSummary(state.activeLead.id);
    appraisalDialog.close();
    setBusy(button, false);
    if (estimate.error) {
      document.getElementById("crmFormError").textContent = "La solicitud quedó guardada, pero Mercado Libre todavía no está conectado o no respondió.";
    } else if (estimate.data && !estimate.data.sufficient) {
      document.getElementById("crmFormError").textContent = estimate.data.message;
    }
  });
  document.getElementById("crmAnsweredSave").addEventListener("click", saveAnsweredFollowUp);
  document.getElementById("crmAnsweredDate").addEventListener("input", function () { maskDateInput(this); });
  document.getElementById("crmSaleButton").addEventListener("click", async function () {
    if (this.disabled || !state.activeLead) return;
    document.getElementById("crmSaleVehicle").value = crmOf(state.activeLead).vehicle_sold || state.activeLead.model_interest || "";
    document.getElementById("crmSaleAmount").value = "";
    document.getElementById("crmSaleNotes").value = "";
    var quotes = await supabaseClient.from("sales_quotes").select("id, quote_code, offer_type, vehicle_version, sale_price, final_advance_amount, commercial_snapshot").eq("lead_id", state.activeLead.id).eq("status", "issued").order("issued_at", { ascending: false });
    state.saleQuotes = quotes.data || [];
    document.getElementById("crmSaleQuote").innerHTML = '<option value="">Sin presupuesto asociado</option>' + state.saleQuotes.map(function (quote) { var snapshot = quote.commercial_snapshot || {}; return '<option value="' + quote.id + '">' + escapeHtml(quote.quote_code + " · " + (snapshot.model || "") + " " + quote.vehicle_version) + '</option>'; }).join("");
    document.getElementById("crmSaleVehicle").readOnly = false;
    document.getElementById("crmSaleAmount").readOnly = false;
    document.getElementById("crmSaleError").textContent = "";
    saleDialog.showModal();
  });
  document.getElementById("crmSaleSubmit").addEventListener("click", requestSale);
  document.getElementById("crmSaleQuote").addEventListener("change", function () {
    var quote = state.saleQuotes.find(function (item) { return item.id === this.value; }, this);
    var isPlan = quote && quote.offer_type === "savings_plan";
    var snapshot = quote && quote.commercial_snapshot || {};
    if (isPlan) {
      document.getElementById("crmSaleVehicle").value = [snapshot.brand, snapshot.model, quote.vehicle_version].filter(Boolean).join(" ");
      document.getElementById("crmSaleAmount").value = quote.sale_price;
    }
    document.getElementById("crmSaleVehicle").readOnly = Boolean(isPlan);
    document.getElementById("crmSaleAmount").readOnly = Boolean(isPlan);
    document.getElementById("crmSaleQuoteHelp").textContent = isPlan ? "Datos bloqueados: la venta toma el vehículo y el valor final del plan seleccionado, sin descontar bonificaciones." : "Si elegís un presupuesto de plan, el vehículo y el importe se toman de esa propuesta.";
  });
  document.getElementById("crmRefreshButton").addEventListener("click", function () { var button = this; setBusy(button, true, "Actualizando…"); loadLeads(false).finally(function () { setBusy(button, false); }); });
  document.getElementById("crmAgendaSearch").addEventListener("input", function () { state.searchAgenda = this.value; renderAgenda(); });
  document.getElementById("crmPipelineSearch").addEventListener("input", function () { state.searchPipeline = this.value; renderPipeline(); });
  document.getElementById("crmRankingMonth").addEventListener("change", loadRanking);
  ["crmNextContactDateInput", "crmInterviewDateInput"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", function () { maskDateInput(this); });
  });

  var now = new Date();
  document.getElementById("crmRankingMonth").value = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  window.grupoSurCRM = { open: openView, refresh: loadLeads, getActiveLead: function () { return state.activeLead; } };
}());
