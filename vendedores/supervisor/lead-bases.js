(function () {
  "use strict";

  var supabaseClient = window.grupoSurSupabaseClient;
  if (!supabaseClient) return;
  var state = { rows: [], file: null, recalls: [], recallPanels: [], sellers: [], submissions: [], loading: false };

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char];
    });
  }

  function normalizeHeader(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  function dateToIso(value) {
    if (!value) return new Date().toISOString();
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value === "number" && window.XLSX) {
      var parsed = window.XLSX.SSF.parse_date_code(value);
      if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, 12)).toISOString();
    }
    var text = String(value).trim();
    var ar = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (ar) return new Date(Date.UTC(Number(ar[3]), Number(ar[2]) - 1, Number(ar[1]), 12)).toISOString();
    var date = new Date(text);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  function normalizeArgentineMobilePhone(value) {
    var digits = String(value == null ? "" : value).replace(/\D/g, "");
    if (digits.indexOf("00") === 0) digits = digits.slice(2);
    if (/^0\d{10}$/.test(digits)) digits = digits.slice(1);
    if (/^\d{10}$/.test(digits)) return "549" + digits;
    if (/^9\d{10}$/.test(digits)) return "54" + digits;
    if (/^54\d{10}$/.test(digits)) return "549" + digits.slice(2);
    return digits;
  }

  function canonicalRow(row) {
    var normalized = {};
    Object.keys(row).forEach(function (key) { normalized[normalizeHeader(key)] = row[key]; });
    return {
      name: normalized.nombre_y_apellido || normalized.nombre || normalized.cliente || "",
      phone: normalizeArgentineMobilePhone(normalized.telefono || normalized.celular || normalized.whatsapp || ""),
      model_interest: normalized.modelo_de_interes || normalized.modelo_interes || normalized.modelo || "",
      source_detail: normalized.origen || normalized.fuente || "Importación Excel",
      original_inquiry_at: dateToIso(normalized.fecha_de_consulta || normalized.fecha_consulta || normalized.fecha || ""),
      summary: normalized.observaciones || normalized.comentario || normalized.resumen || ""
    };
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
  }

  function monthKey(value) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit" }).format(new Date(value));
  }

  function monthLabel(value) {
    var parts = value.split("-");
    var date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, 1));
    var month = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", month: "short" }).format(date).replace(".", "");
    return month.charAt(0).toUpperCase() + month.slice(1) + "-" + parts[0].slice(-2);
  }

  function setBusy(button, busy, text) {
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? text : button.dataset.label;
  }

  function renderPreview() {
    var target = document.getElementById("leadImportPreview");
    if (!state.rows.length) {
      target.innerHTML = '<div class="sales-empty">El archivo no contiene filas reconocibles.</div>';
      document.getElementById("leadImportConfirm").disabled = true;
      return;
    }
    var valid = state.rows.filter(function (row) { return String(row.name).trim().length >= 2 && String(row.phone).replace(/\D/g, "").length >= 6; }).length;
    target.innerHTML = '<div class="import-summary"><span>' + state.rows.length + ' filas</span><span>' + valid + ' válidas</span><span>' + (state.rows.length - valid) + ' para revisar</span></div>' +
      '<table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Modelo</th><th>Origen</th><th>Consulta original</th><th>Observaciones</th></tr></thead><tbody>' +
      state.rows.slice(0, 12).map(function (row) {
        return '<tr><td>' + escapeHtml(row.name) + '</td><td>' + escapeHtml(row.phone) + '</td><td>' + escapeHtml(row.model_interest || "—") + '</td><td>' + escapeHtml(row.source_detail) + '</td><td>' + escapeHtml(formatDate(row.original_inquiry_at)) + '</td><td>' + escapeHtml(row.summary || "—") + '</td></tr>';
      }).join("") + '</tbody></table>' + (state.rows.length > 12 ? '<small>Vista previa de las primeras 12 filas.</small>' : '');
    document.getElementById("leadImportConfirm").disabled = valid === 0;
  }

  async function readWorkbook(file) {
    var buffer = await file.arrayBuffer();
    var workbook = window.XLSX.read(buffer, { type: "array", cellDates: true });
    var sheet = workbook.Sheets[workbook.SheetNames[0]];
    var sourceRows = window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
    state.rows = sourceRows.map(canonicalRow).filter(function (row) { return Object.values(row).some(Boolean); });
    state.file = file;
    renderPreview();
  }

  function downloadTemplate() {
    var sample = [
      ["Nombre y apellido", "Teléfono", "Modelo de interés", "Origen", "Fecha de consulta", "Observaciones"],
      ["Ejemplo Cliente", "+54 11 5555-5555", "Volkswagen Amarok", "Meta Ads", "15/08/2026", "Consulta por financiación"]
    ];
    var workbook = window.XLSX.utils.book_new();
    var sheet = window.XLSX.utils.aoa_to_sheet(sample);
    sheet["!cols"] = [{ wch: 28 }, { wch: 20 }, { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 44 }];
    window.XLSX.utils.book_append_sheet(workbook, sheet, "Leads");
    window.XLSX.writeFile(workbook, "Plantilla_base_leads_Grupo_Sur.xlsx");
  }

  async function importRows() {
    var button = document.getElementById("leadImportConfirm");
    var message = document.getElementById("leadImportMessage");
    message.textContent = "";
    var validRows = state.rows.filter(function (row) { return String(row.name).trim().length >= 2 && String(row.phone).replace(/\D/g, "").length >= 6; });
    if (!state.file || !validRows.length) return;
    setBusy(button, true, "Importando…");
    var result = await supabaseClient.rpc("import_lead_rows", { p_base_type: document.getElementById("leadImportType").value, p_file_name: state.file.name, p_rows: state.rows });
    if (result.error) {
      message.textContent = result.error.message;
      message.classList.add("error");
    } else {
      var summary = result.data || {};
      message.textContent = "Importación finalizada: " + (summary.created || 0) + " creados, " + (summary.merged || 0) + " agregados al historial y " + (summary.rejected || 0) + " rechazados.";
      message.classList.remove("error");
      state.rows = []; state.file = null; document.getElementById("leadImportFile").value = ""; renderPreview();
      await loadBases();
    }
    setBusy(button, false);
  }

  function filteredRecalls() {
    var month = document.getElementById("recallMonthFilter").value;
    var model = document.getElementById("recallModelFilter").value;
    return state.recalls.filter(function (item) {
      return item.status === "available" && new Date(item.available_at).getTime() <= Date.now() && (!month || monthKey(item.original_inquiry_at) === month) && (!model || item.model_interest === model);
    });
  }

  function renderRecallFilters() {
    var currentMonth = document.getElementById("recallMonthFilter").value;
    var months = Array.from(new Set(state.recalls.map(function (item) { return monthKey(item.original_inquiry_at); }))).sort().reverse();
    document.getElementById("recallMonthFilter").innerHTML = months.map(function (value) { return '<option value="' + value + '">' + escapeHtml(monthLabel(value)) + '</option>'; }).join("") || '<option value="">Sin meses disponibles</option>';
    if (months.includes(currentMonth)) document.getElementById("recallMonthFilter").value = currentMonth;
    var currentModel = document.getElementById("recallModelFilter").value;
    var models = Array.from(new Set(state.recalls.map(function (item) { return item.model_interest; }).filter(Boolean))).sort(function (a, b) { return a.localeCompare(b, "es"); });
    document.getElementById("recallModelFilter").innerHTML = '<option value="">Todos los modelos</option>' + models.map(function (value) { return '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + '</option>'; }).join("");
    if (models.includes(currentModel)) document.getElementById("recallModelFilter").value = currentModel;
    document.getElementById("recallSeller").innerHTML = '<option value="">Seleccionar vendedor</option>' + state.sellers.map(function (seller) { return '<option value="' + seller.user_id + '">' + escapeHtml(seller.full_name + " · " + seller.seller_code) + '</option>'; }).join("");
  }

  function renderRecalls() {
    var items = filteredRecalls();
    var quantity = Math.max(1, Number(document.getElementById("recallQuantity").value || 1));
    document.getElementById("recallAvailableCount").textContent = items.length + (items.length === 1 ? " disponible" : " disponibles");
    document.getElementById("recallSupervisorList").innerHTML = items.length ? items.map(function (item, index) {
      return '<article class="recall-row"><input data-recall-check type="checkbox" value="' + item.id + '"' + (index < quantity ? ' checked' : '') + '><div><strong>' + escapeHtml(item.customer_name) + '</strong><small>+' + escapeHtml(item.customer_phone) + '</small></div><div><strong>' + escapeHtml(item.model_interest || "Modelo a definir") + '</strong><small>' + escapeHtml(item.source_detail || "Base histórica") + '</small></div><div><strong>' + escapeHtml(monthLabel(monthKey(item.original_inquiry_at))) + '</strong><small>Consulta ' + escapeHtml(formatDate(item.original_inquiry_at)) + '</small></div><span>' + item.attempt_count + '/2 llamadas</span></article>';
    }).join("") : '<div class="sales-empty">No hay rellamados disponibles para estos filtros.</div>';
  }

  function renderRecallPanels() {
    var target = document.getElementById("recallPanelHistory");
    document.getElementById("recallPanelCount").textContent = state.recallPanels.length + (state.recallPanels.length === 1 ? " panel" : " paneles");
    target.innerHTML = state.recallPanels.length ? state.recallPanels.map(function (panel) {
      var seller = Array.isArray(panel.seller) ? panel.seller[0] : panel.seller;
      var closed = panel.status === "closed";
      var total = Number(panel.total_items || 0);
      var completed = Number(panel.completed_items || 0);
      var percent = total ? Math.round(completed * 100 / total) : 0;
      return '<article class="recall-panel-history-row"><div><span>Panel #' + panel.panel_number + '</span><strong>' + escapeHtml(seller && seller.full_name || "Vendedor") + '</strong><small>Creado el ' + escapeHtml(formatDate(panel.created_at)) + '</small></div><div class="recall-panel-history-progress"><div><span style="width:' + percent + '%"></span></div><small>' + completed + ' de ' + total + ' tareas completas</small></div><span class="recall-panel-history-status ' + panel.status + '">' + (closed ? "Finalizado" : "En curso") + '</span></article>';
    }).join("") : '<div class="sales-empty">Todavía no se generaron paneles de rellamados.</div>';
  }

  function renderSubmissions() {
    document.getElementById("sellerSubmissionCount").textContent = state.submissions.length + (state.submissions.length === 1 ? " pendiente" : " pendientes");
    document.getElementById("sellerSubmissionList").innerHTML = state.submissions.length ? state.submissions.map(function (item) {
      var seller = Array.isArray(item.seller) ? item.seller[0] : item.seller;
      return '<article class="seller-submission-row" data-submission-id="' + item.id + '"><div><strong>' + escapeHtml(item.customer_name) + '</strong><small>+' + escapeHtml(item.customer_phone) + '</small></div><div><strong>' + escapeHtml(item.model_interest || "Modelo a definir") + '</strong><small>' + escapeHtml(item.source_detail || "Origen no indicado") + '</small></div><div><strong>' + escapeHtml(seller && seller.full_name || "Vendedor") + '</strong><small>' + escapeHtml(item.summary || "Sin comentario") + '</small></div><div class="submission-actions"><button class="button secondary reject" data-review-submission="reject" type="button">Rechazar</button><button class="button primary" data-review-submission="approve" type="button">Aprobar</button></div></article>';
    }).join("") : '<div class="sales-empty">No hay propuestas pendientes de revisión.</div>';
  }

  async function loadBases() {
    if (state.loading) return;
    state.loading = true;
    var results = await Promise.all([
      supabaseClient.from("lead_recall_items").select("id, customer_name, customer_phone, model_interest, source_detail, original_inquiry_at, available_at, status, attempt_count, assigned_seller_user_id").in("status", ["available", "assigned", "working"]).order("original_inquiry_at", { ascending: false }).limit(5000),
      supabaseClient.from("profiles").select("user_id, full_name, seller_code").eq("role", "seller").eq("active", true).order("full_name"),
      supabaseClient.from("seller_lead_submissions").select("id, customer_name, customer_phone, source_detail, model_interest, summary, created_at, seller:profiles!seller_lead_submissions_submitted_by_user_id_fkey(full_name,seller_code)").eq("status", "pending").order("created_at"),
      supabaseClient.from("lead_recall_panels").select("id, panel_number, status, total_items, completed_items, created_at, closed_at, seller:profiles!lead_recall_panels_seller_user_id_fkey(full_name,seller_code)").order("created_at", { ascending: false }).limit(100)
    ]);
    state.loading = false;
    var failed = results.find(function (result) { return result.error; });
    if (failed) { document.getElementById("leadImportMessage").textContent = failed.error.message; return; }
    state.recalls = results[0].data || []; state.sellers = results[1].data || []; state.submissions = results[2].data || []; state.recallPanels = results[3].data || [];
    renderRecallFilters(); renderRecalls(); renderRecallPanels(); renderSubmissions();
  }

  async function assignRecalls() {
    var button = document.getElementById("assignRecallBatch");
    var sellerId = document.getElementById("recallSeller").value;
    var ids = Array.from(document.querySelectorAll("[data-recall-check]:checked")).map(function (input) { return input.value; });
    if (!sellerId) { document.getElementById("leadImportMessage").textContent = "Elegí un vendedor para asignar los rellamados."; return; }
    if (!ids.length) { document.getElementById("leadImportMessage").textContent = "Seleccioná al menos un rellamado."; return; }
    setBusy(button, true, "Asignando…");
    var result = await supabaseClient.rpc("assign_recall_items", { p_item_ids: ids, p_seller_user_id: sellerId });
    document.getElementById("leadImportMessage").textContent = result.error ? result.error.message : "Panel creado con " + result.data + " rellamados, conservando el orden seleccionado.";
    if (!result.error) await loadBases();
    setBusy(button, false);
  }

  async function reviewSubmission(id, approved, button) {
    var note = "";
    if (!approved) {
      note = window.prompt("Indicá el motivo del rechazo para que el vendedor pueda verlo:", "") || "";
      if (note.trim().length < 3) return;
    }
    setBusy(button, true, approved ? "Aprobando…" : "Rechazando…");
    var result = await supabaseClient.rpc("review_seller_lead_submission", { p_submission_id: id, p_approved: approved, p_review_note: note.trim() });
    document.getElementById("leadImportMessage").textContent = result.error ? result.error.message : approved ? "Lead aprobado e incorporado a la agenda del vendedor." : "Propuesta rechazada.";
    if (!result.error) await loadBases();
    setBusy(button, false);
  }

  document.getElementById("downloadLeadTemplate").addEventListener("click", downloadTemplate);
  document.getElementById("leadImportFile").addEventListener("change", function () { if (this.files[0]) readWorkbook(this.files[0]).catch(function (error) { document.getElementById("leadImportMessage").textContent = error.message; }); });
  document.getElementById("leadImportConfirm").addEventListener("click", importRows);
  document.getElementById("recallMonthFilter").addEventListener("change", renderRecalls);
  document.getElementById("recallModelFilter").addEventListener("change", renderRecalls);
  document.getElementById("recallQuantity").addEventListener("input", renderRecalls);
  document.getElementById("assignRecallBatch").addEventListener("click", assignRecalls);
  document.getElementById("sellerSubmissionList").addEventListener("click", function (event) {
    var button = event.target.closest("[data-review-submission]");
    var row = button && button.closest("[data-submission-id]");
    if (button && row) reviewSubmission(row.dataset.submissionId, button.dataset.reviewSubmission === "approve", button);
  });
  document.addEventListener("grupoSur:bases-open", loadBases);
}());
