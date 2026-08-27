(function () {
  "use strict";
  var supabaseClient = window.grupoSurSupabaseClient;
  var state = { userId: "", profile: null, cases: [], events: {}, applications: {}, notifications: [], leads: [], quotes: [], models: [], campaigns: [], credits: [], activeCase: null, activeQuote: null, activeCampaign: null, activeCampaignFingerprint: "" };
  var quoteDialog = document.getElementById("quoteDialog");
  var quoteForm = document.getElementById("quoteForm");
  var minuteDialog = document.getElementById("salesMinuteDialog");
  var minuteForm = document.getElementById("salesMinuteForm");
  var finalMinute = window.grupoSurFinalMinute;

  function escapeHtml(value) { return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  function money(value) { return value == null || value === "" ? "A confirmar" : "$" + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Number(value)); }
  function formatDate(value) { return value ? new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—"; }
  function outcome(value) { return ({ pending: "Pendiente", approved: "Aprobado", observed: "Observado", rejected: "Rechazado", baja: "Baja", cancelled: "Baja" })[value] || value; }
  function statusLabel(value) { return ({ minute_pending: "Minuta pendiente", quality_control: "Control de calidad", dealer_scoring: "Scoring concesionario", contract_signature: "Firma de contrato", formation_group: "Finalizada · formación de grupo", grouped: "Finalizada · agrupado", finalized: "Finalizada" })[value] || value; }
  function setBusy(button, busy, label) { if (busy) { button.dataset.label = button.textContent; button.textContent = label; button.disabled = true; } else { button.textContent = button.dataset.label || button.textContent; button.disabled = false; } }
  function latestApplication(caseId) { return (state.applications[caseId] || []).slice().sort(function (a, b) { return Number(b.revision_number) - Number(a.revision_number); })[0] || null; }
  function selectedModel() { return state.models.find(function (item) { return item.id === quoteForm.elements.modelId.value; }); }
  function selectedOffer() { var list = quoteForm.elements.offerType.value === "bank_credit" ? state.credits : state.campaigns; return list.find(function (item) { return item.id === quoteForm.elements.offerId.value; }); }
  function selectedVehicleVersion() { var offer = selectedOffer(); if (!offer || quoteForm.elements.offerType.value !== "bank_credit") return null; var id = quoteForm.elements.vehicleVersion.value; var link = (offer.versions || []).find(function (item) { var version = Array.isArray(item.version) ? item.version[0] : item.version; return version && version.id === id; }); return link ? (Array.isArray(link.version) ? link.version[0] : link.version) : null; }
  function selectedVehicleVersionName() { var version = selectedVehicleVersion(); return version ? version.name : quoteForm.elements.vehicleVersion.value.trim(); }
  function offerName(item, type) { return type === "bank_credit" ? item.financier_name + " · " + item.offer_name + " · " + item.term_months + " cuotas" : item.plan_name + (item.version_name ? " · " + item.version_name : "") + (item.installment_count ? " · " + item.installment_count + " cuotas" : ""); }
  function isCurrentlyValid(item) { var today = new Date().toISOString().slice(0, 10); return item.active !== false && (!item.valid_from || item.valid_from <= today) && (!item.valid_to || item.valid_to >= today); }
  function quoteCode() { return "GS-PRES-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(); }

  async function ensureUser() { if (state.userId) return state.userId; var auth = await supabaseClient.auth.getUser(); state.userId = auth.data && auth.data.user ? auth.data.user.id : ""; return state.userId; }

  async function loadCatalog() {
    var results = await Promise.all([
      supabaseClient.from("models").select("id, name, image_path, sort_order, active, brand:brands!inner(name,sort_order)").eq("active", true).order("sort_order"),
      supabaseClient.from("campaigns").select("id, model_id, plan_name, version_name, transmission, installment_count, final_price, advance_amount, installment_amount, installment_is_from, active, valid_from, valid_to, bonus, benefits").eq("active", true).order("sort_order"),
      supabaseClient.from("bank_credit_offers").select("id, model_id, financier_name, offer_name, term_months, min_financed_amount, max_financed_amount, installment_coefficient, breakage_rate, patenting_rate, fixed_expenses, tna, cftea, notes, active, valid_from, valid_to, versions:bank_credit_offer_versions(version:model_versions(id,name,suggested_price,active))").eq("active", true).order("sort_order")
    ]);
    state.models = results[0].data || []; state.campaigns = results[1].data || []; state.credits = results[2].data || [];
  }

  async function loadQuotes() {
    await ensureUser(); await loadCatalog();
    var results = await Promise.all([
      supabaseClient.from("leads").select("id, customer_name, customer_phone, model_interest, created_at").eq("assigned_seller_user_id", state.userId).order("created_at", { ascending: false }).limit(500),
      supabaseClient.from("sales_quotes").select("id, quote_code, lead_id, model_id, offer_type, customer_name, vehicle_version, sale_price, financed_amount, installment_amount, advance_amount, breakage_base_amount, breakage_vat_amount, breakage_amount, patenting_amount, expenses_amount, final_advance_amount, status, issued_at, valid_until, commercial_snapshot").eq("seller_user_id", state.userId).order("issued_at", { ascending: false }).limit(500)
    ]);
    state.leads = results[0].data || []; state.quotes = results[1].data || []; renderQuotes();
  }

  function renderQuotes() {
    document.getElementById("quotesList").innerHTML = state.quotes.length ? state.quotes.map(function (item) {
      var snapshot = item.commercial_snapshot || {};
      return '<article class="quote-history-card" data-quote-id="' + item.id + '"><div><strong>' + escapeHtml(item.quote_code) + '</strong><span>' + escapeHtml(item.customer_name + " · " + (snapshot.brand || "") + " " + (snapshot.model || "") + " " + item.vehicle_version) + '</span><small>' + escapeHtml(formatDate(item.issued_at)) + ' · vigente hasta ' + escapeHtml(formatDate(item.valid_until)) + '</small></div><div><strong>' + escapeHtml(money(item.final_advance_amount)) + ' anticipo final</strong><span>' + escapeHtml(money(item.installment_amount)) + ' por cuota · ' + escapeHtml(item.offer_type === "bank_credit" ? "Crédito de terminal" : "Plan de ahorro") + '</span></div><button class="primary-button compact-button" data-print-quote type="button">Imprimir</button></article>';
    }).join("") : '<div class="agenda-empty">Todavía no generaste presupuestos asociados a tus Leads.</div>';
  }

  function populateModels(modelHint) {
    var sorted = state.models.slice().sort(function (a, b) { var brandA = Array.isArray(a.brand) ? a.brand[0] : a.brand; var brandB = Array.isArray(b.brand) ? b.brand[0] : b.brand; return Number(brandA && brandA.sort_order || 0) - Number(brandB && brandB.sort_order || 0) || Number(a.sort_order || 0) - Number(b.sort_order || 0) || a.name.localeCompare(b.name, "es"); });
    document.getElementById("quoteModel").innerHTML = '<option value="">Seleccionar modelo</option>' + sorted.map(function (item) { var brand = Array.isArray(item.brand) ? item.brand[0] : item.brand; return '<option value="' + item.id + '">' + escapeHtml((brand && brand.name || "") + " · " + item.name) + '</option>'; }).join("");
    if (modelHint) { var match = sorted.find(function (item) { return String(modelHint).toLowerCase().includes(item.name.toLowerCase()); }); if (match) document.getElementById("quoteModel").value = match.id; }
  }

  function creditVersions(offer) { return (offer && offer.versions || []).map(function (link) { return Array.isArray(link.version) ? link.version[0] : link.version; }).filter(function (version) { return version && version.active !== false; }).sort(function (a, b) { return a.name.localeCompare(b.name, "es"); }); }

  function populateOffers() {
    var modelId = quoteForm.elements.modelId.value; var type = quoteForm.elements.offerType.value; var list = (type === "bank_credit" ? state.credits : state.campaigns).filter(function (item) { return item.model_id === modelId && isCurrentlyValid(item); });
    document.getElementById("quoteOffer").innerHTML = list.length ? list.map(function (item) { return '<option value="' + item.id + '">' + escapeHtml(offerName(item, type)) + '</option>'; }).join("") : '<option value="">No hay condiciones cargadas para este modelo</option>';
    document.getElementById("quoteOfferCount").textContent = list.length + (list.length === 1 ? " opción" : " opciones");
    document.getElementById("quoteOfferCards").innerHTML = list.length ? list.map(function (item, index) {
      var bank = type === "bank_credit"; var versionCount = bank ? creditVersions(item).length : 1; var main = bank ? "$" + new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(item.installment_coefficient) * 1000) + " cada $1.000" : money(item.advance_amount) + " anticipo"; var detail = bank ? money(item.min_financed_amount || 0) + " a " + money(item.max_financed_amount || 0) : (item.installment_count || "—") + " cuotas · " + money(item.installment_amount);
      return '<button class="quote-offer-card' + (index === 0 ? ' is-selected' : '') + '" type="button" data-quote-offer="' + item.id + '"><span class="quote-offer-badge">' + escapeHtml(bank ? item.financier_name : ([item.version_name, item.transmission].filter(Boolean).join(" ") || "Plan vigente")) + '</span><strong>' + escapeHtml(bank ? item.offer_name : item.plan_name) + '</strong><small>' + escapeHtml(bank ? item.term_months + " cuotas · " + versionCount + " versiones" : detail) + '</small><div><span>' + escapeHtml(main) + '</span><span>' + escapeHtml(bank ? detail : (item.installment_is_from ? "Desde " : "") + money(item.installment_amount) + " cuota") + '</span></div><em>Seleccionar propuesta →</em></button>';
    }).join("") : '<div class="quote-offers-empty">No hay condiciones vigentes para este modelo.</div>';
    configureOffer();
  }

  function configureOffer() {
    var type = quoteForm.elements.offerType.value; var offer = selectedOffer(); var model = selectedModel(); var versions = [];
    document.querySelectorAll("[data-bank-field]").forEach(function (field) { field.hidden = type !== "bank_credit"; });
    document.querySelectorAll("[data-quote-offer]").forEach(function (card) { card.classList.toggle("is-selected", Boolean(offer && card.dataset.quoteOffer === offer.id)); });
    document.getElementById("quoteConfigurator").hidden = !offer;
    if (!offer) { calculateQuote(); return; }
    if (type === "bank_credit") versions = creditVersions(offer);
    document.getElementById("quoteVersion").innerHTML = type === "bank_credit" ? (versions.length ? versions.map(function (version) { return '<option value="' + version.id + '">' + escapeHtml(version.name) + '</option>'; }).join("") : '<option value="">No hay versiones habilitadas</option>') : '<option value="' + escapeHtml([offer.version_name, offer.transmission].filter(Boolean).join(" ") || "Versión a confirmar") + '">' + escapeHtml([offer.version_name, offer.transmission].filter(Boolean).join(" ") || "Versión a confirmar") + '</option>';
    document.getElementById("quoteModelImage").src = model && model.image_path || "../assets/logo-header.webp"; document.getElementById("quoteModelImage").alt = model ? model.name : "Vehículo";
    document.getElementById("quoteSelectedType").textContent = type === "bank_credit" ? "Crédito de terminal" : "Plan de ahorro"; document.getElementById("quoteSelectedTitle").textContent = offerName(offer, type); document.getElementById("quoteSelectedMeta").textContent = type === "bank_credit" ? "Financiación entre " + money(offer.min_financed_amount || 0) + " y " + money(offer.max_financed_amount || 0) : "Valor final del plan " + money(offer.final_price); document.getElementById("quoteSelectedNotes").textContent = offer.notes || "Sin notas adicionales.";
    if (type === "savings_plan") {
      quoteForm.elements.salePrice.value = offer && offer.final_price != null ? offer.final_price : "";
      quoteForm.elements.salePrice.readOnly = true;
      quoteForm.elements.financedAmount.value = "";
      document.getElementById("quotePriceHelp").textContent = offer && offer.final_price != null ? "Valor final cargado por administración, sin descontar bonificaciones." : "Administración todavía no cargó el valor final de este plan.";
    } else {
      quoteForm.elements.salePrice.readOnly = false;
      applySuggestedPrice();
      document.getElementById("quotePriceHelp").textContent = "Precio sugerido por administración. Podés ajustarlo para esta operación.";
      var minimum = Number(offer.min_financed_amount || 0); var maximum = Number(offer.max_financed_amount || minimum || 0); var range = document.getElementById("quoteFinancedRange"); range.min = minimum; range.max = maximum; range.step = 100000; range.value = Math.min(maximum, Math.max(minimum, Number(quoteForm.elements.financedAmount.value || minimum)));
      quoteForm.elements.financedAmount.min = minimum; quoteForm.elements.financedAmount.max = maximum; quoteForm.elements.financedAmount.step = 100000; quoteForm.elements.financedAmount.value = range.value; document.getElementById("quoteFinancedMin").textContent = money(minimum); document.getElementById("quoteFinancedMax").textContent = money(maximum);
    }
    calculateQuote();
  }

  function applySuggestedPrice() { var version = selectedVehicleVersion(); if (version && version.suggested_price != null) quoteForm.elements.salePrice.value = version.suggested_price; }

  function quoteValues() {
    var type = quoteForm.elements.offerType.value; var offer = selectedOffer(); var price = Number(quoteForm.elements.salePrice.value || 0); if (!offer || !price) return null;
    if (type === "bank_credit") {
      var financed = Number(quoteForm.elements.financedAmount.value || 0); var advance = Math.max(0, price - financed); var breakageBase = financed * Number(offer.breakage_rate || 0) / 100; var breakageVat = breakageBase * .21; var breakage = breakageBase + breakageVat; var patenting = price * Number(offer.patenting_rate || 0) / 100; var expenses = Number(offer.fixed_expenses || 0);
      return { price: price, financed: financed, advance: advance, breakageBase: breakageBase, breakageVat: breakageVat, breakage: breakage, patenting: patenting, expenses: expenses, finalAdvance: advance + breakage + patenting + expenses, installment: financed * Number(offer.installment_coefficient), term: offer.term_months };
    }
    var planAdvance = Number(offer.advance_amount || 0); return { price: price, financed: Math.max(0, price - planAdvance), advance: planAdvance, breakageBase: 0, breakageVat: 0, breakage: 0, patenting: 0, expenses: 0, finalAdvance: planAdvance, installment: Number(offer.installment_amount || 0), term: offer.installment_count };
  }
  function calculateQuote() { var values = quoteValues(); var type = quoteForm.elements.offerType.value; if (type === "bank_credit") document.getElementById("quoteFinancedDisplay").textContent = money(quoteForm.elements.financedAmount.value || 0); document.getElementById("quoteCalculation").innerHTML = values ? (type === "bank_credit" ? [["Anticipo base", values.advance], ["Quebranto base", values.breakageBase], ["IVA s/quebranto", values.breakageVat], ["Quebranto total", values.breakage], ["Patentamiento", values.patenting], ["Gastos", values.expenses], ["Anticipo final", values.finalAdvance], ["Cuota", values.installment]] : [["Valor final del plan", values.price], ["Anticipo", values.advance], ["Cuota", values.installment], ["Cuotas", values.term]]).map(function (row) { return '<div><span>' + row[0] + '</span><strong>' + escapeHtml(row[0] === "Cuotas" ? row[1] : money(row[1])) + '</strong></div>'; }).join("") : '<div><span>Completá precio y condición</span><strong>—</strong></div>'; }

  async function openQuote(leadId) {
    await loadQuotes(); quoteForm.reset(); document.getElementById("quoteError").textContent = "";
    document.getElementById("quoteLead").innerHTML = state.leads.length ? state.leads.map(function (lead) { return '<option value="' + lead.id + '">' + escapeHtml((lead.customer_name || "Cliente sin nombre") + " · +" + lead.customer_phone) + '</option>'; }).join("") : '<option value="">No hay Leads disponibles</option>';
    if (leadId) document.getElementById("quoteLead").value = leadId; var lead = state.leads.find(function (item) { return item.id === document.getElementById("quoteLead").value; }); populateModels(lead && lead.model_interest); document.getElementById("quoteOfferType").value = "savings_plan"; var limit = new Date(); limit.setDate(limit.getDate() + 7); quoteForm.elements.validUntil.value = limit.toISOString().slice(0, 10); populateOffers(); quoteDialog.showModal();
  }

  function quoteSnapshot(item) { var model = state.models.find(function (row) { return row.id === item.model_id; }); var brand = model && (Array.isArray(model.brand) ? model.brand[0] : model.brand); var version = selectedVehicleVersion(); return { brand: brand && brand.name || "", model: model && model.name || "", model_image: model && model.image_path || "", offer_name: item.offer_name || item.plan_name || "", financier: item.financier_name || "", final_price: item.final_price || null, suggested_price: version && version.suggested_price != null ? Number(version.suggested_price) : null, tna: item.tna || null, cftea: item.cftea || null, coefficient: item.installment_coefficient || null, installment_per_thousand: item.installment_coefficient == null ? null : Number(item.installment_coefficient) * 1000, breakage_rate: item.breakage_rate || 0, breakage_vat_rate: 21, patenting_rate: item.patenting_rate || 0, benefits: item.benefits || [], bonus: item.bonus || "", notes: item.notes || "" }; }
  async function saveQuote(event) {
    event.preventDefault(); var button = document.getElementById("quoteSubmit"); var errorBox = document.getElementById("quoteError"); errorBox.textContent = ""; var values = quoteValues(); var offer = selectedOffer(); var lead = state.leads.find(function (item) { return item.id === quoteForm.elements.leadId.value; });
    if (!lead || !offer || !values || values.price <= 0) { errorBox.textContent = quoteForm.elements.offerType.value === "savings_plan" ? "Este plan todavía no tiene valor final cargado. Pedile a administración que complete la condición." : "Completá el Lead, modelo, condición y precio de venta."; return; }
    if (quoteForm.elements.offerType.value === "savings_plan" && Number(values.price) !== Number(offer.final_price)) { errorBox.textContent = "El valor del plan debe coincidir con el valor final vigente."; return; }
    if (quoteForm.elements.offerType.value === "bank_credit" && !selectedVehicleVersion()) { errorBox.textContent = "Elegí una versión habilitada para este crédito."; return; }
    if (quoteForm.elements.offerType.value === "bank_credit" && (values.financed <= 0 || values.financed > values.price)) { errorBox.textContent = "El monto financiado debe ser mayor a cero y no superar el precio."; return; }
    if ((offer.min_financed_amount && values.financed < Number(offer.min_financed_amount)) || (offer.max_financed_amount && values.financed > Number(offer.max_financed_amount))) { errorBox.textContent = "El monto financiado está fuera del rango habilitado para esta línea."; return; }
    setBusy(button, true, "Guardando…"); var code = quoteCode(); var type = quoteForm.elements.offerType.value; var snapshot = quoteSnapshot(offer);
    var insert = await supabaseClient.from("sales_quotes").insert({ quote_code: code, lead_id: lead.id, seller_user_id: state.userId, model_id: quoteForm.elements.modelId.value, campaign_id: type === "savings_plan" ? offer.id : null, bank_credit_offer_id: type === "bank_credit" ? offer.id : null, offer_type: type, customer_name: lead.customer_name || "Cliente sin nombre", vehicle_version: selectedVehicleVersionName(), sale_price: values.price, financed_amount: values.financed, term_months: values.term, installment_amount: values.installment, advance_amount: values.advance, breakage_base_amount: values.breakageBase, breakage_vat_amount: values.breakageVat, breakage_amount: values.breakage, patenting_amount: values.patenting, expenses_amount: values.expenses, final_advance_amount: values.finalAdvance, valid_until: quoteForm.elements.validUntil.value + "T23:59:59-03:00", commercial_snapshot: snapshot }).select("*").single();
    if (insert.error) { errorBox.textContent = insert.error.message; setBusy(button, false); return; }
    state.activeQuote = insert.data; quoteDialog.close(); await loadQuotes(); printQuote(insert.data); setBusy(button, false);
  }

  function printQuote(item) {
    var snapshot = item.commercial_snapshot || {}; var vehicle = [snapshot.brand, snapshot.model, item.vehicle_version].filter(Boolean).join(" "); var condition = snapshot.financier ? snapshot.financier + " · " + snapshot.offer_name : snapshot.offer_name; var rows = [[item.offer_type === "savings_plan" ? "Valor final del plan" : "Precio de venta", money(item.sale_price)], ["Anticipo base", money(item.advance_amount)], ["Anticipo final", money(item.final_advance_amount)], ["Cantidad de cuotas", item.term_months], ["Valor de cuota", money(item.installment_amount)], ["Monto financiado", money(item.financed_amount)], ["Quebranto base", money(item.breakage_base_amount || 0)], ["IVA sobre quebranto", money(item.breakage_vat_amount || 0)], ["Quebranto total", money(item.breakage_amount)], ["Patentamiento", money(item.patenting_amount)], ["Gastos", money(item.expenses_amount)], ["TNA", snapshot.tna == null ? "No informada" : snapshot.tna + "%"], ["CFTEA", snapshot.cftea == null ? "No informado" : snapshot.cftea + "%"]];
    document.getElementById("minutePrint").innerHTML = '<article class="minute-sheet commercial-quote-sheet"><header class="minute-header"><div class="minute-header-brand"><img class="minute-company-logo" src="../assets/logo-header.webp" alt="Grupo Sur Automotores"><span>Propuesta comercial</span></div><div class="minute-identifiers"><strong>' + escapeHtml(item.quote_code) + '</strong><span>Emitida: ' + escapeHtml(formatDate(item.issued_at)) + '</span></div></header><section class="quote-print-hero">' + (snapshot.model_image ? '<img src="' + escapeHtml(snapshot.model_image) + '" alt="' + escapeHtml(vehicle) + '">' : '') + '<div><span>' + escapeHtml(item.offer_type === "savings_plan" ? "Plan de ahorro" : "Crédito de terminal") + '</span><h1>' + escapeHtml(vehicle) + '</h1><p>' + escapeHtml(condition) + '</p></div></section><section class="quote-customer-strip"><div><span>Cliente</span><strong>' + escapeHtml(item.customer_name) + '</strong></div><div><span>Vigencia</span><strong>' + escapeHtml(formatDate(item.valid_until)) + '</strong></div></section><section class="minute-print-section"><h2>Detalle de la propuesta</h2><div class="minute-data-grid three-columns">' + rows.map(function (row) { return '<div><span>' + escapeHtml(row[0]) + '</span><strong>' + escapeHtml(String(row[1] == null ? "—" : row[1])) + '</strong></div>'; }).join("") + '</div></section>' + ((snapshot.benefits || []).length ? '<section class="minute-print-section"><h2>Beneficios informados</h2><ul class="quote-benefits">' + snapshot.benefits.map(function (benefit) { return '<li>' + escapeHtml(benefit) + '</li>'; }).join("") + '</ul></section>' : '') + (snapshot.notes ? '<section class="minute-print-section quote-legal"><h2>Notas de la financiación</h2><p>' + escapeHtml(snapshot.notes) + '</p></section>' : '') + '<section class="minute-print-section quote-legal"><h2>Información importante</h2><p>El valor final de los planes no descuenta bonificaciones. En créditos, el precio de venta puede haber sido ajustado por el vendedor para esta operación. El quebranto informado incluye IVA del 21% aplicado únicamente sobre el quebranto base. Propuesta informativa sujeta a vigencia, disponibilidad, aprobación crediticia y condiciones definitivas de la terminal o concesionario.</p></section><div class="minute-signatures"><div>Firma del cliente</div><div>Aclaración y DNI</div><div>Asesor responsable</div></div><footer class="minute-footer">Documento emitido desde el portal interno de Grupo Sur Automotores</footer></article>';
    document.getElementById("minutePrint").setAttribute("aria-hidden", "false"); document.body.classList.add("printing-minute"); window.print();
  }

  async function loadSales() {
    await ensureUser(); var results = await Promise.all([
      supabaseClient.from("sales_cases").select("id, case_code, seller_user_id, vehicle, sale_amount, status, cdn_scoring_status, dealer_scoring_status, contract_status, admin_call_requested_at, finalized_at, created_at, updated_at, quote:sales_quotes!sales_cases_quote_id_fkey(id,campaign_id,offer_type,term_months,vehicle_version,sale_price,commercial_snapshot), sale_request:lead_sale_requests!sales_cases_sale_request_id_fkey(quote_id,provisional_application_id, provisional:commercial_applications!lead_sale_requests_provisional_application_id_fkey(id,prequalification_event_id,request_code,brand_name,model_name,campaign_name,first_name,last_name,document_type,document_number,cuil,birth_date,address,city_province,postal_code,marital_status,spouse_name,spouse_document,primary_phone,alternate_phone,email,contact_schedule,employment_status,employer_name,employment_seniority,monthly_income,automatic_debit,deferred_installment,installments_paid,installments_to_pay,plan_type,agreed_price,commercial_snapshot,prequalification:prequalification_events!commercial_applications_prequalification_event_id_fkey(campaign_id)))").eq("seller_user_id", state.userId).order("updated_at", { ascending: false }),
      supabaseClient.from("commercial_applications").select("*").eq("seller_user_id", state.userId).not("sales_case_id", "is", null).order("revision_number", { ascending: false }),
      supabaseClient.from("sales_case_events").select("id, sales_case_id, stage, outcome, comment, created_at").order("created_at", { ascending: false }).limit(500),
      supabaseClient.from("sales_notifications").select("id, sales_case_id, notification_type, title, body, read_at, created_at").eq("recipient_user_id", state.userId).order("created_at", { ascending: false }).limit(100),
      supabaseClient.from("profiles").select("user_id, full_name, seller_code, phone").eq("user_id", state.userId).single()
    ]);
    var failed = results.find(function (item) { return item.error; }); if (failed) throw failed.error;
    state.cases = results[0].data || []; state.applications = {}; (results[1].data || []).forEach(function (item) { (state.applications[item.sales_case_id] || (state.applications[item.sales_case_id] = [])).push(item); }); state.events = {}; (results[2].data || []).forEach(function (item) { (state.events[item.sales_case_id] || (state.events[item.sales_case_id] = [])).push(item); }); state.notifications = results[3].data || []; state.profile = results[4].data || null; renderSales();
  }
  function processChip(label, value) { return '<span class="' + escapeHtml(value) + '">' + escapeHtml(label + " · " + outcome(value)) + '</span>'; }
  function saleRequest(salesCase) { return one(salesCase && salesCase.sale_request); }
  function provisionalApplication(salesCase) { var request = saleRequest(salesCase); return one(request && request.provisional); }
  function renderSales() {
    var unread = state.notifications.filter(function (item) { return !item.read_at; }).length; var actionRequired = state.cases.filter(function (item) { return item.status === "minute_pending" || item.cdn_scoring_status === "observed"; }).length; var badgeCount = actionRequired || unread; var badge = document.getElementById("salesNotificationCount"); badge.textContent = badgeCount; badge.hidden = badgeCount === 0;
    document.getElementById("salesNotifications").innerHTML = state.notifications.filter(function (item) { return !item.read_at; }).map(function (item) { return '<article class="seller-notification ' + (item.notification_type === "cancelled" ? "cancelled" : "") + '" data-notification-id="' + item.id + '"><div><strong>' + escapeHtml(item.title) + '</strong><span> · ' + escapeHtml(item.body) + '</span></div><button data-read-notification type="button">×</button></article>'; }).join("");
    document.getElementById("salesTrackingList").innerHTML = state.cases.length ? state.cases.map(function (item) {
      var application = latestApplication(item.id);
      var observations = (state.events[item.id] || []).filter(function (event) { return event.outcome === "observed" && event.comment; });
      var canMinute = item.status === "minute_pending" || item.cdn_scoring_status === "observed";
      var callReady = !!item.admin_call_requested_at;
      var callCheck = application ? '<label class="admin-call-check ' + (callReady ? 'sent' : '') + '"><input data-admin-call-ready type="checkbox"' + (callReady ? ' checked disabled' : '') + '><span>' + (callReady ? 'Aviso enviado a Administración' : 'Venta lista para que Administración llame') + '</span></label>' : '';
      return '<article class="sales-tracking-card" data-sales-case-id="' + item.id + '"><div class="sales-tracking-head"><div><h3>' + escapeHtml(item.case_code + " · " + item.vehicle) + '</h3><p>' + escapeHtml(statusLabel(item.status)) + ' · actualizada ' + escapeHtml(formatDate(item.updated_at)) + '</p></div><span class="crm-stage">' + escapeHtml(item.finalized_at ? "Finalizada" : statusLabel(item.status)) + '</span></div><div class="sales-process">' + processChip("CDN", item.cdn_scoring_status) + processChip("Concesionario", item.dealer_scoring_status) + processChip("Contrato", item.contract_status) + '</div>' + observations.map(function (event) { return '<div class="seller-notification"><strong>Observación:</strong><span>' + escapeHtml(event.comment) + '</span></div>'; }).join("") + '<div class="sales-card-actions"><small>' + (application ? "Minuta enviada · versión " + application.revision_number : "La minuta todavía no fue enviada") + '</small>' + (canMinute ? '<button class="primary-button compact-button" data-open-minute type="button">' + (application ? "Corregir minuta" : "Completar minuta") + '</button>' : '') + '</div>' + callCheck + '</article>';
    }).join("") : '<div class="agenda-empty">Todavía no tenés ventas en proceso administrativo.</div>';
  }

  function one(value) { return Array.isArray(value) ? value[0] : value; }
  function campaignIdForCase(salesCase) {
    var request = saleRequest(salesCase); var provisional = provisionalApplication(salesCase); var event = provisional && one(provisional.prequalification); var quote = one(salesCase.quote);
    if (event && event.campaign_id) return event.campaign_id;
    return request && request.quote_id && quote && quote.id === request.quote_id && quote.offer_type === "savings_plan" ? quote.campaign_id : "";
  }
  async function fetchCurrentCampaign(campaignId) {
    if (!campaignId) throw new Error("La operación no tiene un plan identificado. No se puede emitir una Minuta Definitiva sin campaign_id.");
    var result = await supabaseClient.from("campaigns").select("id, plan_name, version_name, transmission, installment_count, final_price, advance_amount, installment_amount, installment_is_from, active, valid_from, valid_to, bonus, benefits, updated_at, model:models!inner(id,name,image_path,active,brand:brands!inner(name,active))").eq("id", campaignId).single();
    if (result.error || !result.data) throw new Error(result.error && result.error.message || "No se encontró la ficha actual del plan.");
    var campaign = finalMinute.normalizeCampaign(result.data); var today = new Date().toISOString().slice(0, 10); var model = one(result.data.model); var brand = model && one(model.brand);
    if (!campaign.active || !model || model.active === false || !brand || brand.active === false || (campaign.validFrom && campaign.validFrom > today) || (campaign.validTo && campaign.validTo < today)) throw new Error("La campaña asociada ya no está vigente. Administración debe revisar la ficha antes de emitir la minuta.");
    if (!campaign.brand || !campaign.model || !campaign.version || !campaign.planName || !Number.isInteger(campaign.installmentCount) || campaign.installmentCount < 2 || !Number.isFinite(campaign.finalPrice) || campaign.finalPrice <= 0 || !campaign.image) throw new Error("La ficha actual del plan está incompleta. Debe incluir marca, modelo, versión, cuotas, valor final e imagen.");
    return campaign;
  }
  function setMinuteField(name, value) { var field = minuteForm.elements[name]; if (field && value !== null && value !== undefined) field.value = String(value); }
  function campaignMoney(value, isFrom) { var label = value === null || value === undefined || value === "" ? "A confirmar" : money(value); return label === "A confirmar" ? label : (isFrom ? "Desde " : "") + label; }
  function applyStoredMinute(application) {
    if (!application) return; var seniority = parseInt(String(application.employment_seniority || "").replace(/\D/g, ""), 10);
    [["firstName", application.first_name], ["lastName", application.last_name], ["documentType", application.document_type], ["documentNumber", application.document_number], ["cuil", application.cuil], ["birthDate", finalMinute.displayDateInput(application.birth_date)], ["address", application.address], ["cityProvince", application.city_province], ["postalCode", application.postal_code], ["maritalStatus", application.marital_status], ["spouseName", application.spouse_name], ["spouseDocument", application.spouse_document], ["primaryPhone", application.primary_phone], ["alternatePhone", application.alternate_phone], ["email", application.email], ["contactSchedule", application.contact_schedule], ["employmentStatus", application.employment_status], ["employerName", application.employer_name], ["employmentSeniority", Number.isFinite(seniority) ? seniority : ""], ["monthlyIncome", application.monthly_income], ["automaticDebit", String(Boolean(application.automatic_debit))], ["deferredInstallment", String(Boolean(application.deferred_installment))], ["firstPaymentDate", finalMinute.displayDateInput(application.first_payment_date)], ["firstPaymentAmount", application.first_payment_amount], ["secondPaymentDate", finalMinute.displayDateInput(application.second_payment_date)], ["secondPaymentAmount", application.second_payment_amount]].forEach(function (item) { setMinuteField(item[0], item[1]); });
  }
  function applyProvisionalMinute(provisional) { applyStoredMinute(provisional); }
  function applyCampaign(campaign) {
    state.activeCampaign = campaign; state.activeCampaignFingerprint = finalMinute.campaignFingerprint(campaign);
    setMinuteField("brandName", campaign.brand); setMinuteField("modelName", campaign.model); setMinuteField("versionName", campaign.version); setMinuteField("planType", campaign.planDescription); setMinuteField("totalInstallments", campaign.installmentCount); setMinuteField("agreedPrice", money(campaign.finalPrice)); setMinuteField("advanceAmount", campaignMoney(campaign.advanceAmount, false)); setMinuteField("installmentAmount", campaignMoney(campaign.installmentAmount, campaign.installmentIsFrom)); setMinuteField("bonus", campaign.bonus || "No informada"); setMinuteField("installmentsPaid", 1); setMinuteField("installmentsToPay", campaign.installmentCount - 1);
    document.getElementById("salesMinuteVehicle").textContent = [campaign.brand, campaign.model, campaign.version].filter(Boolean).join(" "); document.getElementById("salesMinuteCampaign").textContent = campaign.planDescription + " · Valor final vigente " + money(campaign.finalPrice);
  }
  async function openMinute(caseId) {
    state.activeCase = state.cases.find(function (item) { return item.id === caseId; }); if (!state.activeCase) return;
    if (!(state.activeCase.status === "minute_pending" || state.activeCase.cdn_scoring_status === "observed")) return;
    var current = latestApplication(caseId); var provisional = provisionalApplication(state.activeCase); var errorBox = document.getElementById("salesMinuteError"); var button = document.getElementById("salesMinuteSubmit");
    minuteForm.reset(); applyStoredMinute(current); if (!current) applyProvisionalMinute(provisional); minuteForm.elements.applicationConsent.checked = false; button.disabled = true; document.getElementById("salesMinuteTitle").textContent = (current ? "Corregir minuta · " : "Completar minuta · ") + state.activeCase.case_code; errorBox.textContent = "Consultando la ficha vigente del plan…"; minuteDialog.showModal();
    try { applyCampaign(await fetchCurrentCampaign(campaignIdForCase(state.activeCase))); errorBox.textContent = ""; button.disabled = false; } catch (error) { state.activeCampaign = null; state.activeCampaignFingerprint = ""; errorBox.textContent = error.message; }
  }
  function digits(value) { return String(value || "").replace(/\D/g, ""); }
  function validCuil(value) {
    var clean = digits(value); if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;
    var weights = [5,4,3,2,7,6,5,4,3,2]; var sum = weights.reduce(function (total, weight, index) { return total + Number(clean[index]) * weight; }, 0); var check = 11 - sum % 11; if (check === 11) check = 0; if (check === 10) check = 9; return check === Number(clean[10]);
  }
  function readMinuteData() {
    var f = minuteForm.elements; var birthDate = finalMinute.parseDisplayDate(f.birthDate.value); var firstDate = f.firstPaymentDate.value ? finalMinute.parseDisplayDate(f.firstPaymentDate.value) : ""; var secondDate = f.secondPaymentDate.value ? finalMinute.parseDisplayDate(f.secondPaymentDate.value) : ""; var documentNumber = digits(f.documentNumber.value); var cuil = digits(f.cuil.value); var spouseDocument = digits(f.spouseDocument.value); var email = f.email.value.trim().toLowerCase(); var seniority = Number(f.employmentSeniority.value); var income = Number(f.monthlyIncome.value); var firstAmount = f.firstPaymentAmount.value === "" ? null : Number(f.firstPaymentAmount.value); var secondAmount = f.secondPaymentAmount.value === "" ? null : Number(f.secondPaymentAmount.value);
    if (f.firstName.value.trim().length < 2 || f.lastName.value.trim().length < 2) return { error: "Completá el nombre y el apellido del cliente." };
    if (!f.documentType.value || documentNumber.length < 7 || documentNumber.length > 12 || !validCuil(cuil)) return { error: "Revisá el tipo y número de documento y el CUIL informado." };
    if (!birthDate) return { error: "Ingresá una fecha de nacimiento real con formato dd/mm/aaaa." };
    var adultDate = new Date(); adultDate.setFullYear(adultDate.getFullYear() - 18); if (new Date(birthDate + "T12:00:00") > adultDate) return { error: "La minuta debe corresponder a una persona mayor de 18 años." };
    if (f.address.value.trim().length < 5 || f.cityProvince.value.trim().length < 3 || f.postalCode.value.trim().length < 3 || !f.maritalStatus.value) return { error: "Completá el domicilio, localidad/provincia, código postal y estado civil." };
    if (["Casado/a", "Conviviente"].includes(f.maritalStatus.value) && (f.spouseName.value.trim().length < 3 || spouseDocument.length < 7)) return { error: "Completá el nombre y DNI del cónyuge o conviviente." };
    if (digits(f.primaryPhone.value).length < 8 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || f.contactSchedule.value.trim().length < 3) return { error: "Revisá el teléfono, el correo y el horario de contacto." };
    if (!f.employmentStatus.value || f.employerName.value.trim().length < 2 || !Number.isInteger(seniority) || seniority < 0 || seniority > 80 || !Number.isInteger(income) || income < 1) return { error: "Revisá la situación laboral, antigüedad e ingresos mensuales." };
    if (f.automaticDebit.value === "" || f.deferredInstallment.value === "") return { error: "Indicá si corresponde débito automático y cuota diferida." };
    if ((f.firstPaymentDate.value && !firstDate) || (f.secondPaymentDate.value && !secondDate)) return { error: "Las fechas de pago deben ser reales y tener formato dd/mm/aaaa." };
    if (Boolean(firstDate) !== (firstAmount !== null) || Boolean(secondDate) !== (secondAmount !== null)) return { error: "Cada pago informado debe tener fecha e importe." };
    if ((firstAmount !== null && (!Number.isFinite(firstAmount) || firstAmount < 0)) || (secondAmount !== null && (!Number.isFinite(secondAmount) || secondAmount < 0))) return { error: "Los importes de pago deben ser números válidos mayores o iguales a cero." };
    if (!f.applicationConsent.checked) return { error: "Confirmá la lectura conjunta de la minuta y de las condiciones vigentes." };
    return { data: { firstName: f.firstName.value.trim(), lastName: f.lastName.value.trim(), documentType: f.documentType.value, documentNumber: documentNumber, cuil: cuil, birthDate: birthDate, address: f.address.value.trim(), cityProvince: f.cityProvince.value.trim(), postalCode: f.postalCode.value.trim().toUpperCase(), maritalStatus: f.maritalStatus.value, spouseName: f.spouseName.value.trim(), spouseDocument: spouseDocument, primaryPhone: f.primaryPhone.value.trim(), alternatePhone: f.alternatePhone.value.trim(), email: email, contactSchedule: f.contactSchedule.value.trim(), employmentStatus: f.employmentStatus.value, employerName: f.employerName.value.trim(), employmentSeniority: seniority, monthlyIncome: income, automaticDebit: f.automaticDebit.value === "true", deferredInstallment: f.deferredInstallment.value === "true", firstPaymentDate: firstDate || null, firstPaymentAmount: firstAmount, secondPaymentDate: secondDate || null, secondPaymentAmount: secondAmount } };
  }
  async function verifyCaseCanSubmit() {
    var result = await supabaseClient.from("sales_cases").select("id,seller_user_id,status,cdn_scoring_status").eq("id", state.activeCase.id).eq("seller_user_id", state.userId).single();
    if (result.error || !result.data || !(result.data.status === "minute_pending" || result.data.cdn_scoring_status === "observed")) throw new Error("La Minuta Definitiva solo puede emitirse después de la aprobación de Supervisión o para corregir una observación.");
  }
  async function revalidateCampaign(errorBox) {
    var previous = state.activeCampaign; var current = await fetchCurrentCampaign(campaignIdForCase(state.activeCase)); var changed = finalMinute.campaignFingerprint(current) !== state.activeCampaignFingerprint;
    if (!changed) return current;
    applyCampaign(current); minuteForm.elements.applicationConsent.checked = false;
    errorBox.textContent = "Las condiciones comerciales de este plan fueron actualizadas desde que abriste la minuta. El valor final vigente es " + money(current.finalPrice) + ". Revisá la nueva condición con el cliente y volvé a confirmar antes de continuar.";
    errorBox.dataset.previousPrice = previous ? String(previous.finalPrice) : ""; return null;
  }
  async function saveMinute(event) {
    event.preventDefault(); var errorBox = document.getElementById("salesMinuteError"); var button = document.getElementById("salesMinuteSubmit"); errorBox.textContent = ""; if (!state.activeCase || !state.activeCampaign) { errorBox.textContent = "No hay una ficha de plan válida asociada a esta operación."; return; }
    var parsed = readMinuteData(); if (parsed.error) { errorBox.textContent = parsed.error; return; }
    setBusy(button, true, "Revalidando condiciones…");
    try {
      await verifyCaseCanSubmit(); var campaign = await revalidateCampaign(errorBox); if (!campaign) { setBusy(button, false); return; }
      var data = parsed.data; var applications = state.applications[state.activeCase.id] || []; var previous = latestApplication(state.activeCase.id); var revision = Math.max(0, ...applications.map(function (item) { return Number(item.revision_number); })) + 1; var provisional = provisionalApplication(state.activeCase); var prequalificationCode = provisional && provisional.request_code || ""; var now = new Date().toISOString(); var snapshot = finalMinute.commercialSnapshot(campaign, { caseCode: state.activeCase.case_code, prequalificationCode: prequalificationCode, sellerName: state.profile && state.profile.full_name, sellerCode: state.profile && state.profile.seller_code, sellerPhone: state.profile && state.profile.phone });
      var payload = { prequalification_event_id: null, sales_case_id: state.activeCase.id, revision_number: revision, supersedes_application_id: previous && previous.id || null, seller_user_id: state.userId, request_code: state.activeCase.case_code + "-R" + revision, brand_name: campaign.brand, model_name: campaign.model, campaign_name: campaign.planDescription, first_name: data.firstName, last_name: data.lastName, document_type: data.documentType, document_number: data.documentNumber, cuil: data.cuil, birth_date: data.birthDate, address: data.address, city_province: data.cityProvince, postal_code: data.postalCode, marital_status: data.maritalStatus, spouse_name: data.spouseName || null, spouse_document: data.spouseDocument || null, primary_phone: data.primaryPhone, alternate_phone: data.alternatePhone || null, email: data.email, contact_schedule: data.contactSchedule, employment_status: data.employmentStatus, employer_name: data.employerName, employment_seniority: String(data.employmentSeniority), monthly_income: data.monthlyIncome, automatic_debit: data.automaticDebit, deferred_installment: data.deferredInstallment, installments_paid: 1, installments_to_pay: campaign.installmentCount - 1, plan_type: campaign.planDescription, agreed_price: campaign.finalPrice, first_payment_date: data.firstPaymentDate, first_payment_amount: data.firstPaymentAmount, second_payment_date: data.secondPaymentDate, second_payment_amount: data.secondPaymentAmount, status: "submitted", terms_version: "GS-MINUTA-2026-01", confirmed_at: now, submitted_at: now, commercial_snapshot: snapshot };
      button.textContent = "Guardando…"; var result = await supabaseClient.from("commercial_applications").insert(payload).select("*").single();
      if (result.error) { var refreshed = await fetchCurrentCampaign(campaignIdForCase(state.activeCase)); if (finalMinute.campaignFingerprint(refreshed) !== state.activeCampaignFingerprint) { applyCampaign(refreshed); minuteForm.elements.applicationConsent.checked = false; errorBox.textContent = "La ficha del plan cambió justo antes de guardar. Actualizamos la minuta con el valor vigente " + money(refreshed.finalPrice) + ". Revisalo con el cliente y confirmá nuevamente."; } else errorBox.textContent = result.error.message; setBusy(button, false); return; }
      minuteDialog.close(); finalMinute.print(document.getElementById("minutePrint"), finalMinute.fromApplication(result.data, { caseCode: state.activeCase.case_code, seller: state.profile })); await loadSales(); setBusy(button, false);
    } catch (error) { errorBox.textContent = error.message || "No se pudo guardar la Minuta Definitiva."; setBusy(button, false); }
  }

  async function markRead(id) { var result = await supabaseClient.from("sales_notifications").update({ read_at: new Date().toISOString() }).eq("id", id); if (!result.error) loadSales(); }
  async function requestAdminCall(caseId, checkbox) {
    var message = document.getElementById("salesActionMessage");
    message.textContent = ""; message.classList.remove("error"); checkbox.disabled = true;
    var result = await supabaseClient.rpc("request_admin_sales_call", { p_sales_case_id: caseId });
    if (result.error) { checkbox.checked = false; checkbox.disabled = false; message.textContent = result.error.message; message.classList.add("error"); return; }
    message.textContent = "Administración recibió el aviso para llamar al cliente.";
    await loadSales();
  }
  document.getElementById("newQuoteButton").addEventListener("click", function () { openQuote(); });
  document.getElementById("crmBudgetButton").addEventListener("click", function () { var active = window.grupoSurCRM && window.grupoSurCRM.getActiveLead ? window.grupoSurCRM.getActiveLead() : null; if (active) openQuote(active.id); });
  document.getElementById("crmBudgetFromManagement").addEventListener("click", function () { var active = window.grupoSurCRM && window.grupoSurCRM.getActiveLead ? window.grupoSurCRM.getActiveLead() : null; if (active) openQuote(active.id); });
  document.getElementById("quoteModel").addEventListener("change", populateOffers); document.getElementById("quoteOfferType").addEventListener("change", populateOffers); document.getElementById("quoteOffer").addEventListener("change", configureOffer);
  document.getElementById("quoteOfferCards").addEventListener("click", function (event) { var card = event.target.closest("[data-quote-offer]"); if (!card) return; quoteForm.elements.offerId.value = card.dataset.quoteOffer; configureOffer(); });
  document.getElementById("quoteVersion").addEventListener("change", function () { if (quoteForm.elements.offerType.value === "bank_credit") applySuggestedPrice(); calculateQuote(); });
  quoteForm.elements.salePrice.addEventListener("input", calculateQuote);
  quoteForm.elements.financedAmount.addEventListener("input", function () { var range = document.getElementById("quoteFinancedRange"); var value = Number(this.value || 0); if (value >= Number(range.min) && value <= Number(range.max)) range.value = value; calculateQuote(); });
  document.getElementById("quoteFinancedRange").addEventListener("input", function () { quoteForm.elements.financedAmount.value = this.value; calculateQuote(); });
  document.getElementById("quoteClose").addEventListener("click", function () { quoteDialog.close(); }); document.getElementById("quoteCancel").addEventListener("click", function () { quoteDialog.close(); }); quoteDialog.addEventListener("click", function (event) { if (event.target === quoteDialog) quoteDialog.close(); }); quoteForm.addEventListener("submit", saveQuote);
  document.getElementById("quotesList").addEventListener("click", function (event) { var card = event.target.closest("[data-quote-id]"); if (card && event.target.closest("[data-print-quote]")) { var item = state.quotes.find(function (row) { return row.id === card.dataset.quoteId; }); if (item) printQuote(item); } });
  document.getElementById("refreshSalesButton").addEventListener("click", function () { var button = this; setBusy(button, true, "Actualizando…"); loadSales().finally(function () { setBusy(button, false); }); });
  document.getElementById("salesTrackingList").addEventListener("click", function (event) { var card = event.target.closest("[data-sales-case-id]"); if (card && event.target.closest("[data-open-minute]")) openMinute(card.dataset.salesCaseId); });
  document.getElementById("salesTrackingList").addEventListener("change", function (event) { var checkbox = event.target.closest("[data-admin-call-ready]"); var card = event.target.closest("[data-sales-case-id]"); if (checkbox && card && checkbox.checked) requestAdminCall(card.dataset.salesCaseId, checkbox); });
  document.getElementById("salesNotifications").addEventListener("click", function (event) { var item = event.target.closest("[data-notification-id]"); if (item && event.target.closest("[data-read-notification]")) markRead(item.dataset.notificationId); }); minuteForm.addEventListener("submit", saveMinute);
  ["birthDate", "firstPaymentDate", "secondPaymentDate"].forEach(function (name) { minuteForm.elements[name].addEventListener("input", function () { finalMinute.maskDateInput(this); }); });
  minuteForm.querySelector(".crm-dialog-close").addEventListener("click", function () { minuteDialog.close(); });
  window.grupoSurSales = { loadQuotes: loadQuotes, loadSales: loadSales, openQuote: openQuote, refreshNotifications: loadSales };
  supabaseClient.auth.onAuthStateChange(function (event, session) { if (session && session.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) { state.userId = session.user.id; loadSales(); } });
}());
