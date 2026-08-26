(function () {
  "use strict";

  var supabaseClient;
  var clients = [];
  var pendingRows = [];
  var pendingFileName = "";
  var dialog;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function normalize(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
  function keyMap(row) {
    var mapped = {};
    Object.keys(row || {}).forEach(function (key) { mapped[normalize(key).replace(/[^a-z0-9]+/g, " ").trim()] = row[key]; });
    return mapped;
  }
  function first(row, keys) {
    for (var i = 0; i < keys.length; i += 1) if (row[keys[i]] != null && String(row[keys[i]]).trim() !== "") return row[keys[i]];
    return "";
  }
  function isoDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getFullYear() + "-" + String(value.getMonth() + 1).padStart(2, "0") + "-" + String(value.getDate()).padStart(2, "0");
    if (typeof value === "number" && window.XLSX) { var parsed = window.XLSX.SSF.parse_date_code(value); if (parsed) return parsed.y + "-" + String(parsed.m).padStart(2, "0") + "-" + String(parsed.d).padStart(2, "0"); }
    var raw = String(value || "").trim();
    var local = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (local) return local[3] + "-" + local[2].padStart(2, "0") + "-" + local[1].padStart(2, "0");
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
  }
  function mapRow(raw) {
    var row = keyMap(raw);
    return {
      name: String(first(row, ["nombre", "cliente", "nombre y apellido"]) || "").trim(),
      phone: String(first(row, ["telefono", "whatsapp", "celular"]) || "").trim(),
      document_number: String(first(row, ["dni", "documento", "numero de documento"]) || "").trim(),
      seller: String(first(row, ["vendedor", "asesor", "codigo vendedor"]) || "").trim(),
      vehicle: String(first(row, ["vehiculo", "modelo", "unidad"]) || "").trim(),
      sale_date: isoDate(first(row, ["fecha de venta", "fecha", "venta"])),
      notes: String(first(row, ["observaciones", "notas", "comentarios"]) || "").trim()
    };
  }
  function valid(row) { return row.name.length >= 2 && row.phone.length >= 6 && row.seller.length >= 2 && row.vehicle.length >= 2 && /^2026-(08|09|10|11|12)-\d{2}$/.test(row.sale_date); }
  function message(value, error) { var element = document.getElementById("historicalImportMessage"); element.textContent = value || ""; element.classList.toggle("error", !!error); }

  function renderPreview() {
    var preview = document.getElementById("historicalImportPreview");
    var invalid = pendingRows.filter(function (row) { return !valid(row); }).length;
    var sample = pendingRows.slice(0, 8);
    preview.innerHTML = '<p><strong>' + pendingRows.length + ' filas detectadas</strong> · ' + invalid + ' con datos incompletos o fecha inválida.</p>' + (sample.length ? '<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Vendedor</th><th>Vehículo</th><th>Fecha</th></tr></thead><tbody>' + sample.map(function (row) { return '<tr class="' + (valid(row) ? "" : "invalid-row") + '"><td>' + escapeHtml(row.name || "Falta") + '</td><td>' + escapeHtml(row.phone || "Falta") + '</td><td>' + escapeHtml(row.seller || "Falta") + '</td><td>' + escapeHtml(row.vehicle || "Falta") + '</td><td>' + escapeHtml(row.sale_date || "Falta") + '</td></tr>'; }).join("") + '</tbody></table></div>' : "");
    document.getElementById("historicalConfirmButton").disabled = !pendingRows.length;
  }

  async function readFile(file) {
    message("");
    if (!window.XLSX) { message("No se pudo iniciar el lector de Excel.", true); return; }
    try {
      var workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      var sheet = workbook.Sheets[workbook.SheetNames[0]];
      pendingRows = window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true }).map(mapRow).filter(function (row) { return Object.values(row).some(Boolean); });
      pendingFileName = file.name;
      renderPreview();
    } catch (error) { pendingRows = []; renderPreview(); message("No pudimos leer el archivo: " + error.message, true); }
  }

  function renderClients(search) {
    var grid = document.getElementById("historicalClientGrid");
    if (!grid) return;
    var q = normalize(search);
    var filtered = clients.filter(function (item) { return !q || normalize([item.customer_name, item.normalized_phone, item.document_number, item.vehicle, item.seller && item.seller.full_name].join(" ")).includes(q); });
    grid.innerHTML = filtered.length ? filtered.map(function (item) {
      var seller = Array.isArray(item.seller) ? item.seller[0] : item.seller;
      return '<article class="client-card historical-card"><div class="client-card-head"><div><h3>' + escapeHtml(item.customer_name) + '</h3><p>' + escapeHtml(item.vehicle) + ' · ' + escapeHtml(new Intl.DateTimeFormat("es-AR").format(new Date(item.sale_date + "T12:00:00"))) + '</p></div><span class="status-badge">Provisorio</span></div><div class="client-meta"><div><span>Teléfono</span><strong>' + escapeHtml(item.normalized_phone) + '</strong></div><div><span>DNI</span><strong>' + escapeHtml(item.document_number || "—") + '</strong></div><div><span>Vendedor</span><strong>' + escapeHtml((seller && seller.full_name) || "—") + '</strong></div><div><span>Archivo</span><strong>' + escapeHtml(item.source_file || "—") + '</strong></div></div></article>';
    }).join("") : '<div class="timeline-item">No hay clientes provisorios cargados.</div>';
  }

  async function load() {
    if (!supabaseClient) return;
    var result = await supabaseClient.from("historical_clients").select("id,customer_name,normalized_phone,document_number,vehicle,sale_date,notes,source_file,created_at,seller:profiles!historical_clients_seller_user_id_fkey(full_name,seller_code)").order("sale_date", { ascending: false }).limit(3000);
    if (result.error) { console.warn("Historical clients unavailable", result.error.message); return; }
    clients = result.data || [];
    renderClients(document.getElementById("clientSearch").value);
  }

  async function importRows() {
    var button = document.getElementById("historicalConfirmButton");
    button.disabled = true; button.textContent = "Importando…"; message("");
    var result = await supabaseClient.rpc("import_historical_clients", { p_file_name: pendingFileName, p_rows: pendingRows });
    button.textContent = "Importar clientes";
    if (result.error) { button.disabled = false; message(result.error.message, true); return; }
    var data = result.data || {};
    var detail = (data.errors || []).map(function (item) { return "Fila " + (item.row + 1) + ": " + item.error; }).join(" · ");
    message("Listo: " + (data.created || 0) + " agregados, " + (data.merged || 0) + " actualizados y " + (data.rejected || 0) + " rechazados." + (detail ? " " + detail : ""), !!data.rejected);
    pendingRows = []; pendingFileName = ""; document.getElementById("historicalFileInput").value = ""; renderPreview(); await load();
  }

  function downloadTemplate() {
    var sheet = window.XLSX.utils.aoa_to_sheet([["Nombre", "Telefono", "DNI", "Vendedor", "Vehiculo", "Fecha de venta", "Observaciones"]]);
    var workbook = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(workbook, sheet, "Clientes"); window.XLSX.writeFile(workbook, "plantilla-clientes-agosto.xlsx");
  }

  function init(client) {
    supabaseClient = client; dialog = document.getElementById("historicalClientDialog");
    document.getElementById("historicalImportButton").addEventListener("click", function () { pendingRows = []; pendingFileName = ""; renderPreview(); message(""); dialog.showModal(); });
    document.querySelectorAll("[data-close-historical-import]").forEach(function (button) { button.addEventListener("click", function () { dialog.close(); }); });
    document.getElementById("historicalFileInput").addEventListener("change", function () { if (this.files[0]) readFile(this.files[0]); });
    document.getElementById("historicalTemplateButton").addEventListener("click", downloadTemplate);
    document.getElementById("historicalConfirmButton").addEventListener("click", importRows);
    document.getElementById("clientSearch").addEventListener("input", function () { renderClients(this.value); });
  }

  window.grupoSurHistoricalClients = { init: init, load: load };
}());
