(function () {
  "use strict";

  var APPRAISALS_ENABLED = false;

  var supabaseClient = window.grupoSurSupabaseClient;
  var agendaModel = window.grupoSurAgendaModel;
  var transitionModel = window.grupoSurCRMTransitions;
  if (!supabaseClient || !agendaModel || !transitionModel) return;

  var STAGES = [
    { value: "nuevo", label: "Nuevo" },
    { value: "no_contesta", label: "Sin contacto" },
    { value: "contacto_futuro", label: "Pide contacto futuro" },
    { value: "en_proceso", label: "En gestión" },
    { value: "invalido", label: "Inválido / Erróneo" },
    { value: "entrevista", label: "Entrevista" },
    { value: "cierre", label: "Cierre" },
    { value: "sena", label: "Seña" },
    { value: "venta", label: "Venta" },
    { value: "desistir", label: "Desistir" }
  ];
  var CLOSED_STAGES = ["venta", "desistir", "invalido"];
  var state = { leads: [], tasks: [], taskSchema: "unknown", taskLoadError: null, appraisals: [], commercialCatalog: [], activeLead: null, view: "agenda", searchAgenda: "", searchPipeline: "", portfolioStatus: "all", portfolioView: "all", pendingProtocolAnsweredTaskId: null, loading: false };
  var leadDialog = document.getElementById("crmLeadDialog");
  var commentDialog = document.getElementById("crmCommentDialog");
  var commercialSelectionDialog = document.getElementById("crmCommercialSelectionDialog");
  var commercialSelectionForm = document.getElementById("crmCommercialSelectionForm");
  var commercialBrandSelect = document.getElementById("crmCommercialBrand");
  var commercialModelSelect = document.getElementById("crmCommercialModel");
  var commercialVersionSelect = document.getElementById("crmCommercialVersion");
  var commercialPlanSelect = document.getElementById("crmCommercialPlan");
  var answeredDialog = document.getElementById("crmAnsweredDialog");
  var appraisalDialog = document.getElementById("crmAppraisalDialog");
  var nameDialog = document.getElementById("crmNameDialog");
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

  function originLabel(lead) {
    var attribution = attributionOf(lead);
    if (lead.source_channel === "manual") return "Carga manual" + (lead.source_detail ? " · " + lead.source_detail : "");
    if (lead.source_channel === "tiktok") return "TikTok";
    if (lead.source_detail === "meta_ads") return "Meta Ads" + (attribution && (attribution.campaign_name || attribution.ad_name) ? " · " + (attribution.campaign_name || attribution.ad_name) : "");
    return lead.source_detail || lead.source_channel || "Sin origen";
  }

  function daysSince(since) {
    if (!since) return "Sin registro";
    return Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 86400000)) + " días";
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

  function appraisalState(appraisal) {
    if (appraisal.status === "confirmed") return { label: "Tasación confirmada", className: "confirmed" };
    if (appraisal.estimate_source === "mercadolibre_request_failed") return { label: "Consulta fallida", className: "error" };
    if (appraisal.estimate_source === "mercadolibre_insufficient_sample") return { label: "Comparables insuficientes", className: "warning" };
    if (appraisal.suggested_value != null) return { label: "Pendiente de confirmación", className: "" };
    return { label: "Consulta pendiente", className: "" };
  }

  function renderAppraisalSummary(leadId) {
    var appraisal = appraisalForLead(leadId);
    var target = document.getElementById("crmAppraisalSummary");
    if (!APPRAISALS_ENABLED) { target.hidden = true; target.innerHTML = ""; return; }
    target.hidden = !appraisal;
    if (!appraisal) { target.innerHTML = ""; return; }
    var displayState = appraisalState(appraisal);
    var valueText = appraisal.status === "confirmed"
      ? "Valor confirmado: " + marketMoney(appraisal.confirmed_value, appraisal.confirmed_currency || appraisal.market_currency)
      : appraisal.estimated_min != null && appraisal.estimated_max != null
        ? "Mercado publicado: " + marketMoney(appraisal.estimated_min, appraisal.market_currency) + " a " + marketMoney(appraisal.estimated_max, appraisal.market_currency)
        : appraisal.estimate_source === "mercadolibre_request_failed"
          ? appraisal.estimate_basis || "La consulta a Mercado Libre no pudo completarse."
          : appraisal.estimate_source === "mercadolibre_insufficient_sample"
            ? "No alcanzó el mínimo de 6 publicaciones comparables válidas."
            : "La consulta de mercado todavía no se completó.";
    var suggestedText = appraisal.suggested_value != null ? " · Toma sugerida (-15%): " + marketMoney(appraisal.suggested_value, appraisal.market_currency) : "";
    target.innerHTML = '<div><strong>' + escapeHtml([appraisal.brand, appraisal.model, appraisal.version, appraisal.vehicle_year].filter(Boolean).join(" · ")) + '</strong><span>' + escapeHtml(new Intl.NumberFormat("es-AR").format(appraisal.mileage_km) + " km · " + conditionLabel(appraisal.condition) + " · " + valueText + suggestedText) + '</span>' + (appraisal.market_checked_at ? '<small>' + escapeHtml((appraisal.reference_count || 0) + " comparables válidos · consulta " + formatDate(appraisal.market_checked_at)) + '</small>' : '') + '</div><b class="' + displayState.className + '">' + escapeHtml(displayState.label) + '</b>';
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
    var sequenceTasks = tasksForLead(task.lead_id);
    var total = task.channel === "call"
      ? Math.max.apply(null, sequenceTasks.filter(function (item) { return item.channel === "call"; }).map(function (item) { return Number(item.call_attempt) || 0; }))
      : Math.max.apply(null, sequenceTasks.filter(function (item) { return item.channel === "whatsapp"; }).map(function (item) { return Number(item.message_step) || 0; }));
    return task.channel === "call"
      ? "Llamada " + task.call_attempt + " de " + total
      : "WhatsApp " + task.message_step + " de " + total;
  }

  function protocolProgress(leadId) {
    var tasks = tasksForLead(leadId);
    if (!tasks.length) return null;
    var completed = tasks.filter(function (task) { return ["completed", "skipped"].includes(task.status); }).length;
    return { completed: completed, total: tasks.length, pending: nextPendingTask(leadId) };
  }

  function manualNextAction(lead) {
    return agendaModel.manualAction(lead);
  }

  function protocolRecommendation(leadId) {
    var progress = protocolProgress(leadId);
    var lead = state.leads.find(function (item) { return item.id === leadId; });
    var recommendation = agendaModel.protocolRecommendation(lead, progress && progress.pending);
    return recommendation ? { task: recommendation.task, past: recommendation.past, progress: progress } : null;
  }

  function recommendationLabel(recommendation, nowValue) {
    if (!recommendation) return "";
    var task = recommendation.task;
    var past = new Date(task.due_start).getTime() < Number(nowValue || Date.now());
    var endTime = new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit"
    }).format(new Date(task.due_end));
    var windowLabel = formatDate(task.due_start) + " a " + endTime;
    return (past ? "Recomendado pendiente · " : "Seguimiento recomendado · ") + taskTitle(task) +
      " · " + (past ? "Sugerido desde " + formatDate(task.due_start) + " · Franja original " + windowLabel : "Franja " + windowLabel);
  }

  function agendaBucket(lead, nowValue) {
    return agendaModel.agendaBucket(lead, nowValue);
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

  function setNextContactFromNow(offsetHours) {
    var hours = Number(offsetHours);
    if (![2, 4, 24, 48].includes(hours)) return;
    var parts = dateParts(new Date(Date.now() + hours * 60 * 60 * 1000));
    document.getElementById("crmNextContactDateInput").value = parts.date;
    document.getElementById("crmNextContactTimeInput").value = parts.time;
    document.getElementById("crmFormError").textContent = "";
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
    if (!silent) message.textContent = "Actualizando cartera…";
    try {
      var responses = await Promise.all([
        supabaseClient.from("leads").select(
          "id, customer_id, customer_phone, customer_name, source_channel, source_detail, qualification_status, priority, intent_summary, model_interest, assigned_at, last_message_at, created_at, customer:customers(full_name,primary_phone,email,document_number,cuil), attribution:lead_attributions(platform,source_type,campaign_name,adset_name,ad_name,headline,source_url), crm:lead_crm(status, priority, status_reason, next_contact_at, next_contact_note, next_contact_source, last_contact_at, last_contact_outcome, interview_at, interview_location, deposit_amount, deposit_at, cold_base_at, sale_confirmation_status, sale_requested_at, sale_confirmed_at, vehicle_sold, sale_amount, updated_at)"
        ).order("last_message_at", { ascending: false }).limit(500),
        agendaModel.loadContactTasks(supabaseClient),
        supabaseClient.from("vehicle_appraisals").select("id, lead_id, brand, model, version, vehicle_year, mileage_km, condition, notes, estimated_min, estimated_max, market_median, suggested_value, market_currency, estimate_source, estimate_basis, reference_count, market_references, market_checked_at, status, confirmed_value, confirmed_currency, review_note, updated_at").order("updated_at", { ascending: false }).limit(500)
      ]);
      if (responses[0].error) throw responses[0].error;
      if (responses[2].error) throw responses[2].error;
      state.leads = responses[0].data || [];
      state.tasks = responses[1].tasks || [];
      state.taskSchema = responses[1].schema;
      state.taskLoadError = responses[1].error || null;
      state.appraisals = responses[2].data || [];
      renderAgenda();
      renderPipeline();
      message.textContent = "";
      message.classList.remove("error");
    } catch (error) {
      message.textContent = error.message || "No se pudo cargar Mi Cartera.";
      message.classList.add("error");
    } finally {
      state.loading = false;
    }
  }

  function renderSummary(visibleLeads) {
    var now = Date.now();
    var leads = visibleLeads || state.leads;
    var counts = {
      total: leads.filter(function (lead) { return !CLOSED_STAGES.includes(crmOf(lead).status); }).length,
      management: leads.filter(function (lead) { return crmOf(lead).status === "en_proceso"; }).length,
      overdue: leads.filter(function (lead) { return agendaBucket(lead, now) === "overdue"; }).length,
      deposit: leads.filter(function (lead) { return crmOf(lead).status === "sena"; }).length
    };
    document.getElementById("crmSummary").innerHTML = [
      ["", "Leads en cartera", counts.total, "Oportunidades activas"],
      ["today", "En gestión", counts.management, "Conversaciones activas"],
      ["urgent", "Vencidos", counts.overdue, "Compromisos reales"],
      ["closing", "Con seña", counts.deposit, "Operaciones en curso"]
    ].map(function (item) {
      return '<article class="crm-stat ' + item[0] + '"><span>' + item[1] + '</span><strong>' + item[2] + '</strong><small>' + item[3] + '</small></article>';
    }).join("");
  }

  function relativeFrom(value) {
    if (!value) return "Sin registro";
    var minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
    if (minutes < 60) return "Hace " + Math.max(1, minutes) + " min";
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return "Hace " + hours + " h";
    return "Hace " + Math.floor(hours / 24) + " días";
  }

  function cardActionLabel(status) {
    if (status === "entrevista") return "Ver entrevista";
    if (status === "sena") return "Continuar operación";
    if (status === "cierre") return "Gestionar cierre";
    return "Gestionar";
  }

  function leadCard(lead) {
    var crm = crmOf(lead);
    var manual = manualNextAction(lead);
    var recommendation = protocolRecommendation(lead.id);
    var isOverdue = crm.status !== "nuevo" && manual && new Date(manual.at).getTime() < Date.now() && !CLOSED_STAGES.includes(crm.status);
    var pendingSale = crm.sale_confirmation_status === "pending";
    var progress = protocolProgress(lead.id);
    var actionTitle = crm.status === "nuevo" ? "Primer contacto" : crm.status === "entrevista" ? "Entrevista acordada" : crm.status === "sena" ? "Continuar operación" : "Próximo objetivo";
    var actionDetail = crm.status === "nuevo" ? "Contactar al cliente" : manual && manual.note || recommendation && taskTitle(recommendation.task) || "Definir la próxima acción";
    var timing = crm.status === "nuevo" ? relativeFrom(lead.assigned_at || lead.created_at) : manual ? (isOverdue ? "Vencido · " : "Programado · ") + formatDate(manual.at) : recommendation ? recommendationLabel(recommendation) : "Requiere corrección de agenda";
    var protocol = crm.status === "no_contesta" && progress ? '<small class="portfolio-protocol">Protocolo ' + progress.completed + '/' + progress.total + (progress.pending ? ' · ' + taskTitle(progress.pending) : '') + '</small>' : '';
    return '<article class="crm-lead-card portfolio-card" data-crm-lead-id="' + lead.id + '" data-card-stage="' + escapeHtml(crm.status || "nuevo") + '">' +
      '<div class="portfolio-client"><strong>' + escapeHtml(lead.customer_name || "Cliente sin nombre") + '</strong><small>' + escapeHtml(lead.customer_phone ? "+" + lead.customer_phone : "Sin teléfono") + '</small></div>' +
      '<div class="portfolio-vehicle"><strong>' + escapeHtml(lead.model_interest || "Modelo a definir") + '</strong><small>' + escapeHtml(lead.intent_summary || "Sin detalle comercial") + '</small></div>' +
      '<div class="portfolio-stage"><span class="crm-stage" data-stage="' + escapeHtml(crm.status || "nuevo") + '">' + escapeHtml(stageLabel(crm.status)) + '</span>' + protocol + '</div>' +
      '<div class="portfolio-action"><span>' + escapeHtml(actionTitle) + '</span><strong>' + escapeHtml(actionDetail) + '</strong><small class="' + (isOverdue ? "overdue" : "") + '">' + escapeHtml(timing) + '</small></div>' +
      '<button class="crm-open" type="button">' + escapeHtml(cardActionLabel(crm.status)) + '</button>' +
      (pendingSale ? '<span class="portfolio-sale-pending">Venta por confirmar</span>' : '') +
    '</article>';
  }

  function agendaGroup(key, title, subtitle, items, emptyText) {
    return '<section class="agenda-group portfolio-group ' + key + '"><div class="agenda-group-head"><div><h3>' + escapeHtml(title) + ' <span>' + items.length + '</span></h3><small>' + escapeHtml(subtitle) + '</small></div></div>' +
      (items.length ? '<div class="agenda-cards">' + items.map(leadCard).join("") + '</div>' : '<div class="agenda-empty">' + escapeHtml(emptyText) + '</div>') + '</section>';
  }

  function renderAgenda() {
    var query = normalizeSearch(state.searchAgenda);
    var leads = state.leads.filter(function (lead) { return matchesSearch(lead, query); });
    var sections = agendaModel.portfolioSections(leads, { status: state.portfolioStatus });
    var html = [];
    if (state.portfolioView === "all" || state.portfolioView === "overdue") {
      html.push(agendaGroup("attention", "Requieren atención", "Compromisos vencidos y datos heredados que deben corregirse", sections.overdue.concat(sections.integrity), "No hay compromisos vencidos ni inconsistencias."));
    }
    if (state.portfolioView === "all" || state.portfolioView === "today") {
      html.push(agendaGroup("today", "Hoy", "Acciones programadas para hoy, ordenadas por horario", sections.today, "No hay acciones programadas para hoy."));
      html.push(agendaGroup("new", "Nuevos", "Pendientes de primera gestión, por orden de ingreso", sections.newLead, "No hay Leads nuevos pendientes."));
    }
    if (state.portfolioView === "all" || state.portfolioView === "upcoming") {
      html.push(agendaGroup("upcoming", "Próximos", "Contactos futuros en orden cronológico", sections.upcoming.slice(0, 50), "No hay próximos contactos programados."));
    }
    document.getElementById("crmAgenda").innerHTML = html.join("");
    renderSummary(leads.filter(function (lead) { return agendaModel.matchesPortfolioStatus(lead, state.portfolioStatus); }));
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
    var pageTitle = document.getElementById("pageTitle");
    pageTitle.hidden = viewName === "agenda";
    pageTitle.textContent = viewName === "agenda" ? "" : viewName === "pipeline" ? "Embudo de oportunidades" : viewName === "quotes" ? "Presupuestos comerciales" : viewName === "sales" ? "Mis ventas" : viewName === "recalls" ? "Panel de rellamados" : "Ranking del equipo";
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
    var manual = manualNextAction(lead);
    var recommendation = protocolRecommendation(lead.id);
    var cardTitle = crm.status === "nuevo" ? "Primer contacto" : manual ? "Próxima acción" : recommendation ? "Seguimiento recomendado" : "Próxima acción";
    var cardDate = manual ? formatDate(manual.at, true) : recommendation ? recommendationLabel(recommendation) : "Sin programar";
    var cardNote = manual ? manual.note : recommendation ? taskTitle(recommendation.task) + " · " + recommendation.progress.completed + "/" + recommendation.progress.total : "No indicado";
    var cardSource = manual ? "MANUAL" : recommendation ? "RECOMENDADO" : "Sin origen";
    var attribution = attributionOf(lead);
    var origin = lead.source_channel === "manual" ? "Carga manual · " + (lead.source_detail || "Sin detalle") : lead.source_channel === "tiktok" ? "TikTok" : lead.source_detail === "meta_ads" ? "Meta Ads · " + (attribution && (attribution.ad_name || attribution.headline || attribution.campaign_name) || "Anuncio de WhatsApp") : "WhatsApp orgánico";
    document.getElementById("crmNextCard").innerHTML = '<span>' + escapeHtml(cardTitle) + '</span><strong>' + escapeHtml(cardDate) + '</strong><dl>' +
      '<div><dt>Contexto</dt><dd>' + escapeHtml(cardNote) + '</dd></div>' +
      '<div><dt>Fuente</dt><dd>' + escapeHtml(cardSource) + '</dd></div>' +
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
    if (!result.error && state.activeLead && state.activeLead.id === leadId) {
      var currentStatus = crmOf(state.activeLead).status || "nuevo";
      var entry = (result.data || []).find(function (item) {
        return item.metadata && Object.prototype.hasOwnProperty.call(item.metadata, "previous_status") && item.metadata.status === currentStatus && item.metadata.previous_status !== currentStatus;
      });
      var since = entry && entry.created_at || (currentStatus === "nuevo" ? state.activeLead.assigned_at || state.activeLead.created_at : null);
      var stageAge = document.querySelector('[data-workspace-context="stage-age"] strong');
      if (stageAge) stageAge.textContent = daysSince(since);
    }
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
    var nextSummary = nextTask ? taskTitle(nextTask) + " · " + formatDate(nextTask.due_start, true) : "Proceso completado";
    container.innerHTML = '<details class="crm-protocol-disclosure"><summary><div><span class="protocol-kicker">Proceso de seguimiento</span><strong>' + progress.completed + '/' + progress.total + ' completadas</strong><small>Próxima: ' + escapeHtml(nextSummary) + '</small></div><span class="protocol-toggle-label">Ver tareas</span></summary><div class="protocol-expanded"><div class="protocol-heading"><div><span class="protocol-kicker">Organización comercial</span><strong>Proceso de seguimiento</strong><span>18 llamadas en 9 franjas comerciales consecutivas · 2 por franja · WhatsApp según secuencia vigente</span></div><span class="protocol-progress"><b>' + progress.completed + '</b><small>de ' + progress.total + '</small></span></div>' +
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
            '<div class="protocol-result">' + escapeHtml(task.status === "scheduled" ? "Programada · se habilita al completar el paso anterior" : task.status === "cancelled" ? "Cancelada" : task.outcome === "answered" ? "Respondió" : task.outcome === "no_answer" ? "No respondió" : task.outcome === "sent" ? "Enviado" : "Completada") + (task.completed_at ? " · " + escapeHtml(formatDate(task.completed_at)) + (insideWindow ? " · Cumplida en horario" : " · Fuera de franja") : "") + '</div>') +
          '</div></article>';
      }).join("") + '</div></div></details>';
  }

  function formatTime(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  function localDateTimeValue(value) {
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date(value || Date.now()));
    var map = {};
    parts.forEach(function (part) { if (part.type !== "literal") map[part.type] = part.value; });
    return map.year + "-" + map.month + "-" + map.day + "T" + map.hour + ":" + map.minute;
  }

  function protocolOutcomeLabel(value) {
    return { no_answer: "No contestó", answered: "Contestó", sent: "WhatsApp enviado", invalid: "Dato inválido", no_interest: "Sin interés", requested_no_contact: "Pidió no ser contactado", skipped: "Omitido" }[value] || "Sin resultado";
  }

  function protocolBand(task) {
    return formatTime(task.due_start) + "–" + formatTime(task.due_end);
  }

  function protocolAttemptCard(task, lead, historical) {
    var done = historical || ["completed", "skipped", "cancelled"].includes(task.status);
    var actionable = !historical && task.status === "pending";
    var performed = task.performed_at || task.completed_at;
    var recorded = task.recorded_at || task.completed_at || (done ? task.updated_at : null);
    var message = task.channel === "whatsapp" ? personalizedMessage(task, lead) : "";
    return '<article class="crm-protocol-attempt ' + escapeHtml(task.status) + '"><div class="crm-attempt-state" aria-label="' + (done ? "Realizado" : "Pendiente") + '">' + (done ? "✓" : "○") + '</div><div class="crm-attempt-main"><div class="crm-attempt-heading"><div><span>' + escapeHtml(task.channel === "call" ? "Llamada" : "WhatsApp") + '</span><strong>' + escapeHtml(taskTitle(task)) + '</strong></div><b>' + escapeHtml(protocolBand(task)) + '</b></div>' +
      (done ? '<dl><div><dt>Resultado</dt><dd>' + escapeHtml(task.status === "cancelled" ? "Cancelado" : protocolOutcomeLabel(task.outcome)) + '</dd></div><div><dt>Hora efectiva</dt><dd>' + escapeHtml(formatTime(performed)) + '</dd></div><div><dt>Registrado</dt><dd>' + escapeHtml(recorded ? formatDate(recorded) : "Sin registro") + '</dd></div></dl>' : actionable ? '<label>Hora efectiva / declarada<input type="datetime-local" data-contact-performed-at="' + task.id + '" value="' + localDateTimeValue() + '"></label><div class="crm-attempt-actions">' + (task.channel === "call" ? '<a href="tel:+' + String(lead.customer_phone || "").replace(/\D/g, "") + '">Llamar</a><button type="button" data-contact-task="' + task.id + '" data-contact-outcome="no_answer">No contestó</button><button class="success" type="button" data-protocol-answered data-task-id="' + task.id + '">Contestó</button><button type="button" data-contact-task="' + task.id + '" data-contact-outcome="invalid">Inválido</button>' : '<button type="button" data-open-whatsapp="' + encodeURIComponent(message) + '">Abrir WhatsApp</button><button type="button" data-contact-task="' + task.id + '" data-contact-outcome="sent">Marcar enviado</button>') + '</div>' : '<p class="crm-attempt-waiting">Se habilita al completar el intento anterior.</p>') + '</div></article>';
  }

  function renderNoContactProtocol(lead) {
    var tasks = tasksForLead(lead.id);
    var target = document.getElementById("crmNoContactProtocol");
    if (state.taskLoadError) {
      target.innerHTML = '<div class="crm-protocol-empty warning"><strong>Protocolo temporalmente no disponible</strong><p>Mi Cartera y las herramientas generales siguen disponibles. Reintentá la carga para recuperar el detalle del protocolo.</p></div>';
      return;
    }
    if (!tasks.length) {
      target.innerHTML = '<div class="crm-protocol-empty"><strong>Protocolo pendiente de iniciar</strong><p>El sistema iniciará la secuencia canónica al registrar el primer intento.</p></div>';
      return;
    }
    var activeSeed = tasks.find(function (task) { return task.protocol_day && ["pending", "scheduled"].includes(task.status); });
    var active = activeSeed ? tasks.filter(function (task) { return task.sequence_id === activeSeed.sequence_id; }).sort(agendaModel.protocolTaskOrder) : [];
    var historical = tasks.filter(function (task) { return !activeSeed || task.sequence_id !== activeSeed.sequence_id; })
      .filter(function (task) { return ["completed", "skipped", "cancelled"].includes(task.status); })
      .sort(function (a, b) { return new Date(a.performed_at || a.completed_at || a.due_start) - new Date(b.performed_at || b.completed_at || b.due_start); });
    var malformedPending = tasks.some(function (task) { return !task.protocol_day && ["pending", "scheduled"].includes(task.status); })
      || (active.length > 0 && !agendaModel.isCanonicalV2Protocol(active));
    var compatibility = state.taskSchema === "legacy" ? '<div class="crm-protocol-compatibility"><strong>Modo compatible</strong><span>Se muestran horarios históricos disponibles. La transición atómica y la reconciliación requieren la migración CRM V2 en un entorno de test.</span></div>' : '';
    var reconcile = malformedPending ? '<div class="crm-protocol-reconciliation"><div><strong>Protocolo anterior incompatible</strong><span>Los intentos realizados se preservan. La reconciliación cancela sólo pendientes y crea una secuencia V2 nueva.</span></div>' + (state.taskSchema === "v2" ? '<button type="button" data-reconcile-protocol>Reconciliar protocolo</button>' : '') + '</div>' : '';
    var protocolDays = Array.from(new Set(active.map(function (task) { return task.protocol_day; }))).sort(function (a, b) { return a - b; });
    var days = protocolDays.map(function (day) {
      var dayTasks = active.filter(function (task) { return task.protocol_day === day; });
      if (!dayTasks.length) return "";
      return '<section class="crm-protocol-day"><header><div><span>Día ' + day + '</span><strong>' + escapeHtml(new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(dayTasks[0].due_start))) + '</strong></div><small>Franjas 10–12 · 14–16 · 17–19</small></header><div class="crm-protocol-attempts">' + dayTasks.map(function (task) { return protocolAttemptCard(task, lead, false); }).join("") + '</div></section>';
    }).join("");
    var history = historical.length ? '<details class="crm-protocol-history"><summary>Historial del protocolo anterior (' + historical.length + ')</summary><div class="crm-protocol-attempts">' + historical.map(function (task) { return protocolAttemptCard(task, lead, true); }).join("") + '</div></details>' : '';
    target.innerHTML = compatibility + reconcile + days + history;
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

  function renderWorkspaceContext(lead, crm) {
    var manual = manualNextAction(lead);
    document.getElementById("crmWorkspaceContext").innerHTML = [
      ["Modelo / versión", lead.model_interest || "A definir"],
      ["Origen", originLabel(lead)],
      ["Días en etapa", "Calculando…", "stage-age"],
      ["Última interacción", crm.last_contact_at ? formatDate(crm.last_contact_at) : lead.last_message_at ? formatDate(lead.last_message_at) : "Sin registro"],
      ["Próxima acción", manual ? formatDate(manual.at) + " · " + manual.note : crm.status === "nuevo" ? "Realizar primer contacto" : "Requiere definición"]
    ].map(function (item) {
      return '<div' + (item[2] ? ' data-workspace-context="' + item[2] + '"' : '') + '><span>' + escapeHtml(item[0]) + '</span><strong>' + escapeHtml(item[1]) + '</strong></div>';
    }).join("");
  }

  function transitionButtons(statuses) {
    return statuses.map(function (status) {
      return '<button type="button" data-crm-transition="' + escapeHtml(status) + '">' + escapeHtml(transitionModel.labels[status]) + '</button>';
    }).join("");
  }

  function renderTransitionPicker(fromStatus) {
    var picker = document.getElementById("crmTransitionPicker");
    picker.hidden = ["nuevo", "no_contesta", "contacto_futuro", "venta"].includes(fromStatus);
    document.getElementById("crmTransitionOptions").innerHTML = transitionButtons(transitionModel.allowedFrom(fromStatus));
  }

  function selectWorkspaceTransition(status) {
    if (!state.activeLead) return;
    var current = crmOf(state.activeLead).status || "nuevo";
    var errorBox = current === "nuevo" ? document.getElementById("crmNewError") : document.getElementById("crmFormError");
    errorBox.textContent = "";
    try { transitionModel.assertTransition(current, status); }
    catch (error) { errorBox.textContent = error.message; return; }
    document.getElementById("crmStatusInput").value = status;
    document.querySelectorAll("[data-crm-transition]").forEach(function (button) {
      button.classList.toggle("is-selected", button.dataset.crmTransition === status);
    });
    document.getElementById("crmLeadDialog").classList.add("is-editing-outcome");
    updateConditionalFields();
    var note = document.getElementById("crmNoteInput");
    if (note) note.focus({ preventScroll: true });
  }

  function renderNewExperience() {
    var panel = document.getElementById("crmNewExperience");
    panel.hidden = false;
    document.getElementById("crmNewOutcomes").hidden = true;
    document.getElementById("crmNewOutcomes").innerHTML = "";
    document.getElementById("crmNewError").textContent = "";
  }

  async function registerNewNoAnswer() {
    var errorBox = document.getElementById("crmNewError");
    var pending = nextPendingTask(state.activeLead.id);
    errorBox.textContent = "";
    if (!pending) {
      var restarted = await supabaseClient.rpc("restart_lead_contact_sequence", { p_lead_id: state.activeLead.id });
      if (restarted.error) { errorBox.textContent = restarted.error.message; return; }
      await loadLeads(true);
      pending = nextPendingTask(state.activeLead.id);
    }
    if (!pending) { errorBox.textContent = "No se pudo iniciar el protocolo de contacto."; return; }
    await completeContactTask(pending.id, "no_answer");
  }

  function renderFutureContact(lead, crm) {
    var target = document.getElementById("crmFutureCommitment");
    var overdue = crm.next_contact_at && new Date(crm.next_contact_at).getTime() < Date.now();
    target.classList.toggle("is-overdue", Boolean(overdue));
    target.innerHTML = '<span>' + (overdue ? "Contacto solicitado vencido" : "Contacto solicitado") + '</span><strong>' + escapeHtml(crm.next_contact_at ? formatDate(crm.next_contact_at, true) : "Falta fecha y hora") + '</strong><p>' + escapeHtml(crm.next_contact_note || "Sin contexto adicional") + '</p><small>' + (overdue ? "El intento todavía no fue registrado: no se infiere que el cliente no contestó." : "Registrá el resultado cuando realices el contacto.") + '</small>';
    document.getElementById("crmFutureOutcomes").hidden = true;
    document.getElementById("crmFutureError").textContent = "";
  }

  async function futureContactNoAnswer() {
    if (!state.activeLead) return;
    var errorBox = document.getElementById("crmFutureError");
    errorBox.textContent = "";
    var result = await supabaseClient.rpc("start_no_contact_protocol_from_future", { p_lead_id: state.activeLead.id });
    if (result.error) { errorBox.textContent = result.error.message; return; }
    var leadId = state.activeLead.id;
    await loadLeads(true);
    await openLead(leadId);
  }

  async function openLead(leadId) {
    var lead = state.leads.find(function (item) { return item.id === leadId; });
    if (!lead) return;
    state.activeLead = lead;
    var crm = crmOf(lead);
    var isNew = crm.status === "nuevo";
    var isManagement = crm.status === "en_proceso";
    var isNoContact = crm.status === "no_contesta";
    var isFutureContact = crm.status === "contacto_futuro";
    leadDialog.classList.toggle("crm-v2-workspace", isNew || isManagement || isNoContact || isFutureContact);
    leadDialog.classList.toggle("is-new", isNew);
    leadDialog.classList.toggle("is-management", isManagement);
    leadDialog.classList.toggle("is-no-contact", isNoContact);
    leadDialog.classList.toggle("is-future-contact", isFutureContact);
    leadDialog.classList.remove("is-editing-outcome");
    document.getElementById("crmNewExperience").hidden = !isNew;
    document.getElementById("crmNoContactExperience").hidden = !isNoContact;
    document.getElementById("crmFutureContactExperience").hidden = !isFutureContact;
    renderTransitionPicker(crm.status);
    if (isNew) renderNewExperience();
    if (isNoContact) renderNoContactProtocol(lead);
    if (isFutureContact) renderFutureContact(lead, crm);
    if (window.grupoSurEnGestionExperience) window.grupoSurEnGestionExperience.openLead(lead);
    document.getElementById("crmLeadName").textContent = lead.customer_name || "Cliente sin nombre";
    var phoneDigits = String(lead.customer_phone || "").replace(/\D/g, "");
    document.getElementById("crmLeadMeta").innerHTML = '<a class="crm-lead-phone" href="tel:+' + phoneDigits + '">+' + escapeHtml(lead.customer_phone) + '</a><span>Ingresó ' + escapeHtml(formatDate(lead.created_at)) + '</span>';
    document.getElementById("crmLeadStage").textContent = stageLabel(crm.status);
    renderWorkspaceContext(lead, crm);
    document.getElementById("crmClientSummary").innerHTML = '<strong>' + escapeHtml(lead.intent_summary || "Sin resumen comercial") + '</strong><p>' + escapeHtml(crm.status_reason || "") + '</p><div class="tags"><span>' + escapeHtml(lead.model_interest || "Modelo a definir") + '</span><span>' + escapeHtml(lead.qualification_status === "qualified" ? "Calificado por IA" : "Seguimiento") + '</span><span>' + escapeHtml(crm.priority === "high" ? "Prioridad alta" : crm.priority === "low" ? "Prioridad baja" : "Prioridad normal") + '</span></div>';
    document.getElementById("crmCallLink").href = "tel:+" + String(lead.customer_phone).replace(/\D/g, "");
    document.getElementById("crmWhatsappLink").href = "https://wa.me/" + phoneDigits;
    var managementStages = crm.status === "venta"
      ? STAGES.filter(function (stage) { return stage.value === "venta"; })
      : STAGES.filter(function (stage) { return !["nuevo", "venta"].includes(stage.value); });
    var statusOptions = managementStages.map(function (stage) {
      return '<option value="' + stage.value + '"' + (stage.value === crm.status ? ' selected' : '') + '>' + escapeHtml(stage.label) + '</option>';
    }).join("");
    if (crm.status === "nuevo") {
      statusOptions = '<option value="" selected disabled>Seleccioná el resultado</option>' + statusOptions;
    }
    document.getElementById("crmStatusInput").innerHTML = statusOptions;
    document.getElementById("crmPriorityInput").value = crm.priority || "normal";
    document.getElementById("crmNoteInput").value = "";
    var nextContactParts = dateParts(crm.next_contact_at);
    document.getElementById("crmNextContactDateInput").value = nextContactParts.date;
    document.getElementById("crmNextContactTimeInput").value = nextContactParts.time;
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
    if (!status) { errorBox.textContent = "Seleccioná el resultado de la gestión."; return; }
    try { transitionModel.assertTransition(crmOf(state.activeLead).status || "nuevo", status); }
    catch (error) { errorBox.textContent = error.message; return; }
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
    if (["contacto_futuro", "en_proceso", "cierre", "sena"].includes(status) && !nextContact) { errorBox.textContent = "Programá la próxima acción antes de guardar."; return; }
    if (status === "entrevista" && !interview) { errorBox.textContent = "Indicá la fecha y hora de la entrevista."; return; }
    if (status === "sena" && (!deposit || Number(deposit) <= 0)) { errorBox.textContent = "Indicá el importe de la seña."; return; }
    if (["invalido", "desistir"].includes(status) && note.length < 3) { errorBox.textContent = "Explicá brevemente el motivo."; return; }
    setBusy(button, true, "Guardando…");
    var payload = {
      p_lead_id: state.activeLead.id,
      p_status: status,
      p_note: note,
      p_next_contact_at: nextContact,
      p_next_contact_note: terminalStatus ? "" : note,
      p_contact_outcome: note,
      p_interview_at: interview,
      p_interview_location: document.getElementById("crmInterviewLocationInput").value.trim(),
      p_deposit_amount: deposit ? Number(deposit) : null,
      p_priority: document.getElementById("crmPriorityInput").value
    };
    if (state.pendingProtocolAnsweredTaskId) {
      if (state.taskSchema !== "v2") {
        errorBox.textContent = "Registrar una respuesta con transición desde el protocolo requiere la migración CRM V2 en este entorno.";
        setBusy(button, false);
        return;
      }
      payload.p_task_id = state.pendingProtocolAnsweredTaskId;
      delete payload.p_lead_id;
      var performedInput = document.querySelector('[data-contact-performed-at="' + state.pendingProtocolAnsweredTaskId + '"]');
      payload.p_performed_at = performedInput && performedInput.value ? new Date(performedInput.value + ":00-03:00").toISOString() : new Date().toISOString();
    }
    var result = state.pendingProtocolAnsweredTaskId
      ? await supabaseClient.rpc("record_contact_answer_with_transition", payload)
      : await supabaseClient.rpc("record_lead_follow_up", payload);
    if (result.error) { errorBox.textContent = result.error.message; setBusy(button, false); return; }
    state.pendingProtocolAnsweredTaskId = null;
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

  function openNameEditor() {
    if (!state.activeLead) return;
    document.getElementById("crmNameInput").value = state.activeLead.customer_name || "";
    document.getElementById("crmNameError").textContent = "";
    nameDialog.showModal();
    document.getElementById("crmNameInput").focus();
  }

  async function saveLeadName(event) {
    event.preventDefault();
    if (!state.activeLead) return;
    var leadId = state.activeLead.id;
    var name = document.getElementById("crmNameInput").value.trim().replace(/\s+/g, " ");
    var errorBox = document.getElementById("crmNameError");
    var button = document.getElementById("crmNameSave");
    errorBox.textContent = "";
    if (name.length < 2 || name.length > 120) { errorBox.textContent = "Ingresá un nombre válido."; return; }
    setBusy(button, true, "Guardando…");
    var result = await supabaseClient.rpc("update_assigned_lead_name", { p_lead_id: leadId, p_customer_name: name });
    if (result.error) { errorBox.textContent = result.error.message; setBusy(button, false); return; }
    nameDialog.close();
    await loadLeads(true);
    await openLead(leadId);
    setBusy(button, false);
  }

  async function completeContactTask(taskId, outcome) {
    if (!state.activeLead) return;
    var leadId = state.activeLead.id;
    var protocolWasOpen = !!document.querySelector("#crmProtocol details[open]");
    var performedInput = document.querySelector('[data-contact-performed-at="' + taskId + '"]');
    var performedAt = performedInput && performedInput.value ? new Date(performedInput.value + ":00-03:00").toISOString() : new Date().toISOString();
    var result = state.taskSchema === "v2"
      ? await supabaseClient.rpc("record_contact_task_result", { p_task_id: taskId, p_outcome: outcome, p_note: "", p_performed_at: performedAt })
      : await supabaseClient.rpc("complete_contact_task_with_follow_up", { p_task_id: taskId, p_outcome: outcome, p_note: "", p_next_contact_at: null, p_next_contact_note: "" });
    if (result.error) {
      document.getElementById("crmFormError").textContent = result.error.message;
      return;
    }
    await loadLeads(true);
    await openLead(leadId);
    var protocol = document.querySelector("#crmProtocol details");
    if (protocol && protocolWasOpen) protocol.open = true;
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
    if (note.length < 3) { errorBox.textContent = "Indicá brevemente el resultado o comentario."; return; }
    var leadId = state.activeLead && state.activeLead.id;
    var protocolWasOpen = !!document.querySelector("#crmProtocol details[open]");
    setBusy(button, true, "Guardando…");
    var result = await supabaseClient.rpc("complete_contact_task_with_follow_up", {
      p_task_id: pendingAnsweredTaskId,
      p_outcome: "answered",
      p_note: note,
      p_next_contact_at: nextContact,
      p_next_contact_note: note
    });
    if (result.error) { errorBox.textContent = result.error.message; setBusy(button, false); return; }
    pendingAnsweredTaskId = null;
    answeredDialog.close();
    await loadLeads(true);
    if (leadId) await openLead(leadId);
    var protocol = document.querySelector("#crmProtocol details");
    if (protocol && protocolWasOpen) protocol.open = true;
    setBusy(button, false);
  }

  document.addEventListener("click", function (event) {
    var reconcileProtocol = event.target.closest("[data-reconcile-protocol]");
    if (reconcileProtocol && state.activeLead) {
      reconcileProtocol.disabled = true;
      supabaseClient.rpc("reconcile_lead_contact_protocol", { p_lead_id: state.activeLead.id }).then(async function (result) {
        if (result.error) document.getElementById("crmFormError").textContent = result.error.message;
        else {
          var leadId = state.activeLead.id;
          await loadLeads(true);
          await openLead(leadId);
        }
        reconcileProtocol.disabled = false;
      });
      return;
    }
    var protocolAnswered = event.target.closest("[data-protocol-answered]");
    if (protocolAnswered && state.activeLead) {
      var nextTask = nextPendingTask(state.activeLead.id);
      state.pendingProtocolAnsweredTaskId = protocolAnswered.dataset.taskId || nextTask && nextTask.id || null;
      var picker = document.getElementById("crmTransitionPicker");
      picker.hidden = false;
      document.getElementById("crmTransitionOptions").innerHTML = transitionButtons(["contacto_futuro", "en_proceso", "entrevista", "cierre", "sena", "venta", "desistir"]);
      picker.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    var futureResult = event.target.closest("[data-future-result]");
    if (futureResult) {
      if (futureResult.dataset.futureResult === "no_answer") futureContactNoAnswer();
      else if (futureResult.dataset.futureResult === "rescheduled") selectWorkspaceTransition("contacto_futuro");
      else {
        var futureOutcomes = document.getElementById("crmFutureOutcomes");
        futureOutcomes.innerHTML = '<span>¿Cuál fue el resultado comercial?</span><div>' + transitionButtons(["contacto_futuro", "en_proceso", "entrevista", "cierre", "sena", "venta", "desistir"]) + '</div>';
        futureOutcomes.hidden = false;
      }
      return;
    }
    var contactDecision = event.target.closest("[data-contact-decision]");
    if (contactDecision) {
      var answered = contactDecision.dataset.contactDecision === "answered";
      var outcomes = document.getElementById("crmNewOutcomes");
      outcomes.innerHTML = '<span>' + (answered ? "¿Cuál fue el resultado?" : "Registrá el resultado observado") + '</span><div>' + transitionButtons(answered ? ["contacto_futuro", "en_proceso", "entrevista", "cierre", "sena", "venta", "desistir"] : ["no_contesta", "invalido"]) + '</div>';
      outcomes.hidden = false;
      document.querySelectorAll("[data-contact-decision]").forEach(function (button) { button.classList.toggle("is-selected", button === contactDecision); });
      return;
    }
    var transition = event.target.closest("[data-crm-transition]");
    if (transition) {
      if (transition.dataset.crmTransition === "venta") document.getElementById("crmSaleButton").click();
      else if (crmOf(state.activeLead).status === "nuevo" && transition.dataset.crmTransition === "no_contesta") registerNewNoAnswer();
      else selectWorkspaceTransition(transition.dataset.crmTransition);
      return;
    }
    var nextContactOffset = event.target.closest("[data-next-contact-offset]");
    if (nextContactOffset) {
      setNextContactFromNow(nextContactOffset.dataset.nextContactOffset);
      return;
    }
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
  document.getElementById("crmWorkspaceBack").addEventListener("click", function () { leadDialog.close(); openView("agenda"); });
  document.getElementById("crmSaveManagement").addEventListener("click", saveManagement);
  document.getElementById("crmCommentButton").addEventListener("click", function () { document.getElementById("crmCommentError").textContent = ""; commentDialog.showModal(); });
  document.getElementById("crmCommentSave").addEventListener("click", saveComment);
  document.getElementById("crmEditLeadName").addEventListener("click", openNameEditor);
  document.getElementById("crmNameForm").addEventListener("submit", saveLeadName);
  document.querySelector("#crmNameDialog .crm-dialog-close").addEventListener("click", function () { nameDialog.close(); });
  document.getElementById("crmAppraisalButton").addEventListener("click", function () {
    if (!APPRAISALS_ENABLED) return;
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
    setBusy(button, false);
    if (estimate.error) {
      var failure = null;
      try {
        if (estimate.error.context && typeof estimate.error.context.clone === "function") failure = await estimate.error.context.clone().json();
      } catch (_) { /* The fallback below remains user-safe. */ }
      errorBox.textContent = failure && failure.error || "La tasación quedó guardada, pero la consulta a Mercado Libre falló. Intentá nuevamente.";
      return;
    } else if (estimate.data && !estimate.data.sufficient) {
      errorBox.textContent = estimate.data.message;
      return;
    }
    appraisalDialog.close();
  });

  function fillCommercialSelect(select, items, placeholder, valueFor, labelFor) {
    select.innerHTML = '<option value="">' + escapeHtml(placeholder) + '</option>' + items.map(function (item, index) {
      return '<option value="' + escapeHtml(valueFor(item, index)) + '">' + escapeHtml(labelFor(item)) + '</option>';
    }).join("");
    select.disabled = items.length === 0;
  }

  function selectedCommercialBrand() {
    return state.commercialCatalog.find(function (brand) { return brand.name === commercialBrandSelect.value; }) || null;
  }

  function selectedCommercialModel() {
    var brand = selectedCommercialBrand();
    return brand && brand.models.find(function (model) { return model.id === commercialModelSelect.value; }) || null;
  }

  function selectedCommercialVersion() {
    var model = selectedCommercialModel();
    if (commercialVersionSelect.value === "") return null;
    var index = Number(commercialVersionSelect.value);
    return model && Number.isInteger(index) ? model.versions[index] || null : null;
  }

  function selectedCommercialCampaign() {
    var version = selectedCommercialVersion();
    return version && version.campaigns.find(function (campaign) { return campaign.id === commercialPlanSelect.value; }) || null;
  }

  function autoSelectOnly(select, next) {
    if (select.options.length === 2) {
      select.selectedIndex = 1;
      next();
    }
  }

  function renderCommercialSummary() {
    var brand = selectedCommercialBrand();
    var model = selectedCommercialModel();
    var version = selectedCommercialVersion();
    var campaign = selectedCommercialCampaign();
    var summary = document.getElementById("crmCommercialSelectionSummary");
    var validationError = campaign ? campaign.validationError : "";
    document.getElementById("crmCommercialSelectionError").textContent = validationError;
    document.getElementById("crmCommercialContinue").disabled = !campaign || Boolean(validationError);
    summary.textContent = campaign
      ? [brand.name, model.name, version.label, campaign.label, "$ " + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Number(campaign.finalPrice))].join(" · ")
      : "Seleccioná la unidad y el plan efectivamente vendidos.";
  }

  function renderCommercialPlans() {
    var version = selectedCommercialVersion();
    var campaigns = version ? version.campaigns : [];
    fillCommercialSelect(commercialPlanSelect, campaigns, "Seleccionar plan", function (campaign) { return campaign.id; }, function (campaign) { return campaign.label; });
    renderCommercialSummary();
    autoSelectOnly(commercialPlanSelect, renderCommercialSummary);
  }

  function renderCommercialVersions() {
    var model = selectedCommercialModel();
    var versions = model ? model.versions : [];
    fillCommercialSelect(commercialVersionSelect, versions, "Seleccionar versión", function (_, index) { return String(index); }, function (version) { return version.label; });
    fillCommercialSelect(commercialPlanSelect, [], "Seleccionar plan", function () { return ""; }, function () { return ""; });
    renderCommercialSummary();
    autoSelectOnly(commercialVersionSelect, renderCommercialPlans);
  }

  function renderCommercialModels() {
    var brand = selectedCommercialBrand();
    var models = brand ? brand.models : [];
    fillCommercialSelect(commercialModelSelect, models, "Seleccionar modelo", function (model) { return model.id; }, function (model) { return model.name; });
    fillCommercialSelect(commercialVersionSelect, [], "Seleccionar versión", function () { return ""; }, function () { return ""; });
    fillCommercialSelect(commercialPlanSelect, [], "Seleccionar plan", function () { return ""; }, function () { return ""; });
    renderCommercialSummary();
    autoSelectOnly(commercialModelSelect, renderCommercialVersions);
  }

  function renderCommercialBrands() {
    fillCommercialSelect(commercialBrandSelect, state.commercialCatalog, "Seleccionar marca", function (brand) { return brand.name; }, function (brand) { return brand.name; });
    fillCommercialSelect(commercialModelSelect, [], "Seleccionar modelo", function () { return ""; }, function () { return ""; });
    fillCommercialSelect(commercialVersionSelect, [], "Seleccionar versión", function () { return ""; }, function () { return ""; });
    fillCommercialSelect(commercialPlanSelect, [], "Seleccionar plan", function () { return ""; }, function () { return ""; });
    renderCommercialSummary();
  }

  async function openCommercialSelection(button) {
    if (!state.activeLead || !window.grupoSurCommercialApplication) return;
    setBusy(button, true, "Cargando catálogo…");
    try {
      state.commercialCatalog = await window.grupoSurCommercialApplication.getCatalog({ refresh: true });
      if (!state.commercialCatalog.length) throw new Error("No hay campañas comerciales vigentes para cargar el Datero.");
      renderCommercialBrands();
      leadDialog.close();
      commercialSelectionDialog.showModal();
    } catch (error) {
      document.getElementById("crmFormError").textContent = error.message || "No se pudo cargar el catálogo comercial vigente.";
    } finally {
      setBusy(button, false);
    }
  }

  document.getElementById("crmAnsweredSave").addEventListener("click", saveAnsweredFollowUp);
  document.getElementById("crmAnsweredDate").addEventListener("input", function () { maskDateInput(this); });
  document.getElementById("crmSaleButton").addEventListener("click", function () {
    if (this.disabled || !state.activeLead) return;
    openCommercialSelection(this);
  });
  commercialBrandSelect.addEventListener("change", renderCommercialModels);
  commercialModelSelect.addEventListener("change", renderCommercialVersions);
  commercialVersionSelect.addEventListener("change", renderCommercialPlans);
  commercialPlanSelect.addEventListener("change", renderCommercialSummary);
  document.getElementById("crmCommercialSelectionClose").addEventListener("click", function () {
    commercialSelectionDialog.close();
    if (state.activeLead) leadDialog.showModal();
  });
  commercialSelectionForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var campaign = selectedCommercialCampaign();
    var errorBox = document.getElementById("crmCommercialSelectionError");
    var error = campaign ? window.grupoSurCommercialApplication.validateCampaign(campaign.id) : "Completá Marca, Modelo, Versión y Plan.";
    errorBox.textContent = error;
    if (error) return;
    var lead = state.activeLead;
    commercialSelectionDialog.close();
    window.grupoSurCommercialApplication.open({ origin: "crm_lead", lead: lead, campaignId: campaign.id });
  });
  document.getElementById("crmRefreshButton").addEventListener("click", function () { var button = this; setBusy(button, true, "Actualizando…"); loadLeads(false).finally(function () { setBusy(button, false); }); });
  document.getElementById("crmAgendaSearch").addEventListener("input", function () { state.searchAgenda = this.value; renderAgenda(); });
  document.getElementById("crmPortfolioStatusFilters").addEventListener("click", function (event) {
    var button = event.target.closest("[data-portfolio-status]");
    if (!button) return;
    state.portfolioStatus = button.dataset.portfolioStatus;
    this.querySelectorAll("button").forEach(function (item) {
      var active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    renderAgenda();
  });
  document.getElementById("crmPortfolioViewFilters").addEventListener("click", function (event) {
    var button = event.target.closest("[data-portfolio-view]");
    if (!button) return;
    state.portfolioView = state.portfolioView === button.dataset.portfolioView ? "all" : button.dataset.portfolioView;
    this.querySelectorAll("button").forEach(function (item) {
      var active = item.dataset.portfolioView === state.portfolioView;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    renderAgenda();
  });
  document.getElementById("crmPipelineSearch").addEventListener("input", function () { state.searchPipeline = this.value; renderPipeline(); });
  document.getElementById("crmRankingMonth").addEventListener("change", loadRanking);
  ["crmNextContactDateInput", "crmInterviewDateInput"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", function () { maskDateInput(this); });
  });

  var now = new Date();
  document.getElementById("crmRankingMonth").value = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  window.grupoSurCRM = { open: openView, openLead: openLead, refresh: loadLeads, getActiveLead: function () { return state.activeLead; } };
}());
