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
  var state = { leads: [], activeLead: null, view: "agenda", searchAgenda: "", searchPipeline: "", loading: false };
  var leadDialog = document.getElementById("crmLeadDialog");
  var commentDialog = document.getElementById("crmCommentDialog");
  var saleDialog = document.getElementById("crmSaleDialog");

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

  function formatDate(value, includeWeekday) {
    if (!value) return "Sin programar";
    return new Intl.DateTimeFormat("es-AR", {
      weekday: includeWeekday ? "short" : undefined,
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
      var result = await supabaseClient.from("leads").select(
        "id, customer_phone, customer_name, source_channel, source_detail, qualification_status, priority, intent_summary, model_interest, assigned_at, last_message_at, created_at, crm:lead_crm(status, priority, status_reason, next_contact_at, next_contact_note, last_contact_at, last_contact_outcome, interview_at, interview_location, deposit_amount, deposit_at, cold_base_at, sale_confirmation_status, sale_requested_at, sale_confirmed_at, vehicle_sold, sale_amount, updated_at)"
      ).order("last_message_at", { ascending: false }).limit(500);
      if (result.error) throw result.error;
      state.leads = result.data || [];
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
    var today = localDateKey(new Date());
    var now = Date.now();
    var counts = {
      overdue: state.leads.filter(function (lead) { var crm = crmOf(lead); return crm.next_contact_at && new Date(crm.next_contact_at).getTime() < now && localDateKey(crm.next_contact_at) !== today && !CLOSED_STAGES.includes(crm.status); }).length,
      today: state.leads.filter(function (lead) { var crm = crmOf(lead); return crm.next_contact_at && localDateKey(crm.next_contact_at) === today && !CLOSED_STAGES.includes(crm.status); }).length,
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
    return '<article class="crm-lead-card" data-crm-lead-id="' + lead.id + '">' +
      '<div class="crm-card-top"><div><strong>' + escapeHtml(lead.customer_name || "Cliente sin nombre") + '</strong><small>+' + escapeHtml(lead.customer_phone) + '</small></div><span class="crm-stage" data-stage="' + escapeHtml(crm.status || "nuevo") + '">' + escapeHtml(stageLabel(crm.status)) + '</span></div>' +
      '<p class="crm-card-summary">' + escapeHtml(lead.intent_summary || lead.model_interest || "Sin resumen comercial") + '</p>' +
      '<div class="crm-card-tags"><span>' + escapeHtml(lead.model_interest || "Modelo a definir") + '</span>' +
        '<span class="' + (crm.priority === "high" ? "high" : "") + '">' + escapeHtml(crm.priority === "high" ? "Prioridad alta" : crm.priority === "low" ? "Prioridad baja" : "Prioridad normal") + '</span>' +
        (pendingSale ? '<span class="high">Venta por confirmar</span>' : '') + '</div>' +
      '<div class="crm-card-footer"><time class="' + (isOverdue ? "overdue" : "") + '">' + escapeHtml(next ? (isOverdue ? "Vencido · " : "Próximo · ") + formatDate(next) : crm.status === "nuevo" ? "Pendiente de primer contacto" : "Sin próxima tarea") + '</time><button class="crm-open" type="button">Gestionar</button></div>' +
    '</article>';
  }

  function agendaGroup(title, items, emptyText) {
    return '<section class="agenda-group"><div class="agenda-group-head"><h3>' + escapeHtml(title) + '</h3><span>' + items.length + '</span></div>' +
      (items.length ? '<div class="agenda-cards">' + items.map(leadCard).join("") + '</div>' : '<div class="agenda-empty">' + escapeHtml(emptyText) + '</div>') + '</section>';
  }

  function renderAgenda() {
    var query = normalizeSearch(state.searchAgenda);
    var leads = state.leads.filter(function (lead) { return matchesSearch(lead, query); });
    var today = localDateKey(new Date());
    var now = Date.now();
    var overdue = leads.filter(function (lead) { var crm = crmOf(lead); return crm.next_contact_at && new Date(crm.next_contact_at).getTime() < now && localDateKey(crm.next_contact_at) !== today && !CLOSED_STAGES.includes(crm.status); }).sort(function (a, b) { return new Date(crmOf(a).next_contact_at) - new Date(crmOf(b).next_contact_at); });
    var forToday = leads.filter(function (lead) { var crm = crmOf(lead); return crm.next_contact_at && localDateKey(crm.next_contact_at) === today && !CLOSED_STAGES.includes(crm.status); }).sort(function (a, b) { return new Date(crmOf(a).next_contact_at) - new Date(crmOf(b).next_contact_at); });
    var newLeads = leads.filter(function (lead) { var crm = crmOf(lead); return crm.status === "nuevo" && !crm.next_contact_at; });
    var next = leads.filter(function (lead) { var crm = crmOf(lead); return crm.next_contact_at && new Date(crm.next_contact_at).getTime() >= now && localDateKey(crm.next_contact_at) !== today && !CLOSED_STAGES.includes(crm.status); }).sort(function (a, b) { return new Date(crmOf(a).next_contact_at) - new Date(crmOf(b).next_contact_at); });
    document.getElementById("crmAgenda").innerHTML =
      agendaGroup("Contactos vencidos", overdue, "No tenés seguimientos vencidos.") +
      agendaGroup("Programados para hoy", forToday, "No hay contactos programados para hoy.") +
      agendaGroup("Nuevos por atender", newLeads, "No tenés leads nuevos pendientes.") +
      agendaGroup("Próximos contactos", next.slice(0, 30), "Todavía no programaste próximos contactos.");
    renderSummary();
  }

  function renderPipeline() {
    var query = normalizeSearch(state.searchPipeline);
    var leads = state.leads.filter(function (lead) { return matchesSearch(lead, query); });
    document.getElementById("crmPipeline").innerHTML = STAGES.map(function (stage) {
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
    document.getElementById("pageTitle").textContent = viewName === "agenda" ? "Mi agenda comercial" : viewName === "pipeline" ? "Embudo de oportunidades" : viewName === "quotes" ? "Presupuestos comerciales" : viewName === "sales" ? "Estado de mis ventas" : "Ranking del equipo";
    document.getElementById("headerKicker").textContent = "CRM Grupo Sur Automotores";
    document.querySelectorAll(".nav-item").forEach(function (item) { item.classList.toggle("is-active", item.dataset.crmView === viewName); });
    if (viewName === "ranking") loadRanking();
    else if (viewName === "quotes" && window.grupoSurSales) window.grupoSurSales.loadQuotes();
    else if (viewName === "sales" && window.grupoSurSales) window.grupoSurSales.loadSales();
    else loadLeads(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderNextCard(lead) {
    var crm = crmOf(lead);
    document.getElementById("crmNextCard").innerHTML = '<span>Próxima acción</span><strong>' + escapeHtml(crm.next_contact_at ? formatDate(crm.next_contact_at, true) : "Sin programar") + '</strong><dl>' +
      '<div><dt>Motivo</dt><dd>' + escapeHtml(crm.next_contact_note || "No indicado") + '</dd></div>' +
      '<div><dt>Último contacto</dt><dd>' + escapeHtml(crm.last_contact_at ? formatDate(crm.last_contact_at) : "Todavía sin contacto") + '</dd></div>' +
      '<div><dt>Origen</dt><dd>' + escapeHtml(lead.source_channel === "manual" ? "Carga manual · " + (lead.source_detail || "Sin detalle") : lead.source_channel === "tiktok" ? "TikTok" : "WhatsApp") + '</dd></div>' +
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
    document.querySelectorAll("[data-status-field]").forEach(function (field) { field.classList.toggle("visible", field.dataset.statusField === status); });
    var help = {
      no_contesta: "Para guardar “No contesta” tenés que programar el próximo intento.",
      entrevista: "La entrevista requiere día, hora y, de ser posible, sucursal.",
      cierre: "Este lead quedará automáticamente en prioridad alta.",
      sena: "Registrá el importe de la seña; la venta seguirá requiriendo confirmación.",
      invalido: "Explicá por qué el teléfono o contacto es inválido.",
      desistir: "Indicá el motivo. El lead pasará a la base fría para remarketing."
    };
    document.getElementById("crmFormHelp").textContent = help[status] || "Guardá un resumen breve y programá el próximo paso cuando corresponda.";
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
    saleButton.textContent = crm.sale_confirmation_status === "pending" ? "Venta pendiente" : crm.sale_confirmation_status === "confirmed" ? "Venta confirmada" : "Solicitar venta";
    renderNextCard(lead);
    updateConditionalFields();
    document.querySelectorAll("[data-crm-tab]").forEach(function (button) { button.classList.toggle("active", button.dataset.crmTab === "manage"); });
    document.querySelectorAll("[data-crm-panel]").forEach(function (panel) { panel.classList.toggle("active", panel.dataset.crmPanel === "manage"); });
    if (!leadDialog.open) leadDialog.showModal();
    await Promise.all([loadTimeline(lead.id), loadChat(lead.id)]);
  }

  async function saveManagement() {
    if (!state.activeLead) return;
    var button = document.getElementById("crmSaveManagement");
    var status = document.getElementById("crmStatusInput").value;
    var note = document.getElementById("crmNoteInput").value.trim();
    var deposit = document.getElementById("crmDepositInput").value;
    var errorBox = document.getElementById("crmFormError");
    errorBox.textContent = "";
    var nextContact;
    var interview;
    try {
      nextContact = parseArgentineDateTime(document.getElementById("crmNextContactDateInput").value, document.getElementById("crmNextContactTimeInput").value, "próximo contacto");
      interview = parseArgentineDateTime(document.getElementById("crmInterviewDateInput").value, document.getElementById("crmInterviewTimeInput").value, "la entrevista");
    } catch (error) {
      errorBox.textContent = error.message;
      return;
    }
    if (status === "no_contesta" && !nextContact) { errorBox.textContent = "Programá el próximo intento de contacto."; return; }
    if (status === "entrevista" && !interview) { errorBox.textContent = "Indicá la fecha y hora de la entrevista."; return; }
    if (status === "sena" && (!deposit || Number(deposit) <= 0)) { errorBox.textContent = "Indicá el importe de la seña."; return; }
    if (["invalido", "desistir"].includes(status) && note.length < 3) { errorBox.textContent = "Explicá brevemente el motivo."; return; }
    setBusy(button, true, "Guardando…");
    var result = await supabaseClient.rpc("record_lead_follow_up", {
      p_lead_id: state.activeLead.id,
      p_status: status,
      p_note: note,
      p_next_contact_at: nextContact,
      p_next_contact_note: document.getElementById("crmNextContactNoteInput").value.trim(),
      p_contact_outcome: note,
      p_interview_at: interview,
      p_interview_location: document.getElementById("crmInterviewLocationInput").value.trim(),
      p_deposit_amount: deposit ? Number(deposit) : null,
      p_priority: document.getElementById("crmPriorityInput").value
    });
    if (result.error) { errorBox.textContent = result.error.message; setBusy(button, false); return; }
    await loadLeads(true);
    await openLead(state.activeLead.id);
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

  document.addEventListener("click", function (event) {
    var nav = event.target.closest("[data-crm-view]");
    if (nav) { openView(nav.dataset.crmView); return; }
    var card = event.target.closest("[data-crm-lead-id]");
    if (card) { openLead(card.dataset.crmLeadId); return; }
    var tab = event.target.closest("[data-crm-tab]");
    if (tab) {
      document.querySelectorAll("[data-crm-tab]").forEach(function (button) { button.classList.toggle("active", button === tab); });
      document.querySelectorAll("[data-crm-panel]").forEach(function (panel) { panel.classList.toggle("active", panel.dataset.crmPanel === tab.dataset.crmTab); });
    }
  });

  document.getElementById("crmStatusInput").addEventListener("change", updateConditionalFields);
  document.getElementById("crmSaveManagement").addEventListener("click", saveManagement);
  document.getElementById("crmCommentButton").addEventListener("click", function () { document.getElementById("crmCommentError").textContent = ""; commentDialog.showModal(); });
  document.getElementById("crmCommentSave").addEventListener("click", saveComment);
  document.getElementById("crmSaleButton").addEventListener("click", async function () {
    if (this.disabled || !state.activeLead) return;
    document.getElementById("crmSaleVehicle").value = crmOf(state.activeLead).vehicle_sold || state.activeLead.model_interest || "";
    document.getElementById("crmSaleAmount").value = "";
    document.getElementById("crmSaleNotes").value = "";
    var quotes = await supabaseClient.from("sales_quotes").select("id, quote_code, vehicle_version, final_advance_amount, commercial_snapshot").eq("lead_id", state.activeLead.id).eq("status", "issued").order("issued_at", { ascending: false });
    document.getElementById("crmSaleQuote").innerHTML = '<option value="">Sin presupuesto asociado</option>' + (quotes.data || []).map(function (quote) { var snapshot = quote.commercial_snapshot || {}; return '<option value="' + quote.id + '">' + escapeHtml(quote.quote_code + " · " + (snapshot.model || "") + " " + quote.vehicle_version) + '</option>'; }).join("");
    document.getElementById("crmSaleError").textContent = "";
    saleDialog.showModal();
  });
  document.getElementById("crmSaleSubmit").addEventListener("click", requestSale);
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
