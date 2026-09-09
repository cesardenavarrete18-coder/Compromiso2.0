(function () {
  "use strict";

  var supabaseClient = window.grupoSurSupabaseClient;
  var core = window.grupoSurCreditApplicability;
  var form = document.getElementById("quoteForm");
  if (!supabaseClient || !core || !form) return;

  var state = { models: [], offers: [], loaded: false, loading: null };
  var offerType = document.getElementById("quoteOfferType");
  var modelSelect = document.getElementById("quoteModel");
  var offerSelect = document.getElementById("quoteOffer");
  var versionSelect = document.getElementById("quoteVersion");
  var cards = document.getElementById("quoteOfferCards");
  var errorBox = document.getElementById("quoteError");
  var range = document.getElementById("quoteFinancedRange");

  function escapeHtml(value) { return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  function money(value) { return value == null || value === "" ? "A confirmar" : "$" + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Number(value)); }
  function formatDate(value) { return value ? new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—"; }
  function isBank() { return offerType.value === "bank_credit"; }
  function todayKey() { return new Date().toISOString().slice(0, 10); }
  function validOffer(item) { var today = todayKey(); return item.active !== false && (!item.valid_from || item.valid_from <= today) && (!item.valid_to || item.valid_to >= today); }
  function modelById(id) { return state.models.find(function (model) { return model.id === id; }) || null; }
  function selectedModel() { return modelById(modelSelect.value); }
  function selectedOffer() { return state.offers.find(function (offer) { return offer.id === offerSelect.value; }) || null; }
  function brandOf(model) { var brand = model && model.brand; return Array.isArray(brand) ? brand[0] : brand; }
  function offerName(offer) { return offer.financier_name + " · " + offer.offer_name + " · " + offer.term_months + " cuotas"; }
  function quoteCode() { return "GS-PRES-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(); }

  async function loadData(force) {
    if (state.loaded && !force) return;
    if (state.loading && !force) return state.loading;
    state.loading = Promise.all([
      supabaseClient.from("models").select("id,name,image_path,sort_order,active,brand:brands!inner(name,sort_order)").eq("active", true).order("sort_order"),
      supabaseClient.from("bank_credit_offers").select("id,model_id,financier_name,offer_name,term_months,min_financed_amount,max_financed_amount,installment_coefficient,breakage_rate,patenting_rate,fixed_expenses,tna,cftea,notes,active,valid_from,valid_to,sort_order,versions:bank_credit_offer_versions(version:model_versions(id,model_id,name,suggested_price,active))").eq("active", true).order("sort_order")
    ]).then(function (results) {
      var failed = results.find(function (item) { return item.error; }); if (failed) throw failed.error;
      state.models = results[0].data || [];
      state.offers = results[1].data || [];
      state.loaded = true;
    }).finally(function () { state.loading = null; });
    return state.loading;
  }

  function applicableOffers() {
    var modelId = modelSelect.value;
    return state.offers.filter(function (offer) { return validOffer(offer) && core.offerAppliesToModel(offer, modelId); });
  }

  function renderOffers() {
    var list = applicableOffers();
    offerSelect.innerHTML = list.length ? list.map(function (offer) { return '<option value="' + offer.id + '">' + escapeHtml(offerName(offer)) + '</option>'; }).join("") : '<option value="">No hay condiciones cargadas para este modelo</option>';
    document.getElementById("quoteOfferCount").textContent = list.length + (list.length === 1 ? " opción" : " opciones");
    cards.innerHTML = list.length ? list.map(function (offer, index) {
      var versions = core.activeVersionsForModel(offer, modelSelect.value);
      var coefficient = Number(offer.installment_coefficient || 0) * 1000;
      var detail = money(offer.min_financed_amount || 0) + " a " + money(offer.max_financed_amount || 0);
      return '<button class="quote-offer-card' + (index === 0 ? ' is-selected' : '') + '" type="button" data-quote-offer="' + offer.id + '"><span class="quote-offer-badge">' + escapeHtml(offer.financier_name) + '</span><strong>' + escapeHtml(offer.offer_name) + '</strong><small>' + escapeHtml(offer.term_months + " cuotas · " + versions.length + (versions.length === 1 ? " versión" : " versiones")) + '</small><div><span>$' + escapeHtml(new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(coefficient)) + ' cada $1.000</span><span>' + escapeHtml(detail) + '</span></div><em>Seleccionar propuesta →</em></button>';
    }).join("") : '<div class="quote-offers-empty">No hay condiciones vigentes para este modelo y sus versiones.</div>';
    configureOffer();
  }

  function selectedVersion() {
    var offer = selectedOffer();
    if (!offer) return null;
    return core.activeVersionsForModel(offer, modelSelect.value).find(function (version) { return version.id === versionSelect.value; }) || null;
  }

  function configureOffer() {
    var offer = selectedOffer();
    var model = selectedModel();
    document.querySelectorAll("[data-bank-field]").forEach(function (field) { field.hidden = false; });
    document.querySelectorAll("[data-quote-offer]").forEach(function (card) { card.classList.toggle("is-selected", Boolean(offer && card.getAttribute("data-quote-offer") === offer.id)); });
    document.getElementById("quoteConfigurator").hidden = !offer;
    if (!offer) { calculate(); return; }
    var versions = core.activeVersionsForModel(offer, modelSelect.value);
    versionSelect.innerHTML = versions.length ? versions.map(function (version) { return '<option value="' + version.id + '">' + escapeHtml(version.name) + '</option>'; }).join("") : '<option value="">No hay versiones habilitadas</option>';
    document.getElementById("quoteModelImage").src = model && model.image_path || "../assets/logo-header.webp";
    document.getElementById("quoteModelImage").alt = model ? model.name : "Vehículo";
    document.getElementById("quoteSelectedType").textContent = "Crédito de terminal";
    document.getElementById("quoteSelectedTitle").textContent = offerName(offer);
    document.getElementById("quoteSelectedMeta").textContent = "Financiación entre " + money(offer.min_financed_amount || 0) + " y " + money(offer.max_financed_amount || 0);
    document.getElementById("quoteSelectedNotes").textContent = offer.notes || "Sin notas adicionales.";
    form.elements.salePrice.readOnly = false;
    applySuggestedPrice();
    document.getElementById("quotePriceHelp").textContent = "Precio sugerido por administración. Podés ajustarlo para esta operación.";
    configureFinancedRange();
    calculate();
  }

  function applySuggestedPrice() {
    var version = selectedVersion();
    if (version && version.suggested_price != null) form.elements.salePrice.value = version.suggested_price;
  }

  function configureFinancedRange() {
    var offer = selectedOffer(); if (!offer) return;
    var price = Number(form.elements.salePrice.value || 0);
    var minimum = Number(offer.min_financed_amount || 0);
    var maximum = offer.max_financed_amount == null ? price : Number(offer.max_financed_amount);
    if (price > 0) maximum = Math.min(maximum || price, price);
    maximum = Math.max(minimum, maximum || minimum);
    range.min = minimum; range.max = maximum; range.step = 100000;
    var current = Number(form.elements.financedAmount.value || minimum);
    current = Math.min(maximum, Math.max(minimum, current));
    range.value = current;
    form.elements.financedAmount.min = minimum; form.elements.financedAmount.max = maximum; form.elements.financedAmount.step = 100000; form.elements.financedAmount.value = current;
    document.getElementById("quoteFinancedMin").textContent = money(minimum);
    document.getElementById("quoteFinancedMax").textContent = money(maximum);
  }

  function values() {
    var offer = selectedOffer();
    var price = Number(form.elements.salePrice.value || 0);
    if (!offer || !price) return null;
    var financed = Number(form.elements.financedAmount.value || 0);
    var advance = Math.max(0, price - financed);
    var breakageBase = financed * Number(offer.breakage_rate || 0) / 100;
    var breakageVat = breakageBase * 0.21;
    var breakage = breakageBase + breakageVat;
    var patenting = price * Number(offer.patenting_rate || 0) / 100;
    var expenses = Number(offer.fixed_expenses || 0);
    return { price: price, financed: financed, advance: advance, breakageBase: breakageBase, breakageVat: breakageVat, breakage: breakage, patenting: patenting, expenses: expenses, finalAdvance: advance + breakage + patenting + expenses, installment: financed * Number(offer.installment_coefficient), term: offer.term_months };
  }

  function calculate() {
    var data = values();
    document.getElementById("quoteFinancedDisplay").textContent = money(form.elements.financedAmount.value || 0);
    document.getElementById("quoteCalculation").innerHTML = data ? [["Anticipo base", data.advance], ["Quebranto base", data.breakageBase], ["IVA s/quebranto", data.breakageVat], ["Quebranto total", data.breakage], ["Patentamiento", data.patenting], ["Gastos", data.expenses], ["Anticipo final", data.finalAdvance], ["Cuota", data.installment]].map(function (row) { return '<div><span>' + row[0] + '</span><strong>' + escapeHtml(money(row[1])) + '</strong></div>'; }).join("") : '<div><span>Completá precio y condición</span><strong>—</strong></div>';
  }

  function snapshot(offer, model, version) {
    var brand = brandOf(model);
    return {
      brand: brand && brand.name || "",
      model: model && model.name || "",
      model_image: model && model.image_path || "",
      offer_name: offer.offer_name || "",
      financier: offer.financier_name || "",
      final_price: null,
      suggested_price: version && version.suggested_price != null ? Number(version.suggested_price) : null,
      tna: offer.tna || null,
      cftea: offer.cftea || null,
      coefficient: offer.installment_coefficient || null,
      installment_per_thousand: offer.installment_coefficient == null ? null : Number(offer.installment_coefficient) * 1000,
      breakage_rate: offer.breakage_rate || 0,
      breakage_vat_rate: 21,
      patenting_rate: offer.patenting_rate || 0,
      benefits: [],
      bonus: "",
      notes: offer.notes || ""
    };
  }

  function setBusy(busy) {
    var button = document.getElementById("quoteSubmit");
    if (busy) { button.dataset.creditLabel = button.textContent; button.textContent = "Guardando…"; button.disabled = true; }
    else { button.textContent = button.dataset.creditLabel || "Guardar y generar PDF"; button.disabled = false; }
  }

  function printQuote(item) {
    var snap = item.commercial_snapshot || {};
    var vehicle = [snap.brand, snap.model, item.vehicle_version].filter(Boolean).join(" ");
    var condition = [snap.financier, snap.offer_name].filter(Boolean).join(" · ");
    var rows = [["Precio de venta", money(item.sale_price)], ["Anticipo base", money(item.advance_amount)], ["Anticipo final", money(item.final_advance_amount)], ["Cantidad de cuotas", item.term_months], ["Valor de cuota", money(item.installment_amount)], ["Monto financiado", money(item.financed_amount)], ["Quebranto base", money(item.breakage_base_amount || 0)], ["IVA sobre quebranto", money(item.breakage_vat_amount || 0)], ["Quebranto total", money(item.breakage_amount)], ["Patentamiento", money(item.patenting_amount)], ["Gastos", money(item.expenses_amount)], ["TNA", snap.tna == null ? "No informada" : snap.tna + "%"], ["CFTEA", snap.cftea == null ? "No informado" : snap.cftea + "%"]];
    var print = document.getElementById("minutePrint");
    print.innerHTML = '<article class="minute-sheet commercial-quote-sheet"><header class="minute-header"><div class="minute-header-brand"><img class="minute-company-logo" src="../assets/logo-header.webp" alt="Grupo Sur Automotores"><span>Propuesta comercial</span></div><div class="minute-identifiers"><strong>' + escapeHtml(item.quote_code) + '</strong><span>Emitida: ' + escapeHtml(formatDate(item.issued_at)) + '</span></div></header><section class="quote-print-hero">' + (snap.model_image ? '<img src="' + escapeHtml(snap.model_image) + '" alt="' + escapeHtml(vehicle) + '">' : '') + '<div><span>Crédito de terminal</span><h1>' + escapeHtml(vehicle) + '</h1><p>' + escapeHtml(condition) + '</p></div></section><section class="quote-customer-strip"><div><span>Cliente</span><strong>' + escapeHtml(item.customer_name) + '</strong></div><div><span>Vigencia</span><strong>' + escapeHtml(formatDate(item.valid_until)) + '</strong></div></section><section class="minute-print-section"><h2>Detalle de la propuesta</h2><div class="minute-data-grid three-columns">' + rows.map(function (row) { return '<div><span>' + escapeHtml(row[0]) + '</span><strong>' + escapeHtml(String(row[1] == null ? "—" : row[1])) + '</strong></div>'; }).join("") + '</div></section>' + (snap.notes ? '<section class="minute-print-section quote-legal"><h2>Notas de la financiación</h2><p>' + escapeHtml(snap.notes) + '</p></section>' : '') + '<section class="minute-print-section quote-legal"><h2>Información importante</h2><p>El precio de venta puede haber sido ajustado por el vendedor para esta operación. El quebranto informado incluye IVA del 21% aplicado únicamente sobre el quebranto base. Propuesta informativa sujeta a vigencia, disponibilidad, aprobación crediticia y condiciones definitivas de la terminal o concesionario.</p></section><div class="minute-signatures"><div>Firma del cliente</div><div>Aclaración y DNI</div><div>Asesor responsable</div></div><footer class="minute-footer">Documento emitido desde el portal interno de Grupo Sur Automotores</footer></article>';
    print.setAttribute("aria-hidden", "false");
    document.body.classList.add("printing-minute");
    window.print();
    document.body.classList.remove("printing-minute");
    print.setAttribute("aria-hidden", "true");
  }

  async function save(event) {
    event.preventDefault(); event.stopImmediatePropagation();
    errorBox.textContent = "";
    var offer = selectedOffer(); var model = selectedModel(); var version = selectedVersion(); var data = values();
    if (!offer || !model || !version || !data || data.price <= 0) { errorBox.textContent = "Completá el Lead, modelo, crédito, versión y precio de venta."; return; }
    if (!core.offerAppliesToModel(offer, model.id) || version.model_id !== model.id) { errorBox.textContent = "La versión elegida no está habilitada para este crédito y modelo."; return; }
    if (data.financed <= 0 || data.financed > data.price) { errorBox.textContent = "El monto financiado debe ser mayor a cero y no superar el precio."; return; }
    if ((offer.min_financed_amount && data.financed < Number(offer.min_financed_amount)) || (offer.max_financed_amount && data.financed > Number(offer.max_financed_amount))) { errorBox.textContent = "El monto financiado está fuera del rango habilitado para esta línea."; return; }
    var leadId = form.elements.leadId.value;
    var validUntil = form.elements.validUntil.value;
    if (!leadId || !validUntil) { errorBox.textContent = "Seleccioná Lead y vigencia."; return; }
    setBusy(true);
    try {
      var auth = await supabaseClient.auth.getUser();
      var userId = auth.data && auth.data.user && auth.data.user.id;
      if (!userId) throw new Error("La sesión del vendedor venció.");
      var leadResult = await supabaseClient.from("leads").select("id,assigned_seller_user_id,customer_name").eq("id", leadId).single();
      if (leadResult.error) throw leadResult.error;
      if (!leadResult.data || leadResult.data.assigned_seller_user_id !== userId) throw new Error("Este Lead ya no está asignado a tu usuario.");
      var insert = await supabaseClient.from("sales_quotes").insert({
        quote_code: quoteCode(),
        lead_id: leadId,
        seller_user_id: userId,
        model_id: model.id,
        campaign_id: null,
        bank_credit_offer_id: offer.id,
        offer_type: "bank_credit",
        customer_name: leadResult.data.customer_name || "Cliente sin nombre",
        vehicle_version: version.name,
        sale_price: data.price,
        financed_amount: data.financed,
        term_months: data.term,
        installment_amount: data.installment,
        advance_amount: data.advance,
        breakage_base_amount: data.breakageBase,
        breakage_vat_amount: data.breakageVat,
        breakage_amount: data.breakage,
        patenting_amount: data.patenting,
        expenses_amount: data.expenses,
        final_advance_amount: data.finalAdvance,
        valid_until: validUntil + "T23:59:59-03:00",
        commercial_snapshot: snapshot(offer, model, version)
      }).select("*").single();
      if (insert.error) throw insert.error;
      document.getElementById("quoteDialog").close();
      printQuote(insert.data);
      window.setTimeout(function () { window.location.reload(); }, 50);
    } catch (error) {
      errorBox.textContent = error.message || "No se pudo guardar el presupuesto.";
      setBusy(false);
    }
  }

  offerType.addEventListener("change", async function (event) {
    if (!isBank()) return;
    event.stopImmediatePropagation();
    try { await loadData(false); renderOffers(); } catch (error) { errorBox.textContent = error.message; }
  }, true);

  modelSelect.addEventListener("change", function (event) {
    if (!isBank()) return;
    event.stopImmediatePropagation();
    renderOffers();
  }, true);

  offerSelect.addEventListener("change", function (event) {
    if (!isBank()) return;
    event.stopImmediatePropagation();
    configureOffer();
  }, true);

  cards.addEventListener("click", function (event) {
    if (!isBank()) return;
    var card = event.target.closest("[data-quote-offer]"); if (!card) return;
    event.preventDefault(); event.stopImmediatePropagation();
    offerSelect.value = card.getAttribute("data-quote-offer");
    configureOffer();
  }, true);

  versionSelect.addEventListener("change", function (event) {
    if (!isBank()) return;
    event.stopImmediatePropagation(); applySuggestedPrice(); configureFinancedRange(); calculate();
  }, true);

  form.elements.salePrice.addEventListener("input", function (event) {
    if (!isBank()) return;
    event.stopImmediatePropagation(); configureFinancedRange(); calculate();
  }, true);

  form.elements.financedAmount.addEventListener("input", function (event) {
    if (!isBank()) return;
    event.stopImmediatePropagation(); range.value = form.elements.financedAmount.value || 0; calculate();
  }, true);

  range.addEventListener("input", function (event) {
    if (!isBank()) return;
    event.stopImmediatePropagation(); form.elements.financedAmount.value = range.value; calculate();
  }, true);

  form.addEventListener("submit", function (event) { if (isBank()) save(event); }, true);
}());
