(function () {
  "use strict";

  var supabaseClient = window.grupoSurSupabaseClient;
  if (!supabaseClient) return;
  var state = { panels: [], items: [], proposals: [], activeItem: null, loading: false };
  var attemptDialog = document.getElementById("recallAttemptDialog");
  var attemptForm = document.getElementById("recallAttemptForm");
  var leadDialog = document.getElementById("sellerLeadDialog");
  var leadForm = document.getElementById("sellerLeadForm");

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char];
    });
  }

  function setBusy(button, busy, label) {
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? label : button.dataset.label;
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
  }

  function localDateParts(value) {
    var parts = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(value || new Date());
    var map = {}; parts.forEach(function (part) { if (part.type !== "literal") map[part.type] = part.value; });
    return map.day + "/" + map.month + "/" + map.year;
  }

  function maskDate(input) {
    var digits = input.value.replace(/\D/g, "").slice(0, 8);
    input.value = digits.length > 4 ? digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4) : digits.length > 2 ? digits.slice(0, 2) + "/" + digits.slice(2) : digits;
  }

  function parseDate(value, time, label) {
    var match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) throw new Error("Ingresá la fecha de " + label + " con formato dd/mm/aaaa.");
    var day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
    var probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) throw new Error("La fecha de " + label + " no es válida.");
    return new Date(String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0") + "T" + time + ":00-03:00").toISOString();
  }

  function contactedAt(dateValue, band) {
    var time = ({ "10_12": "11:00", "14_16": "15:00", "17_19": "18:00" })[band];
    var value = parseDate(dateValue, time, "la llamada");
    if (localDateParts(new Date()) === dateValue && new Date(value).getTime() > Date.now()) return new Date().toISOString();
    return value;
  }

  function outcomeLabel(value) {
    return ({ no_answer: "No respondió", answered: "Respondió", invalid: "Inválido", not_interested: "Sin interés" })[value] || value || "Sin historia";
  }

  function itemStatusLabel(item) {
    if (item.status === "converted") return "Pasó a agenda";
    if (item.status === "exhausted") return "Finalizado";
    if (item.status === "cancelled") return "Cancelado";
    if (item.status === "working") return "1/2 llamadas";
    return "Pendiente";
  }

  function renderPanel(panel) {
    var items = state.items.filter(function (item) { return item.recall_panel_id === panel.id; }).sort(function (a, b) { return Number(a.panel_position) - Number(b.panel_position); });
    var completed = Number(panel.completed_items || 0);
    var total = Number(panel.total_items || items.length);
    var closed = panel.status === "closed";
    return '<details class="recall-panel ' + (closed ? 'is-closed' : 'is-open') + '" data-recall-panel-id="' + panel.id + '"' + (!closed ? ' open' : '') + '>' +
      '<summary><div><span class="recall-panel-kicker">Panel #' + panel.panel_number + '</span><strong>' + escapeHtml(closed ? "Panel finalizado" : "Panel de rellamados") + '</strong><small>Creado el ' + escapeHtml(formatDate(panel.created_at)) + '</small></div><div class="recall-panel-progress"><strong>' + completed + '/' + total + '</strong><span>' + (closed ? 'Finalizado' : 'Tareas completadas') + '</span></div></summary>' +
      '<div class="recall-table-wrap"><div class="recall-table-head"><span>Lead</span><span>Teléfono</span><span>Modelo</span><span>Historia</span><span>Acción</span></div>' +
      (items.length ? items.map(function (item) {
        var attempts = item.attempts || [];
        var lastAttempt = attempts[0];
        var terminal = ["converted", "exhausted", "cancelled"].includes(item.status);
        return '<article class="recall-list-row ' + (terminal ? 'is-complete' : '') + '" data-recall-item-id="' + item.id + '"><div><strong>' + escapeHtml(item.customer_name) + '</strong><small>#' + item.panel_position + ' · Consulta ' + escapeHtml(formatDate(item.original_inquiry_at)) + '</small></div><a class="recall-phone" href="tel:+' + String(item.customer_phone).replace(/\D/g, "") + '">+' + escapeHtml(item.customer_phone) + '</a><div><strong>' + escapeHtml(item.model_interest || "A definir") + '</strong><small>' + item.attempt_count + '/2 llamadas</small></div><div><strong>' + escapeHtml(lastAttempt ? outcomeLabel(lastAttempt.outcome) : "Sin historia") + '</strong><small>' + (lastAttempt ? escapeHtml(formatDate(lastAttempt.contacted_at)) : "Todavía sin gestión") + '</small></div><div class="recall-row-action"><span class="recall-item-status ' + item.status + '">' + escapeHtml(itemStatusLabel(item)) + '</span>' + (terminal ? '' : '<button class="primary-button compact-button" data-open-recall type="button">Agregar historia</button>') + '</div></article>';
      }).join("") : '<div class="agenda-empty">Este panel no tiene Leads asociados.</div>') + '</div></details>';
  }

  function render() {
    var assigned = state.items.filter(function (item) { return item.status === "assigned"; }).length;
    var working = state.items.filter(function (item) { return item.status === "working"; }).length;
    var attempts = state.items.reduce(function (total, item) { return total + Number(item.attempt_count || 0); }, 0);
    document.getElementById("recallSellerSummary").innerHTML = [
      ["Pendientes", assigned, "Todavía sin llamado"], ["En seguimiento", working, "Con un intento realizado"], ["Llamadas registradas", attempts, "Sobre la base activa"]
    ].map(function (item) { return '<article class="recall-summary-card"><span>' + item[0] + '</span><strong>' + item[1] + '</strong><small>' + item[2] + '</small></article>'; }).join("");

    document.getElementById("recallSellerGrid").innerHTML = state.panels.length ? state.panels.map(renderPanel).join("") : '<div class="agenda-empty">No tenés paneles de rellamados asignados.</div>';

    document.getElementById("sellerProposalsList").innerHTML = state.proposals.length ? state.proposals.map(function (item) {
      var label = item.status === "approved" ? "Aprobado" : item.status === "rejected" ? "Rechazado" : "Pendiente";
      return '<article class="seller-proposal-row"><div><strong>' + escapeHtml(item.customer_name + " · " + (item.model_interest || "Modelo a definir")) + '</strong><small>' + escapeHtml(formatDate(item.created_at) + (item.review_note ? " · " + item.review_note : "")) + '</small></div><span class="proposal-status ' + item.status + '">' + label + '</span></article>';
    }).join("") : '<div class="agenda-empty">Todavía no enviaste Leads para aprobación.</div>';
  }

  async function load() {
    if (state.loading) return Promise.resolve();
    state.loading = true;
    var results = await Promise.all([
      supabaseClient.from("lead_recall_panels").select("id, panel_number, status, total_items, completed_items, created_at, closed_at").order("created_at", { ascending: false }).limit(50),
      supabaseClient.from("lead_recall_items").select("id, recall_panel_id, panel_position, customer_name, customer_phone, model_interest, source_detail, original_inquiry_at, status, attempt_count, available_at, attempts:lead_recall_attempts(outcome,time_band,contacted_at)").not("recall_panel_id", "is", null).order("panel_position", { ascending: true }).limit(5000),
      supabaseClient.from("seller_lead_submissions").select("id, customer_name, customer_phone, model_interest, status, review_note, created_at").order("created_at", { ascending: false }).limit(50)
    ]);
    state.loading = false;
    var failed = results.find(function (result) { return result.error; });
    if (failed) { document.getElementById("recallSellerMessage").textContent = failed.error.message; return; }
    state.panels = results[0].data || [];
    state.items = (results[1].data || []).map(function (item) { item.attempts = (item.attempts || []).sort(function (a, b) { return new Date(b.contacted_at) - new Date(a.contacted_at); }); return item; });
    state.proposals = results[2].data || [];
    render();
  }

  function openAttempt(id) {
    state.activeItem = state.items.find(function (item) { return item.id === id; });
    if (!state.activeItem) return;
    attemptForm.reset();
    attemptForm.elements.contactDate.value = localDateParts(new Date());
    var used = (state.activeItem.attempts || []).map(function (item) { return item.time_band; });
    Array.from(attemptForm.elements.timeBand.options).forEach(function (option) { option.disabled = used.includes(option.value); });
    var available = Array.from(attemptForm.elements.timeBand.options).find(function (option) { return !option.disabled; });
    if (available) attemptForm.elements.timeBand.value = available.value;
    document.getElementById("recallAttemptTitle").textContent = "Llamar a " + state.activeItem.customer_name;
    document.getElementById("recallAttemptMeta").textContent = "+" + state.activeItem.customer_phone + " · " + (state.activeItem.model_interest || "Modelo a definir");
    document.getElementById("recallAttemptError").textContent = "";
    document.getElementById("recallNextContact").hidden = true;
    attemptDialog.showModal();
  }

  async function saveAttempt(event) {
    event.preventDefault();
    if (!state.activeItem) return;
    var f = attemptForm.elements;
    var errorBox = document.getElementById("recallAttemptError");
    var button = document.getElementById("recallAttemptSubmit");
    var contacted, next = null;
    errorBox.textContent = "";
    try {
      contacted = contactedAt(f.contactDate.value, f.timeBand.value);
      if (f.outcome.value === "answered") next = parseDate(f.nextDate.value, f.nextTime.value, "próximo contacto");
    } catch (error) { errorBox.textContent = error.message; return; }
    if (new Date(contacted).getTime() > Date.now() + 300000) { errorBox.textContent = "La llamada no puede quedar registrada a futuro."; return; }
    if (f.outcome.value === "answered" && (!next || new Date(next).getTime() <= Date.now() || f.nextNote.value.trim().length < 3)) { errorBox.textContent = "Programá una fecha futura y explicá el próximo paso."; return; }
    setBusy(button, true, "Guardando…");
    var result = await supabaseClient.rpc("record_recall_attempt", { p_item_id: state.activeItem.id, p_time_band: f.timeBand.value, p_outcome: f.outcome.value, p_contacted_at: contacted, p_note: f.note.value.trim(), p_next_contact_at: next, p_next_contact_note: f.nextNote.value.trim() });
    if (result.error) { errorBox.textContent = result.error.message; setBusy(button, false); return; }
    attemptDialog.close();
    document.getElementById("recallSellerMessage").textContent = result.data.status === "converted" ? "El Lead respondió y ya fue incorporado a tu agenda." : result.data.status === "exhausted" ? "El rellamado quedó cerrado automáticamente." : "Primer llamado registrado. El próximo debe realizarse en otra franja.";
    await load();
    if (result.data.status === "converted" && window.grupoSurCRM) window.grupoSurCRM.refresh(true);
    setBusy(button, false);
  }

  async function submitLead(event) {
    event.preventDefault();
    var f = leadForm.elements;
    var errorBox = document.getElementById("sellerLeadError");
    var button = document.getElementById("sellerLeadSubmit");
    errorBox.textContent = "";
    if (f.customerName.value.trim().length < 2 || f.customerPhone.value.replace(/\D/g, "").length < 6) { errorBox.textContent = "Completá el nombre y un teléfono válido."; return; }
    setBusy(button, true, "Enviando…");
    var result = await supabaseClient.rpc("submit_seller_lead_candidate", { p_customer_name: f.customerName.value.trim(), p_customer_phone: f.customerPhone.value.trim(), p_source_detail: f.sourceDetail.value.trim(), p_model_interest: f.modelInterest.value.trim(), p_summary: f.summary.value.trim() });
    if (result.error) { errorBox.textContent = result.error.message; setBusy(button, false); return; }
    leadDialog.close(); leadForm.reset(); await load(); setBusy(button, false);
  }

  document.addEventListener("click", function (event) {
    var openButton = event.target.closest("[data-open-recall]");
    if (openButton) { openAttempt(openButton.closest("[data-recall-item-id]").dataset.recallItemId); return; }
  });
  document.getElementById("proposeLeadButton").addEventListener("click", function () { leadForm.reset(); document.getElementById("sellerLeadError").textContent = ""; leadDialog.showModal(); });
  document.getElementById("refreshRecallsButton").addEventListener("click", function () { var button = this; setBusy(button, true, "Actualizando…"); load().finally(function () { setBusy(button, false); }); });
  attemptForm.elements.outcome.addEventListener("change", function () { document.getElementById("recallNextContact").hidden = this.value !== "answered"; if (this.value === "answered") { var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); attemptForm.elements.nextDate.value = localDateParts(tomorrow); attemptForm.elements.nextTime.value = "10:00"; } });
  [attemptForm.elements.contactDate, attemptForm.elements.nextDate].forEach(function (input) { input.addEventListener("input", function () { maskDate(this); }); });
  attemptForm.addEventListener("submit", saveAttempt);
  leadForm.addEventListener("submit", submitLead);
  document.addEventListener("grupoSur:recalls-open", load);
}());
