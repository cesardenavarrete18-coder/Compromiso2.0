(function () {
  "use strict";

  var supabaseClient = window.grupoSurSupabaseClient;
  var state = { profile: null, view: "operations", filter: "all", search: "", cases: [], sellers: {}, leads: {}, quotes: {}, applications: {}, events: {}, documents: {}, clients: [], notifications: [], activeCase: null, activeStage: null, activeClient: null };
  var loginView = document.getElementById("loginView");
  var appView = document.getElementById("appView");
  var loginForm = document.getElementById("loginForm");
  var operationDialog = document.getElementById("operationDialog");
  var reviewDialog = document.getElementById("reviewDialog");
  var groupDialog = document.getElementById("groupDialog");
  var minuteEditDialog = document.getElementById("minuteEditDialog");

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function text(value, fallback) { return value == null || value === "" ? (fallback || "—") : String(value); }
  function money(value) { return value == null || value === "" ? "A confirmar" : "$" + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Number(value)); }
  function formatDate(value, withTime) { if (!value) return "—"; return new Intl.DateTimeFormat("es-AR", withTime ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)); }
  function initials(name) { return String(name || "AV").split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0); }).join("").toUpperCase(); }
  function setBusy(button, busy, label) { if (busy) { button.dataset.label = button.textContent; button.textContent = label || "Procesando…"; button.disabled = true; } else { button.textContent = button.dataset.label || button.textContent; button.disabled = false; } }
  function normalize(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function one(value) { return Array.isArray(value) ? value[0] : value; }
  function caseLabel(value) { return ({ minute_pending: "Minuta pendiente", quality_control: "Scoring CDN", dealer_scoring: "Scoring concesionario", contract_signature: "Firma de contrato", formation_group: "Formación de grupo", grouped: "Agrupado", finalized: "Finalizada", cancelled: "Baja" })[value] || value; }
  function outcomeLabel(value) { return ({ pending: "Pendiente", approved: "Aprobado", observed: "Observado", rejected: "Rechazado", baja: "Baja" })[value] || value; }
  function stageLabel(stage) { return ({ cdn_scoring: "Scoring CDN", dealer_scoring: "Scoring Concesionario", contract: "Firma de contrato", client: "Cartera de clientes", installment: "Control de cuota" })[stage] || String(stage || "Movimiento").replace(/_/g, " "); }
  function documentLabel(type) { return ({ dni_holder_front: "DNI titular · Frente", dni_holder_back: "DNI titular · Dorso", payment_receipt: "Comprobante de pago", dni_coholder_front: "DNI cotitular / cónyuge · Frente", dni_coholder_back: "DNI cotitular / cónyuge · Dorso", signed_contract: "Contrato firmado", supporting_document: "Otra documentación", receipt: "Comprobante", dni: "DNI" })[type] || String(type || "Documento").replace(/_/g, " "); }
  function latestApplication(caseId) {
    var list = state.applications[caseId] || [];
    return list.slice().sort(function (a, b) { return Number(b.revision_number) - Number(a.revision_number); })[0] || null;
  }

  async function getProfile() {
    var auth = await supabaseClient.auth.getUser();
    var user = auth.data && auth.data.user;
    if (!user || auth.error) return null;
    var result = await supabaseClient.from("profiles").select("user_id, full_name, role, active").eq("user_id", user.id).single();
    if (result.error || !result.data || !["admventas", "admin"].includes(result.data.role) || !result.data.active) return null;
    return result.data;
  }

  async function loadData() {
    var casesResult = await supabaseClient.from("sales_cases").select("id, case_code, sale_request_id, lead_id, seller_user_id, quote_id, vehicle, sale_amount, status, cdn_scoring_status, dealer_scoring_status, contract_status, admin_call_requested_at, admin_call_requested_by, cancellation_reason, finalized_at, cancelled_at, created_at, updated_at").order("updated_at", { ascending: false }).limit(1000);
    if (casesResult.error) throw casesResult.error;
    state.cases = casesResult.data || [];
    var caseIds = state.cases.map(function (item) { return item.id; });
    var leadIds = state.cases.map(function (item) { return item.lead_id; });
    var quoteIds = state.cases.map(function (item) { return item.quote_id; }).filter(Boolean);
    var results = await Promise.all([
      supabaseClient.from("profiles").select("user_id, full_name, seller_code").eq("role", "seller"),
      leadIds.length ? supabaseClient.from("leads").select("id, customer_name, customer_phone, model_interest").in("id", leadIds) : Promise.resolve({ data: [], error: null }),
      quoteIds.length ? supabaseClient.from("sales_quotes").select("id, quote_code, offer_type, customer_name, vehicle_version, sale_price, financed_amount, term_months, installment_amount, advance_amount, breakage_amount, patenting_amount, expenses_amount, final_advance_amount, commercial_snapshot, issued_at").in("id", quoteIds) : Promise.resolve({ data: [], error: null }),
      caseIds.length ? supabaseClient.from("commercial_applications").select("*").in("sales_case_id", caseIds).order("revision_number", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      caseIds.length ? supabaseClient.from("sales_case_events").select("id, sales_case_id, actor_user_id, event_type, stage, outcome, comment, created_at").in("sales_case_id", caseIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      caseIds.length ? supabaseClient.from("sales_documents").select("id, sales_case_id, client_id, document_type, file_name, storage_path, created_at").in("sales_case_id", caseIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      supabaseClient.from("clients").select("id, sales_case_id, status, grouped_month, automatic_debit, created_at, updated_at").order("updated_at", { ascending: false }),
      supabaseClient.from("sales_notifications").select("id,sales_case_id,notification_type,title,body,read_at,created_at").eq("recipient_user_id", state.profile.user_id).eq("notification_type", "admin_call_requested").order("created_at", { ascending: false }).limit(100)
    ]);
    var failed = results.find(function (item) { return item.error; });
    if (failed) throw failed.error;
    state.sellers = {}; (results[0].data || []).forEach(function (item) { state.sellers[item.user_id] = item; });
    state.leads = {}; (results[1].data || []).forEach(function (item) { state.leads[item.id] = item; });
    state.quotes = {}; (results[2].data || []).forEach(function (item) { state.quotes[item.id] = item; });
    state.applications = {}; (results[3].data || []).forEach(function (item) { (state.applications[item.sales_case_id] || (state.applications[item.sales_case_id] = [])).push(item); });
    state.events = {}; (results[4].data || []).forEach(function (item) { (state.events[item.sales_case_id] || (state.events[item.sales_case_id] = [])).push(item); });
    state.documents = {}; (results[5].data || []).forEach(function (item) { (state.documents[item.sales_case_id] || (state.documents[item.sales_case_id] = [])).push(item); });
    state.clients = results[6].data || [];
    state.notifications = results[7].data || [];
    renderAll();
    if (window.grupoSurHistoricalClients) await window.grupoSurHistoricalClients.load();
  }

  function renderStats() {
    document.getElementById("minuteStat").textContent = state.cases.filter(function (item) { return item.status === "minute_pending"; }).length;
    document.getElementById("reviewStat").textContent = state.cases.filter(function (item) { return ["quality_control", "dealer_scoring", "contract_signature"].includes(item.status); }).length;
    document.getElementById("observedStat").textContent = state.cases.filter(function (item) { return item.cdn_scoring_status === "observed" || item.dealer_scoring_status === "observed"; }).length;
    document.getElementById("finalizedStat").textContent = state.cases.filter(function (item) { return !!item.finalized_at; }).length;
  }

  function stageChip(label, value) { return '<span class="stage-chip ' + escapeHtml(value) + '">' + escapeHtml(label + " · " + outcomeLabel(value)) + '</span>'; }
  function filteredCases() {
    var q = normalize(state.search);
    return state.cases.filter(function (item) {
      var lead = state.leads[item.lead_id] || {};
      var seller = state.sellers[item.seller_user_id] || {};
      var matchesStatus = state.filter === "all" || item.status === state.filter;
      var haystack = normalize([item.case_code, item.vehicle, lead.customer_name, lead.customer_phone, seller.full_name, seller.seller_code].join(" "));
      return matchesStatus && (!q || haystack.includes(q));
    });
  }
  function renderOperations() {
    var items = filteredCases();
    document.getElementById("operationList").innerHTML = items.length ? items.map(function (item) {
      var lead = state.leads[item.lead_id] || {};
      var seller = state.sellers[item.seller_user_id] || {};
      return '<article class="operation-row" data-case-id="' + item.id + '"><div><strong>' + escapeHtml(item.case_code) + '</strong><span class="status-badge">' + escapeHtml(caseLabel(item.status)) + '</span><small>' + escapeHtml(formatDate(item.updated_at, true)) + '</small></div><div><strong>' + escapeHtml(lead.customer_name || "Minuta pendiente") + '</strong><span>' + escapeHtml(item.vehicle) + '</span><small>' + escapeHtml(seller.full_name || "Vendedor") + ' · ' + escapeHtml(seller.seller_code || "") + '</small></div><div class="stage-line">' + stageChip("CDN", item.cdn_scoring_status) + stageChip("Concesionario", item.dealer_scoring_status) + stageChip("Contrato", item.contract_status) + '</div><button class="button primary" data-open-case type="button">Gestionar</button></article>';
    }).join("") : '<div class="timeline-item">No hay operaciones en esta vista.</div>';
  }

  function clientName(client) { var application = latestApplication(client.sales_case_id); return application ? application.first_name + " " + application.last_name : "Cliente sin minuta"; }
  function renderClients() {
    var q = normalize(document.getElementById("clientSearch").value);
    var clients = state.clients.filter(function (client) { var app = latestApplication(client.sales_case_id) || {}; var salesCase = state.cases.find(function (item) { return item.id === client.sales_case_id; }) || {}; return !q || normalize([clientName(client), app.document_number, app.primary_phone, salesCase.vehicle].join(" ")).includes(q); });
    document.getElementById("clientGrid").innerHTML = clients.length ? clients.map(function (client) {
      var application = latestApplication(client.sales_case_id) || {};
      var salesCase = state.cases.find(function (item) { return item.id === client.sales_case_id; }) || {};
      var groupingAction = client.status === "formation_group" ? '<button class="button primary" data-group-client type="button">Marcar como agrupado</button>' : '';
      return '<article class="client-card" data-client-id="' + client.id + '"><div class="client-card-head"><div><h3>' + escapeHtml(clientName(client)) + '</h3><p>' + escapeHtml(salesCase.case_code || "") + ' · ' + escapeHtml(salesCase.vehicle || application.model_name || "") + '</p></div><span class="status-badge">' + escapeHtml(client.status === "grouped" ? "Agrupado" : "Formación de grupo") + '</span></div><div class="client-meta"><div><span>DNI</span><strong>' + escapeHtml(text(application.document_number)) + '</strong></div><div><span>Teléfono</span><strong>' + escapeHtml(text(application.primary_phone)) + '</strong></div><div><span>Débito automático</span><strong>' + (client.automatic_debit ? "Sí" : "No") + '</strong></div><div><span>Mes de agrupación</span><strong>' + escapeHtml(client.grouped_month ? formatDate(client.grouped_month + "T12:00:00") : "Pendiente") + '</strong></div></div><div class="client-actions"><button class="button secondary" data-open-case-from-client="' + salesCase.id + '" type="button">Ver operación</button><button class="button secondary" data-edit-minute="' + salesCase.id + '" type="button">Editar datos</button>' + groupingAction + '</div></article>';
    }).join("") : '<div class="timeline-item">Todavía no hay clientes en cartera.</div>';
  }

  function renderNotifications() {
    var unread = state.notifications.filter(function (item) { return !item.read_at; });
    document.getElementById("adminNotifications").innerHTML = unread.map(function (item) {
      return '<article class="admin-notification" data-notification-id="' + item.id + '"><div><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(item.body) + '</span><small>' + escapeHtml(formatDate(item.created_at, true)) + '</small></div><div class="notification-actions"><button class="button primary" data-open-notification="' + escapeHtml(item.sales_case_id || "") + '" type="button">Ver operación</button><button class="button secondary" data-dismiss-notification type="button">Marcar leída</button></div></article>';
    }).join("");
  }

  async function markNotificationRead(notificationId) {
    var result = await supabaseClient.from("sales_notifications").update({ read_at: new Date().toISOString() }).eq("id", notificationId);
    if (result.error) { alert(result.error.message); return false; }
    var item = state.notifications.find(function (notification) { return notification.id === notificationId; });
    if (item) item.read_at = new Date().toISOString();
    renderNotifications(); return true;
  }

  function renderAll() { renderNotifications(); renderStats(); renderOperations(); renderClients(); if (state.view === "installments") loadInstallments(); }

  function stageCard(salesCase, stage, value, enabled) {
    return '<article class="stage-card"><h3>' + escapeHtml(stageLabel(stage)) + '</h3><p>Estado actual: <strong>' + escapeHtml(outcomeLabel(value)) + '</strong></p><button class="button ' + (enabled ? "primary" : "secondary") + '" data-review-stage="' + stage + '" type="button"' + (enabled ? "" : " disabled") + '>' + (value === "pending" ? "Registrar resultado" : "Actualizar control") + '</button></article>';
  }
  function renderCaseDialog() {
    var item = state.activeCase; if (!item) return;
    var lead = state.leads[item.lead_id] || {};
    var seller = state.sellers[item.seller_user_id] || {};
    var application = latestApplication(item.id);
    document.getElementById("operationTitle").textContent = item.case_code + " · " + (lead.customer_name || item.vehicle);
    document.getElementById("operationSummary").innerHTML = '<div><span>Cliente</span><strong>' + escapeHtml(lead.customer_name || (application && application.first_name + " " + application.last_name) || "Pendiente") + '</strong></div><div><span>Vehículo</span><strong>' + escapeHtml(item.vehicle) + '</strong></div><div><span>Vendedor</span><strong>' + escapeHtml(seller.full_name || "—") + '</strong></div><div><span>Importe</span><strong>' + escapeHtml(money(item.sale_amount)) + '</strong></div>';
    var quote = state.quotes[item.quote_id]; document.getElementById("quoteStatus").textContent = quote ? quote.quote_code + " · " + money(quote.final_advance_amount) + " anticipo final · " + money(quote.installment_amount) + " por cuota" : "La operación no tiene un presupuesto asociado"; document.getElementById("printQuoteButton").disabled = !quote;
    var closed = item.status === "cancelled" || !!item.finalized_at;
    document.getElementById("stageGrid").innerHTML = stageCard(item, "cdn_scoring", item.cdn_scoring_status, !closed && !!application) + stageCard(item, "dealer_scoring", item.dealer_scoring_status, !closed && item.cdn_scoring_status === "approved") + stageCard(item, "contract", item.contract_status, !closed && item.cdn_scoring_status === "approved" && item.dealer_scoring_status === "approved");
    document.getElementById("minuteStatus").textContent = application ? "Versión " + application.revision_number + " · enviada " + formatDate(application.submitted_at || application.created_at, true) : "El vendedor todavía no la cargó";
    document.getElementById("printMinuteButton").disabled = !application;
    document.getElementById("editMinuteButton").disabled = !application || item.status === "cancelled";
    var documents = state.documents[item.id] || [];
    var requiredDocuments = [["dni_holder_front", "DNI titular · Frente"], ["dni_holder_back", "DNI titular · Dorso"], ["payment_receipt", "Comprobante de pago"]];
    document.getElementById("documentChecklist").innerHTML = requiredDocuments.map(function (required) { var ready = documents.some(function (doc) { return doc.document_type === required[0]; }); return '<span class="' + (ready ? "ready" : "pending") + '">' + (ready ? "✓ " : "○ ") + escapeHtml(required[1]) + '</span>'; }).join("") + '<span class="optional">Cotitular / cónyuge · si corresponde</span>';
    document.getElementById("documentList").innerHTML = documents.map(function (doc) { return '<article class="document-item"><span><strong>' + escapeHtml(doc.file_name) + '</strong> · ' + escapeHtml(documentLabel(doc.document_type)) + '</span><button class="button secondary" data-open-document="' + doc.id + '" type="button">Abrir</button></article>'; }).join("") || '<div class="timeline-item">Todavía no se adjuntó documentación.</div>';
    document.getElementById("caseTimeline").innerHTML = (state.events[item.id] || []).map(function (event) { return '<article class="timeline-item"><strong>' + escapeHtml(event.stage ? stageLabel(event.stage) + " · " + outcomeLabel(event.outcome) : event.event_type.replace(/_/g, " ")) + '</strong>' + (event.comment ? '<span>' + escapeHtml(event.comment) + '</span>' : '') + '<small>' + escapeHtml(formatDate(event.created_at, true)) + '</small></article>'; }).join("") || '<div class="timeline-item">Sin movimientos.</div>';
    document.getElementById("dialogMessage").textContent = item.status === "cancelled" ? "Operación dada de baja: " + item.cancellation_reason : !application ? "La gestión administrativa se habilitará cuando el vendedor complete la minuta." : "";
  }
  function openCase(caseId) { state.activeCase = state.cases.find(function (item) { return item.id === caseId; }) || null; if (!state.activeCase) return; renderCaseDialog(); operationDialog.showModal(); }

  function openReview(stage) {
    state.activeStage = stage;
    var options = stage === "contract" ? [["approved", "Aprobado"], ["rejected", "Rechazado"], ["baja", "Baja"]] : [["approved", "Aprobado"], ["observed", "Observado"], ["baja", "Baja"]];
    document.getElementById("reviewKicker").textContent = stageLabel(stage);
    document.getElementById("reviewTitle").textContent = "Registrar resultado";
    document.getElementById("reviewOutcome").innerHTML = options.map(function (option) { return '<option value="' + option[0] + '">' + option[1] + '</option>'; }).join("");
    document.getElementById("reviewComment").value = ""; document.getElementById("reviewMessage").textContent = ""; reviewDialog.showModal();
  }
  async function saveReview() {
    var button = document.getElementById("saveReviewButton"); var outcome = document.getElementById("reviewOutcome").value; var comment = document.getElementById("reviewComment").value.trim(); var message = document.getElementById("reviewMessage"); message.textContent = "";
    if (["observed", "baja", "rejected"].includes(outcome) && comment.length < 3) { message.textContent = "Indicá el motivo para dejar antecedente."; return; }
    setBusy(button, true, "Guardando…");
    var result = await supabaseClient.rpc("record_sales_stage", { p_sales_case_id: state.activeCase.id, p_stage: state.activeStage, p_outcome: outcome, p_comment: comment });
    if (result.error) { message.textContent = result.error.message; setBusy(button, false); return; }
    reviewDialog.close(); await loadData(); state.activeCase = state.cases.find(function (item) { return item.id === state.activeCase.id; }); renderCaseDialog(); setBusy(button, false);
  }

  function minuteRow(label, value) { return '<div><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(text(value)) + '</strong></div>'; }
  function printQuote() { var quote = state.activeCase && state.quotes[state.activeCase.quote_id]; if (!quote) return; var snapshot = quote.commercial_snapshot || {}; var priceLabel = quote.offer_type === "savings_plan" ? "Valor final del plan" : "Precio de venta"; document.getElementById("minutePrint").innerHTML = '<article class="minute-sheet"><header><img src="/assets/logo-header.webp" alt="Grupo Sur" style="width:150px"><h1>Presupuesto comercial · ' + escapeHtml(quote.quote_code) + '</h1><p>Emitido el ' + escapeHtml(formatDate(quote.issued_at, true)) + '</p></header><section><h2>Condición comercial</h2><div class="minute-grid">' + minuteRow("Cliente", quote.customer_name) + minuteRow("Vehículo", [snapshot.brand, snapshot.model, quote.vehicle_version].filter(Boolean).join(" ")) + minuteRow("Financiera / plan", [snapshot.financier, snapshot.offer_name].filter(Boolean).join(" · ")) + minuteRow(priceLabel, money(quote.sale_price)) + minuteRow("Monto financiado", money(quote.financed_amount)) + minuteRow("Anticipo", money(quote.advance_amount)) + minuteRow("Quebranto", money(quote.breakage_amount)) + minuteRow("Patentamiento", money(quote.patenting_amount)) + minuteRow("Gastos", money(quote.expenses_amount)) + minuteRow("Anticipo final", money(quote.final_advance_amount)) + minuteRow("Cuotas", quote.term_months) + minuteRow("Valor de cuota", money(quote.installment_amount)) + '</div><p>Las bonificaciones y beneficios no se descuentan del valor final del plan y quedan sujetos a validación al finalizar la operación.</p></section></article>'; document.getElementById("minutePrint").setAttribute("aria-hidden", "false"); window.print(); }
  function printMinute() {
    var application = latestApplication(state.activeCase.id); if (!application) return;
    document.getElementById("minutePrint").innerHTML = '<article class="minute-sheet"><header><img src="/assets/logo-header.webp" alt="Grupo Sur" style="width:150px"><h1>Minuta de venta · ' + escapeHtml(state.activeCase.case_code) + '</h1><p>Emitida el ' + escapeHtml(formatDate(application.submitted_at || application.created_at, true)) + '</p></header><section><h2>Datos del cliente</h2><div class="minute-grid">' + minuteRow("Nombre", application.first_name + " " + application.last_name) + minuteRow(application.document_type, application.document_number) + minuteRow("CUIL", application.cuil) + minuteRow("Nacimiento", formatDate(application.birth_date + "T12:00:00")) + minuteRow("Domicilio", application.address) + minuteRow("Localidad / Provincia", application.city_province) + minuteRow("Código postal", application.postal_code) + minuteRow("Estado civil", application.marital_status) + minuteRow("Cónyuge", application.spouse_name || "No informado") + '</div></section><section><h2>Contacto y situación laboral</h2><div class="minute-grid">' + minuteRow("Teléfono", application.primary_phone) + minuteRow("Alternativo", application.alternate_phone || "No informado") + minuteRow("Correo", application.email) + minuteRow("Horario", application.contact_schedule) + minuteRow("Situación laboral", application.employment_status) + minuteRow("Empresa / actividad", application.employer_name) + minuteRow("Antigüedad", application.employment_seniority + " años") + minuteRow("Ingreso mensual", money(application.monthly_income)) + '</div></section><section><h2>Condiciones comerciales</h2><div class="minute-grid">' + minuteRow("Marca", application.brand_name) + minuteRow("Modelo", application.model_name) + minuteRow("Plan", application.campaign_name) + minuteRow("Precio pactado", money(application.agreed_price)) + minuteRow("Cuotas abonadas", application.installments_paid) + minuteRow("Cuotas a pagar", application.installments_to_pay) + minuteRow("Débito automático", application.automatic_debit ? "Sí" : "No") + minuteRow("Cuota diferida", application.deferred_installment ? "Sí" : "No") + minuteRow("Primer pago", application.first_payment_date ? formatDate(application.first_payment_date + "T12:00:00") + " · " + money(application.first_payment_amount) : "No informado") + minuteRow("Segundo pago", application.second_payment_date ? formatDate(application.second_payment_date + "T12:00:00") + " · " + money(application.second_payment_amount) : "No informado") + '</div></section><div class="minute-signatures"><div>Firma cliente</div><div>Aclaración y DNI</div><div>Asesor responsable</div></div></article>';
    document.getElementById("minutePrint").setAttribute("aria-hidden", "false"); window.print();
  }

  function setEditField(form, name, value) {
    var field = form.elements[name]; if (!field) return;
    if (field.type === "checkbox") { field.checked = Boolean(value); return; }
    var normalized = value == null ? "" : String(value);
    if (field.tagName === "SELECT" && normalized && !Array.from(field.options).some(function (option) { return option.value === normalized; })) {
      field.add(new Option(normalized, normalized));
    }
    field.value = normalized;
  }
  function openMinuteEditor(caseId) {
    var salesCase = state.cases.find(function (item) { return item.id === caseId; });
    var application = salesCase && latestApplication(caseId); if (!salesCase || !application || salesCase.status === "cancelled") return;
    state.activeCase = salesCase;
    var form = document.getElementById("minuteEditForm"); form.reset();
    ["first_name", "last_name", "document_type", "document_number", "cuil", "birth_date", "address", "city_province", "postal_code", "marital_status", "spouse_name", "spouse_document", "primary_phone", "alternate_phone", "email", "contact_schedule", "employment_status", "employer_name", "employment_seniority", "monthly_income", "brand_name", "model_name", "campaign_name", "plan_type", "agreed_price", "installments_paid", "installments_to_pay", "automatic_debit", "deferred_installment", "first_payment_date", "first_payment_amount", "second_payment_date", "second_payment_amount"].forEach(function (name) { setEditField(form, name, application[name]); });
    document.getElementById("minuteEditMessage").textContent = "Editando versión " + application.revision_number + " de " + salesCase.case_code + ".";
    if (operationDialog.open) operationDialog.close();
    minuteEditDialog.showModal();
  }
  function closeMinuteEditor() { if (minuteEditDialog.open) minuteEditDialog.close(); }
  async function saveMinuteEdit(event) {
    event.preventDefault();
    var form = event.currentTarget; var message = document.getElementById("minuteEditMessage"); var button = document.getElementById("saveMinuteEditButton");
    if (!form.reportValidity() || !state.activeCase) return;
    var firstDate = form.elements.first_payment_date.value || null; var firstAmount = form.elements.first_payment_amount.value;
    var secondDate = form.elements.second_payment_date.value || null; var secondAmount = form.elements.second_payment_amount.value;
    if (Boolean(firstDate) !== Boolean(firstAmount)) { message.textContent = "Completá juntos la fecha y el importe del primer pago."; return; }
    if (Boolean(secondDate) !== Boolean(secondAmount)) { message.textContent = "Completá juntos la fecha y el importe del segundo pago."; return; }
    var numberFields = ["monthly_income", "agreed_price", "installments_paid", "installments_to_pay", "first_payment_amount", "second_payment_amount"];
    var changes = {};
    ["first_name", "last_name", "document_type", "document_number", "cuil", "birth_date", "address", "city_province", "postal_code", "marital_status", "spouse_name", "spouse_document", "primary_phone", "alternate_phone", "email", "contact_schedule", "employment_status", "employer_name", "employment_seniority", "monthly_income", "brand_name", "model_name", "campaign_name", "plan_type", "agreed_price", "installments_paid", "installments_to_pay", "automatic_debit", "deferred_installment", "first_payment_date", "first_payment_amount", "second_payment_date", "second_payment_amount"].forEach(function (name) {
      var field = form.elements[name];
      if (field.type === "checkbox") changes[name] = field.checked;
      else if (numberFields.includes(name)) changes[name] = field.value === "" ? null : Number(field.value);
      else changes[name] = field.value.trim() || null;
    });
    message.textContent = ""; setBusy(button, true, "Guardando…"); var caseId = state.activeCase.id;
    var result = await supabaseClient.rpc("revise_sales_minute", { p_sales_case_id: caseId, p_changes: changes, p_reason: form.elements.reason.value.trim() });
    if (result.error) { message.textContent = result.error.message; setBusy(button, false); return; }
    closeMinuteEditor(); await loadData(); setBusy(button, false); openCase(caseId); document.getElementById("dialogMessage").textContent = "Minuta corregida y cliente actualizado correctamente.";
  }

  async function uploadDocument(event) {
    event.preventDefault(); if (!state.activeCase) return;
    var form = event.currentTarget; var file = form.elements.file.files[0]; var button = form.querySelector("button"); var message = document.getElementById("dialogMessage");
    if (!file) { message.textContent = "Seleccioná un archivo."; return; }
    if (file.size > 20 * 1024 * 1024) { message.textContent = "El archivo supera los 20 MB."; return; }
    setBusy(button, true, "Subiendo…"); var safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-"); var path = state.activeCase.id + "/" + Date.now() + "-" + safeName;
    var upload = await supabaseClient.storage.from("sales-documents").upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) { message.textContent = upload.error.message; setBusy(button, false); return; }
    var insert = await supabaseClient.from("sales_documents").insert({ sales_case_id: state.activeCase.id, document_type: form.elements.type.value, file_name: file.name, storage_path: path, mime_type: file.type, uploaded_by: state.profile.user_id });
    if (insert.error) { message.textContent = insert.error.message; setBusy(button, false); return; }
    form.reset(); await loadData(); state.activeCase = state.cases.find(function (item) { return item.id === state.activeCase.id; }); renderCaseDialog(); setBusy(button, false);
  }
  async function openDocument(documentId) { var docs = Object.keys(state.documents).reduce(function (all, key) { return all.concat(state.documents[key]); }, []); var doc = docs.find(function (item) { return item.id === documentId; }); if (!doc) return; var signed = await supabaseClient.storage.from("sales-documents").createSignedUrl(doc.storage_path, 60); if (signed.error) { document.getElementById("dialogMessage").textContent = signed.error.message; return; } window.open(signed.data.signedUrl, "_blank", "noopener"); }

  function openGroup(clientId) { state.activeClient = state.clients.find(function (item) { return item.id === clientId; }); if (!state.activeClient) return; document.getElementById("groupMonth").value = new Date().toISOString().slice(0, 7); document.getElementById("groupMessage").textContent = ""; groupDialog.showModal(); }
  async function groupClient() { var button = document.getElementById("groupButton"); var month = document.getElementById("groupMonth").value; if (!month) { document.getElementById("groupMessage").textContent = "Elegí el mes de agrupación."; return; } setBusy(button, true, "Agrupando…"); var result = await supabaseClient.rpc("group_client", { p_client_id: state.activeClient.id, p_group_month: month + "-01" }); if (result.error) { document.getElementById("groupMessage").textContent = result.error.message; setBusy(button, false); return; } groupDialog.close(); await loadData(); setBusy(button, false); }

  async function loadInstallments() {
    var month = document.getElementById("installmentMonth").value; if (!month) return;
    var result = await supabaseClient.from("client_installments").select("id, client_id, installment_number, due_month, status, promised_for, paid_at, receipt_path, note").eq("due_month", month + "-01").order("installment_number");
    var rows = result.data || []; var total = rows.length; var count = function (status) { return rows.filter(function (row) { return row.status === status; }).length; }; var percent = function (value) { return total ? Math.round(value * 1000 / total) / 10 : 0; };
    [["paid", "paidPercentage", "paidCount"], ["promised", "promisedPercentage", "promisedCount"], ["delinquent", "latePercentage", "lateCount"], ["pending", "pendingPercentage", "pendingCount"]].forEach(function (group) { var amount = count(group[0]); document.getElementById(group[1]).textContent = percent(amount) + "%"; document.getElementById(group[2]).textContent = amount + (amount === 1 ? " cliente" : " clientes"); });
    document.getElementById("installmentBody").innerHTML = rows.length ? rows.map(function (row) { var client = state.clients.find(function (item) { return item.id === row.client_id; }) || {}; var salesCase = state.cases.find(function (item) { return item.id === client.sales_case_id; }) || {}; return '<tr data-installment-id="' + row.id + '" data-client-id="' + escapeHtml(row.client_id) + '" data-case-id="' + escapeHtml(client.sales_case_id || "") + '"><td><strong>' + escapeHtml(clientName(client)) + '</strong><small>' + (client.automatic_debit ? "Débito automático" : "Pago manual") + '</small></td><td><strong>' + escapeHtml(salesCase.case_code || "—") + '</strong><small>' + escapeHtml(salesCase.vehicle || "") + '</small></td><td>N° ' + row.installment_number + '</td><td><select data-payment-status><option value="pending"' + (row.status === "pending" ? " selected" : "") + '>Pendiente</option><option value="paid"' + (row.status === "paid" ? " selected" : "") + '>Pagada</option><option value="promised"' + (row.status === "promised" ? " selected" : "") + '>Promesa</option><option value="delinquent"' + (row.status === "delinquent" ? " selected" : "") + '>Moroso</option></select></td><td><input data-promised-for type="date" value="' + escapeHtml(row.promised_for || "") + '"></td><td><input data-receipt type="file" accept="application/pdf,image/jpeg,image/png,image/webp"><small>' + (row.receipt_path ? "Comprobante cargado" : "Opcional") + '</small></td><td><button class="button primary" data-save-installment type="button">Guardar</button></td></tr>'; }).join("") : '<tr><td colspan="7">No hay cuotas para este mes.</td></tr>';
  }
  async function saveInstallment(row, button) {
    var id = row.dataset.installmentId; var status = row.querySelector("[data-payment-status]").value; var promisedFor = row.querySelector("[data-promised-for]").value || null; var file = row.querySelector("[data-receipt]").files[0]; if (status === "promised" && !promisedFor) { alert("Indicá la fecha de la promesa de pago."); return; }
    setBusy(button, true, "Guardando…"); var receiptPath = null;
    if (file) { var safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-"); receiptPath = "installments/" + id + "/" + Date.now() + "-" + safeName; var upload = await supabaseClient.storage.from("sales-documents").upload(receiptPath, file, { contentType: file.type }); if (upload.error) { alert(upload.error.message); setBusy(button, false); return; } }
    var values = { status: status, promised_for: status === "promised" ? promisedFor : null, paid_at: status === "paid" ? new Date().toISOString() : null, updated_by: state.profile.user_id };
    if (receiptPath) values.receipt_path = receiptPath;
    var update = await supabaseClient.from("client_installments").update(values).eq("id", id);
    if (!update.error && receiptPath) { var documentResult = await supabaseClient.from("sales_documents").insert({ sales_case_id: row.dataset.caseId, client_id: row.dataset.clientId, document_type: "receipt", file_name: file.name, storage_path: receiptPath, mime_type: file.type, uploaded_by: state.profile.user_id }); if (documentResult.error) update = documentResult; }
    if (update.error) alert(update.error.message); else await loadInstallments(); setBusy(button, false);
  }

  function switchView(view) { state.view = view; document.querySelectorAll("[data-panel]").forEach(function (panel) { panel.classList.toggle("active", panel.dataset.panel === view); }); document.querySelectorAll("[data-view]").forEach(function (button) { button.classList.toggle("active", button.dataset.view === view); }); document.getElementById("pageTitle").textContent = view === "operations" ? "Administración de ventas" : view === "clients" ? "Cartera de clientes" : "Control mensual de cuotas"; if (view === "installments") loadInstallments(); }
  async function enterApp() { var profile = await getProfile(); if (!profile) { await supabaseClient.auth.signOut({ scope: "local" }); throw new Error("Esta cuenta no tiene permisos de Administración de ventas."); } state.profile = profile; document.getElementById("profileName").textContent = profile.full_name; document.getElementById("avatar").textContent = initials(profile.full_name); document.getElementById("authLoading").hidden = true; loginView.hidden = true; appView.hidden = false; await loadData(); }

  loginForm.addEventListener("submit", async function (event) { event.preventDefault(); var button = loginForm.querySelector("button"); var message = document.getElementById("loginMessage"); message.textContent = ""; setBusy(button, true, "Ingresando…"); var result = await supabaseClient.auth.signInWithPassword({ email: loginForm.elements.email.value.trim().toLowerCase(), password: loginForm.elements.password.value }); if (result.error) { message.textContent = result.error.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : result.error.message; setBusy(button, false); return; } try { await enterApp(); } catch (error) { message.textContent = error.message; } setBusy(button, false); });
  document.getElementById("logoutButton").addEventListener("click", async function () { await supabaseClient.auth.signOut({ scope: "local" }); location.reload(); });
  document.querySelector(".sidebar nav").addEventListener("click", function (event) { var button = event.target.closest("[data-view]"); if (button) switchView(button.dataset.view); });
  document.getElementById("operationFilters").addEventListener("click", function (event) { var button = event.target.closest("[data-status]"); if (!button) return; state.filter = button.dataset.status; this.querySelectorAll("button").forEach(function (item) { item.classList.toggle("active", item === button); }); renderOperations(); });
  document.getElementById("operationSearch").addEventListener("input", function () { state.search = this.value; renderOperations(); });
  document.getElementById("clientSearch").addEventListener("input", renderClients);
  document.getElementById("operationList").addEventListener("click", function (event) { var row = event.target.closest("[data-case-id]"); if (row && event.target.closest("[data-open-case]")) openCase(row.dataset.caseId); });
  document.getElementById("clientGrid").addEventListener("click", function (event) { var card = event.target.closest("[data-client-id]"); if (event.target.closest("[data-group-client]") && card) openGroup(card.dataset.clientId); var open = event.target.closest("[data-open-case-from-client]"); if (open) openCase(open.dataset.openCaseFromClient); var edit = event.target.closest("[data-edit-minute]"); if (edit) openMinuteEditor(edit.dataset.editMinute); });
  document.getElementById("adminNotifications").addEventListener("click", async function (event) { var card = event.target.closest("[data-notification-id]"); if (!card) return; var open = event.target.closest("[data-open-notification]"); if (open) { await markNotificationRead(card.dataset.notificationId); if (open.dataset.openNotification) openCase(open.dataset.openNotification); return; } if (event.target.closest("[data-dismiss-notification]")) await markNotificationRead(card.dataset.notificationId); });
  document.getElementById("stageGrid").addEventListener("click", function (event) { var button = event.target.closest("[data-review-stage]"); if (button && !button.disabled) openReview(button.dataset.reviewStage); });
  document.getElementById("saveReviewButton").addEventListener("click", saveReview);
  document.getElementById("printMinuteButton").addEventListener("click", printMinute);
  document.getElementById("editMinuteButton").addEventListener("click", function () { if (state.activeCase) openMinuteEditor(state.activeCase.id); });
  document.getElementById("printQuoteButton").addEventListener("click", printQuote);
  document.getElementById("minuteEditForm").addEventListener("submit", saveMinuteEdit);
  document.querySelector("[data-close-minute-edit]").addEventListener("click", closeMinuteEditor);
  document.querySelector("[data-cancel-minute-edit]").addEventListener("click", closeMinuteEditor);
  document.getElementById("documentForm").addEventListener("submit", uploadDocument);
  document.getElementById("documentList").addEventListener("click", function (event) { var button = event.target.closest("[data-open-document]"); if (button) openDocument(button.dataset.openDocument); });
  document.querySelector("[data-close-operation]").addEventListener("click", function () { operationDialog.close(); });
  document.getElementById("groupButton").addEventListener("click", groupClient);
  document.getElementById("installmentMonth").addEventListener("change", loadInstallments);
  document.getElementById("installmentBody").addEventListener("click", function (event) { var button = event.target.closest("[data-save-installment]"); if (button) saveInstallment(button.closest("tr"), button); });
  document.getElementById("refreshButton").addEventListener("click", async function () { setBusy(this, true, "Actualizando…"); try { await loadData(); } finally { setBusy(this, false); } });
  window.addEventListener("afterprint", function () { document.getElementById("minutePrint").setAttribute("aria-hidden", "true"); });
  var now = new Date(); document.getElementById("installmentMonth").value = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  if (!supabaseClient) { document.getElementById("authLoading").hidden = true; loginView.hidden = false; document.getElementById("loginMessage").textContent = "No se pudo conectar con Supabase."; return; }
  if (window.grupoSurHistoricalClients) window.grupoSurHistoricalClients.init(supabaseClient);
  supabaseClient.auth.getSession().then(function (result) { if (result.data.session) { enterApp().catch(function (error) { document.getElementById("authLoading").hidden = true; loginView.hidden = false; document.getElementById("loginMessage").textContent = error.message; }); return; } document.getElementById("authLoading").hidden = true; loginView.hidden = false; });
}());
