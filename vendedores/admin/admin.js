(function () {
  "use strict";

  var supabaseClient = window.grupoSurSupabaseClient;
  var state = {
    brand: "Todas",
    selectedId: "",
    campaigns: [],
    profile: null,
    sellers: [],
    prequalifications: [],
    knowledgeDocuments: [],
    trainingExamples: [],
    creditModels: [],
    modelVersions: [],
    creditOffers: [],
    editingVersionId: "",
    editingCreditId: ""
  };

  var adminLogin = document.getElementById("adminLogin");
  var adminApp = document.getElementById("adminApp");
  var loginForm = document.getElementById("adminLoginForm");
  var loginError = document.getElementById("loginError");
  var campaignForm = document.getElementById("campaignForm");
  var formMessage = document.getElementById("formMessage");
  var sellerForm = document.getElementById("sellerForm");
  var sellerFormMessage = document.getElementById("sellerFormMessage");
  var sellerExportMessage = document.getElementById("sellerExportMessage");
  var exportSellersButton = document.getElementById("exportSellersButton");
  var exportMessage = document.getElementById("exportMessage");
  var exportExcelButton = document.getElementById("exportExcelButton");
  var topbarTitle = document.querySelector(".topbar h1");
  var rulesForm = document.getElementById("aiRulesForm");
  var knowledgeUploadForm = document.getElementById("knowledgeUploadForm");
  var rulesMessage = document.getElementById("rulesMessage");
  var knowledgeMessage = document.getElementById("knowledgeMessage");

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function brandTheme(brandName) {
    return String(brandName || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  function formatMoney(value) {
    if (value === null || value === "" || !Number.isFinite(Number(value))) {
      return "A confirmar";
    }
    return "$" + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Number(value));
  }

  function offerDescriptor(item) {
    var parts = [item.planName];
    var vehicle = [item.versionName, item.transmission].filter(Boolean).join(" ");
    if (vehicle) {
      parts.push(vehicle);
    }
    if (item.installmentCount) {
      parts.push(item.installmentCount + " cuotas");
    }
    return parts.filter(Boolean).join(" · ");
  }

  function setBusy(button, busy, busyText) {
    if (!button) {
      return;
    }
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = busyText || "Procesando…";
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  function normalizeCampaign(row) {
    var model = Array.isArray(row.model) ? row.model[0] : row.model;
    var brand = model && (Array.isArray(model.brand) ? model.brand[0] : model.brand);
    return {
      id: row.id,
      modelId: model.id,
      brand: brand.name,
      name: model.name,
      image: model.image_path,
      campaign: row.plan_name,
      planName: row.plan_name,
      versionName: row.version_name || "",
      transmission: row.transmission || "",
      installmentCount: row.installment_count,
      finalPrice: row.final_price,
      advanceAmount: row.advance_amount,
      installmentAmount: row.installment_amount,
      installmentIsFrom: row.installment_is_from !== false,
      campaignOrder: row.sort_order || 0,
      active: row.active,
      bonus: row.bonus || "",
      benefits: row.benefits || [],
      slots: row.slots,
      validFrom: row.valid_from || "",
      validTo: row.valid_to || "",
      validityHours: row.timer_hours || 24,
      brandOrder: brand.sort_order || 0,
      modelOrder: model.sort_order || 0
    };
  }

  function dateStatus(config) {
    var now = new Date();
    var from = config.validFrom ? new Date(config.validFrom + "T00:00:00") : null;
    var to = config.validTo ? new Date(config.validTo + "T23:59:59") : null;
    if (config.active === false) {
      return { active: false, label: "Pausada" };
    }
    if (from && now < from) {
      return { active: false, label: "Programada" };
    }
    if (to && now > to) {
      return { active: false, label: "Vencida" };
    }
    return { active: true, label: "Activa" };
  }

  function selectedItem() {
    return state.campaigns.find(function (item) { return item.id === state.selectedId; }) || state.campaigns[0];
  }

  async function getAdminProfile() {
    var userResult = await supabaseClient.auth.getUser();
    var user = userResult.data && userResult.data.user;
    if (!user || userResult.error) {
      return null;
    }
    var profileResult = await supabaseClient
      .from("profiles")
      .select("user_id, full_name, seller_code, role, active")
      .eq("user_id", user.id)
      .single();
    if (profileResult.error || !profileResult.data || profileResult.data.role !== "admin" || !profileResult.data.active) {
      return null;
    }
    return profileResult.data;
  }

  async function loadCampaigns() {
    var result = await supabaseClient
      .from("campaigns")
      .select("id, plan_name, version_name, transmission, installment_count, final_price, advance_amount, installment_amount, installment_is_from, sort_order, active, bonus, benefits, slots, valid_from, valid_to, timer_hours, model:models!inner(id, name, image_path, sort_order, brand:brands!inner(name, sort_order))");
    if (result.error) {
      throw result.error;
    }
    state.campaigns = (result.data || []).map(normalizeCampaign).sort(function (a, b) {
      return a.brandOrder - b.brandOrder || a.modelOrder - b.modelOrder || a.campaignOrder - b.campaignOrder;
    });
    if (!state.selectedId && state.campaigns[0]) {
      state.selectedId = state.campaigns[0].id;
    }
  }

  function parseLocalizedDecimal(value) {
    var clean = String(value == null ? "" : value).trim().replace(/\s/g, "");
    if (!clean) return NaN;
    if (clean.includes(",") && clean.includes(".")) clean = clean.lastIndexOf(",") > clean.lastIndexOf(".") ? clean.replace(/\./g, "").replace(",", ".") : clean.replace(/,/g, "");
    else clean = clean.replace(",", ".");
    return Number(clean);
  }

  function catalogModels() {
    return state.creditModels.map(function (item) {
      var brand = Array.isArray(item.brand) ? item.brand[0] : item.brand;
      return { id: item.id, name: (brand && brand.name || "") + " · " + item.name, brandOrder: Number(brand && brand.sort_order || 0), modelOrder: Number(item.sort_order || 0) };
    }).sort(function (a, b) { return a.brandOrder - b.brandOrder || a.modelOrder - b.modelOrder || a.name.localeCompare(b.name, "es"); });
  }

  async function loadCredits() {
    var results = await Promise.all([
      supabaseClient.from("models").select("id, name, sort_order, active, brand:brands!inner(name,sort_order)").eq("active", true),
      supabaseClient.from("model_versions").select("id, model_id, name, suggested_price, sort_order, active").order("sort_order").order("name"),
      supabaseClient.from("bank_credit_offers").select("id, model_id, financier_name, offer_name, term_months, min_financed_amount, max_financed_amount, installment_coefficient, breakage_rate, patenting_rate, fixed_expenses, tna, cftea, notes, valid_from, valid_to, active, sort_order, versions:bank_credit_offer_versions(version:model_versions(id,name,suggested_price))").order("created_at", { ascending: false })
    ]);
    var failed = results.find(function (item) { return item.error; }); if (failed) throw failed.error;
    state.creditModels = results[0].data || []; state.modelVersions = results[1].data || []; state.creditOffers = results[2].data || []; renderCredits();
  }

  function renderCredits() {
    var models = catalogModels(); var versionModel = document.getElementById("versionModel"); var creditModel = document.getElementById("creditModel"); var selectedVersionModel = versionModel.value; var selectedCreditModel = creditModel.value; var options = '<option value="">Seleccionar modelo</option>' + models.map(function (model) { return '<option value="' + model.id + '">' + escapeHtml(model.name) + '</option>'; }).join("");
    versionModel.innerHTML = options; creditModel.innerHTML = options;
    if (selectedVersionModel) versionModel.value = selectedVersionModel;
    if (selectedCreditModel) creditModel.value = selectedCreditModel;
    renderVersionList(); renderCreditVersions();
    document.getElementById("creditOfferList").innerHTML = state.creditOffers.length ? state.creditOffers.map(function (offer) {
      var model = models.find(function (item) { return item.id === offer.model_id; }); var versions = (offer.versions || []).map(function (link) { var version = Array.isArray(link.version) ? link.version[0] : link.version; return version && version.name; }).filter(Boolean);
      return '<article class="credit-offer-row' + (offer.active ? '' : ' is-paused') + '" data-credit-id="' + offer.id + '"><div><strong>' + escapeHtml(offer.financier_name + " · " + offer.offer_name) + '</strong><span>' + escapeHtml(model && model.name || "Modelo") + ' · ' + escapeHtml(offer.term_months) + ' cuotas</span><small>' + escapeHtml(versions.join(", ") || "Sin versiones habilitadas") + '</small></div><div><strong>$' + escapeHtml(new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(offer.installment_coefficient) * 1000)) + '</strong><span>por cada $1.000</span></div><div class="credit-row-actions"><button data-edit-credit type="button">Editar</button><button data-duplicate-credit type="button">Duplicar</button><button data-toggle-credit type="button">' + (offer.active ? "Pausar" : "Activar") + '</button><button class="danger" data-delete-credit type="button">Borrar</button></div></article>';
    }).join("") : '<div class="seller-empty">Todavía no hay líneas de crédito cargadas.</div>';
  }

  function renderVersionList() {
    var modelId = document.getElementById("versionModel").value;
    var models = catalogModels();
    var versions = state.modelVersions.filter(function (item) { return !modelId || item.model_id === modelId; });
    document.getElementById("versionCount").textContent = versions.length + (versions.length === 1 ? " versión" : " versiones");
    document.getElementById("versionList").innerHTML = versions.length ? versions.map(function (item) {
      var model = models.find(function (row) { return row.id === item.model_id; });
      return '<article class="version-row' + (item.active ? '' : ' is-paused') + '" data-version-id="' + item.id + '"><div><strong>' + escapeHtml(item.name) + '</strong><span>' + escapeHtml(model && model.name || "Modelo") + '</span><small>' + (item.suggested_price == null ? "Precio sugerido pendiente" : "Precio sugerido " + escapeHtml(formatMoney(item.suggested_price))) + (item.active ? "" : " · Archivada") + '</small></div><div><button data-edit-version type="button">Editar</button><button class="danger" data-delete-version type="button">Borrar</button></div></article>';
    }).join("") : '<div class="version-empty">No hay versiones para este modelo.</div>';
  }

  function renderCreditVersions() {
    var modelId = document.getElementById("creditModel").value; var versions = state.modelVersions.filter(function (item) { return item.model_id === modelId && item.active; });
    document.getElementById("creditVersionOptions").innerHTML = versions.length ? versions.map(function (item) { return '<label><input type="checkbox" name="versionIds" value="' + item.id + '"><span>' + escapeHtml(item.name) + (item.suggested_price == null ? " · sin precio" : " · " + formatMoney(item.suggested_price)) + '</span></label>'; }).join("") : '<small>Primero agregá una versión para este modelo.</small>';
  }

  function resetVersionForm(modelId) {
    var form = document.getElementById("versionForm");
    state.editingVersionId = ""; form.reset();
    if (modelId) form.elements.modelId.value = modelId;
    document.getElementById("versionFormTitle").textContent = "Nueva versión";
    document.getElementById("versionSubmit").textContent = "Agregar versión";
    document.getElementById("cancelVersionEdit").hidden = true;
  }

  function editVersion(version) {
    var form = document.getElementById("versionForm");
    state.editingVersionId = version.id; form.elements.modelId.value = version.model_id; form.elements.name.value = version.name || ""; form.elements.suggestedPrice.value = version.suggested_price == null ? "" : version.suggested_price;
    document.getElementById("versionFormTitle").textContent = "Editar versión";
    document.getElementById("versionSubmit").textContent = "Guardar versión";
    document.getElementById("cancelVersionEdit").hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function resetCreditForm(modelId) {
    var form = document.getElementById("creditForm");
    state.editingCreditId = ""; form.reset();
    if (modelId) form.elements.modelId.value = modelId;
    form.elements.breakageRate.value = "0"; form.elements.patentingRate.value = "0"; form.elements.fixedExpenses.value = "0";
    document.getElementById("creditFormTitle").textContent = "Nueva línea de crédito";
    document.getElementById("creditSubmit").textContent = "Guardar línea de crédito";
    document.getElementById("cancelCreditEdit").hidden = true;
    renderCreditVersions();
  }

  function editCredit(offer) {
    var form = document.getElementById("creditForm");
    state.editingCreditId = offer.id; form.elements.modelId.value = offer.model_id; renderCreditVersions();
    form.elements.financierName.value = offer.financier_name || ""; form.elements.offerName.value = offer.offer_name || ""; form.elements.termMonths.value = offer.term_months || ""; form.elements.minFinanced.value = offer.min_financed_amount == null ? "" : offer.min_financed_amount; form.elements.maxFinanced.value = offer.max_financed_amount == null ? "" : offer.max_financed_amount; form.elements.installmentPerThousand.value = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(offer.installment_coefficient) * 1000); form.elements.breakageRate.value = offer.breakage_rate || 0; form.elements.patentingRate.value = offer.patenting_rate || 0; form.elements.fixedExpenses.value = offer.fixed_expenses || 0; form.elements.tna.value = offer.tna == null ? "" : offer.tna; form.elements.cftea.value = offer.cftea == null ? "" : offer.cftea; form.elements.validFrom.value = offer.valid_from || ""; form.elements.validTo.value = offer.valid_to || ""; form.elements.notes.value = offer.notes || "";
    var selected = new Set((offer.versions || []).map(function (link) { var version = Array.isArray(link.version) ? link.version[0] : link.version; return version && version.id; }).filter(Boolean));
    form.querySelectorAll('input[name="versionIds"]').forEach(function (input) { input.checked = selected.has(input.value); });
    document.getElementById("creditFormTitle").textContent = "Editar línea de crédito";
    document.getElementById("creditSubmit").textContent = "Guardar cambios";
    document.getElementById("cancelCreditEdit").hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function enterAdmin() {
    var profile = await getAdminProfile();
    if (!profile) {
      await supabaseClient.auth.signOut({ scope: "local" });
      throw new Error("Esta cuenta no tiene permisos de administrador o todavía no fue confirmada.");
    }
    state.profile = profile;
    await loadCampaigns();
    adminLogin.hidden = true;
    adminApp.hidden = false;
    document.querySelector(".sidebar-info strong").textContent = profile.full_name;
    renderAll();
  }

  function showLogin() {
    state.profile = null;
    adminApp.hidden = true;
    adminLogin.hidden = false;
    loginForm.reset();
    loginError.textContent = "";
    document.getElementById("adminCode").value = "cesardenavarrete18@gmail.com";
    document.getElementById("adminPassword").focus();
  }

  function renderFilters() {
    var brands = ["Todas"].concat(Array.from(new Set(state.campaigns.map(function (item) { return item.brand; }))));
    document.getElementById("brandFilters").innerHTML = brands.map(function (brand) {
      return '<button class="brand-filter' + (brand === state.brand ? " is-active" : "") + '" type="button" data-brand="' + escapeHtml(brand) + '">' + escapeHtml(brand) + "</button>";
    }).join("");
  }

  function renderList() {
    var items = state.campaigns.filter(function (item) {
      return state.brand === "Todas" || item.brand === state.brand;
    });
    document.getElementById("campaignList").innerHTML = items.map(function (item) {
      var status = dateStatus(item);
      var availability = item.slots === null || item.slots === "" ? "Cupos sin informar" : item.slots + " cupos";
      return "" +
        '<button class="campaign-item' + (item.id === state.selectedId ? " is-selected" : "") + '" type="button" data-id="' + escapeHtml(item.id) + '" data-brand-theme="' + brandTheme(item.brand) + '">' +
          '<img src="' + item.image + '" alt="">' +
          '<span class="campaign-item-copy"><span>' + escapeHtml(item.brand + " · " + item.name) + '</span><strong>' + escapeHtml(offerDescriptor(item)) + '</strong><small>' + escapeHtml(formatMoney(item.finalPrice) + " valor final · " + formatMoney(item.advanceAmount) + " anticipo · " + formatMoney(item.installmentAmount) + " cuota · " + availability) + '</small></span>' +
          '<i class="status-dot' + (status.active ? " is-active" : "") + '" title="' + escapeHtml(status.label) + '"></i>' +
        "</button>";
    }).join("");
  }

  function renderEditor() {
    var item = selectedItem();
    if (!item) {
      return;
    }
    document.getElementById("editorImage").src = item.image;
    campaignForm.setAttribute("data-brand-theme", brandTheme(item.brand));
    document.getElementById("editorImage").alt = item.brand + " " + item.name;
    document.getElementById("editorBrand").textContent = item.brand;
    document.getElementById("editorModel").textContent = item.name;
    document.getElementById("editorCampaign").textContent = offerDescriptor(item);
    document.getElementById("campaignPlanName").value = item.planName || "";
    document.getElementById("campaignVersionName").value = item.versionName || "";
    document.getElementById("campaignTransmission").value = item.transmission || "";
    document.getElementById("campaignInstallmentCount").value = item.installmentCount || "";
    document.getElementById("campaignFinalPrice").value = item.finalPrice === null ? "" : item.finalPrice;
    document.getElementById("campaignAdvanceAmount").value = item.advanceAmount === null ? "" : item.advanceAmount;
    document.getElementById("campaignInstallmentAmount").value = item.installmentAmount === null ? "" : item.installmentAmount;
    document.getElementById("campaignInstallmentIsFrom").checked = item.installmentIsFrom !== false;
    document.getElementById("campaignActive").checked = item.active !== false;
    document.getElementById("campaignBonus").value = item.bonus || "";
    document.getElementById("campaignBenefits").value = (item.benefits || []).join("\n");
    document.getElementById("campaignSlots").value = item.slots === null ? "" : item.slots;
    document.getElementById("campaignHours").value = item.validityHours || 24;
    document.getElementById("campaignValidFrom").value = item.validFrom || "";
    document.getElementById("campaignValidTo").value = item.validTo || "";
    formMessage.textContent = "";
    formMessage.classList.remove("is-error");
    updatePreview();
  }

  function renderStats() {
    var active = 0;
    var slots = 0;
    var hours = 0;
    state.campaigns.forEach(function (item) {
      if (dateStatus(item).active) {
        active += 1;
      }
      if (item.slots !== null && Number.isFinite(Number(item.slots))) {
        slots += Number(item.slots);
      }
      hours += Number(item.validityHours) || 24;
    });
    document.getElementById("activeCount").textContent = active;
    document.getElementById("slotCount").textContent = slots;
    document.getElementById("timerAverage").textContent = state.campaigns.length ? Math.round(hours / state.campaigns.length) + " h" : "0 h";
  }

  function formConfig() {
    return {
      active: document.getElementById("campaignActive").checked,
      planName: document.getElementById("campaignPlanName").value.trim(),
      versionName: document.getElementById("campaignVersionName").value.trim(),
      transmission: document.getElementById("campaignTransmission").value,
      installmentCount: document.getElementById("campaignInstallmentCount").value,
      finalPrice: document.getElementById("campaignFinalPrice").value,
      advanceAmount: document.getElementById("campaignAdvanceAmount").value,
      installmentAmount: document.getElementById("campaignInstallmentAmount").value,
      installmentIsFrom: document.getElementById("campaignInstallmentIsFrom").checked,
      bonus: document.getElementById("campaignBonus").value.trim(),
      benefits: document.getElementById("campaignBenefits").value.split("\n").map(function (line) { return line.trim(); }).filter(Boolean),
      slots: document.getElementById("campaignSlots").value,
      validFrom: document.getElementById("campaignValidFrom").value,
      validTo: document.getElementById("campaignValidTo").value,
      validityHours: document.getElementById("campaignHours").value
    };
  }

  function updatePreview() {
    var item = selectedItem();
    if (!item) {
      return;
    }
    var config = formConfig();
    var status = dateStatus(config);
    var version = [config.versionName, config.transmission].filter(Boolean).join(" ");
    var installment = config.installmentAmount === ""
      ? "A confirmar"
      : (config.installmentIsFrom ? "Desde " : "") + formatMoney(config.installmentAmount);
    document.getElementById("previewTitle").textContent = item.brand + " " + item.name + (version ? " · " + version : "");
    document.getElementById("previewBonus").textContent = config.planName + (config.installmentCount ? " · " + config.installmentCount + " cuotas" : "") + " · Valor final " + formatMoney(config.finalPrice) + " · Anticipo " + formatMoney(config.advanceAmount) + " · Cuota " + installment;
    document.getElementById("previewSlots").textContent = config.slots === "" ? "Sin informar" : config.slots + " disponibles";
    document.getElementById("previewHours").textContent = (config.validityHours || 24) + " horas";
    document.getElementById("previewStatus").textContent = status.label;
  }

  function renderAll() {
    renderFilters();
    renderList();
    renderEditor();
    renderStats();
  }

  async function invokeUsers(body) {
    var result = await supabaseClient.functions.invoke("manage-users", { body: body });
    if (result.error) {
      var message = result.data && result.data.error ? result.data.error : "No se pudo completar la operación.";
      throw new Error(message);
    }
    if (result.data && result.data.error) {
      throw new Error(result.data.error);
    }
    return result.data || {};
  }

  async function loadSellers() {
    var data = await invokeUsers({ action: "list" });
    state.sellers = (data.users || []).filter(function (user) { return ["seller", "supervisor", "admventas"].includes(user.role); });
    renderSellers();
  }

  function syncTikTokCodeField() {
    var isSeller = sellerForm.elements.role.value === "seller";
    var field = document.getElementById("sellerTikTokCodeField");
    var input = sellerForm.elements.tiktokCode;
    field.hidden = !isSeller;
    input.disabled = !isSeller;
    input.required = isSeller;
    if (!isSeller) input.value = "";
  }

  function renderSellers() {
    document.getElementById("sellerCount").textContent = state.sellers.length === 1 ? "1 integrante" : state.sellers.length + " integrantes";
    exportSellersButton.disabled = state.sellers.length === 0;
    var list = document.getElementById("sellerList");
    if (!state.sellers.length) {
      list.innerHTML = '<div class="seller-empty"><strong>Todavía no hay integrantes</strong>Creá el primer acceso desde el formulario.</div>';
      return;
    }
    list.innerHTML = state.sellers.map(function (seller) {
      return "" +
        '<div class="seller-row">' +
          '<div class="seller-identity"><span>' + escapeHtml((seller.full_name || "V").charAt(0)) + '</span><div><strong>' + escapeHtml(seller.full_name) + '</strong><small>' + escapeHtml(seller.role === "supervisor" ? "Supervisor" : seller.role === "admventas" ? "Administración de ventas" : "Vendedor") + " · Acceso: " + escapeHtml(seller.seller_code) + '</small>' + (seller.role === "seller" ? '<small>TikTok: ' + escapeHtml(seller.tiktok_code || "Sin asignar") + '</small>' : '') + '<small>' + escapeHtml(seller.contact_email || "Correo pendiente") + '</small></div></div>' +
          '<span class="seller-status ' + (seller.active ? "is-active" : "is-paused") + '">' + (seller.active ? "Activo" : "Pausado") + '</span>' +
          '<div class="seller-actions">' + (seller.role === "seller" ? '<button type="button" data-user-action="edit" data-user-id="' + seller.user_id + '">Editar</button>' : '') + '<button type="button" data-user-action="password" data-user-id="' + seller.user_id + '" data-user-name="' + escapeHtml(seller.full_name) + '">Contraseña</button><button type="button" data-user-action="toggle" data-user-id="' + seller.user_id + '" data-active="' + seller.active + '">' + (seller.active ? "Pausar" : "Activar") + '</button></div>' +
        "</div>";
    }).join("");
  }

  function downloadSellers() {
    sellerExportMessage.textContent = "";
    sellerExportMessage.classList.remove("is-error");
    if (!window.grupoSurExcel || !state.sellers.length) {
      sellerExportMessage.textContent = "No hay vendedores disponibles para exportar.";
      sellerExportMessage.classList.add("is-error");
      return;
    }
    setBusy(exportSellersButton, true, "Preparando Excel…");
    try {
      var rows = [["Nombre", "Rol", "Código de acceso", "Código TikTok", "Teléfono", "Correo", "Estado", "Fecha de alta"]].concat(state.sellers.map(function (seller) {
        return [
          seller.full_name,
          seller.role === "supervisor" ? "Supervisor" : seller.role === "admventas" ? "Administración de ventas" : "Vendedor",
          seller.seller_code,
          seller.tiktok_code || "",
          seller.phone || "",
          seller.contact_email || "",
          seller.active ? "Activo" : "Pausado",
          formatPrequalificationDate(seller.created_at)
        ];
      }));
      var bytes = window.grupoSurExcel.buildWorkbook(rows, {
        sheetName: "Vendedores",
        widths: [30, 16, 18, 18, 20, 32, 14, 22]
      });
      var blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "base-vendedores-" + localDateKey(new Date()) + ".xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      sellerExportMessage.textContent = "Base generada correctamente con " + state.sellers.length + " vendedores.";
    } catch (error) {
      sellerExportMessage.textContent = "No se pudo generar la base. Intentá nuevamente.";
      sellerExportMessage.classList.add("is-error");
    } finally {
      setBusy(exportSellersButton, false);
    }
  }

  function formatPrequalificationDate(value) {
    if (!value) {
      return "—";
    }
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function localDateKey(value) {
    var date = new Date(value);
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  async function loadPrequalifications() {
    var rows = [];
    var pageSize = 1000;
    var from = 0;
    var result;
    do {
      result = await supabaseClient
        .from("prequalification_events")
        .select("request_code, customer_name, customer_phone, customer_document, model_name, seller_name, created_at")
        .not("customer_name", "is", null)
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (result.error) {
        throw result.error;
      }
      rows = rows.concat(result.data || []);
      from += pageSize;
    } while ((result.data || []).length === pageSize);
    state.prequalifications = rows;
    renderPrequalifications();
  }

  function renderPrequalifications() {
    var today = localDateKey(new Date());
    var modelCount = new Set(state.prequalifications.map(function (item) { return item.model_name; })).size;
    var todayCount = state.prequalifications.filter(function (item) { return localDateKey(item.created_at) === today; }).length;
    document.getElementById("prequalificationCount").textContent = state.prequalifications.length;
    document.getElementById("prequalificationToday").textContent = todayCount;
    document.getElementById("prequalificationModels").textContent = modelCount;
    document.getElementById("prequalificationTableBody").innerHTML = state.prequalifications.map(function (item) {
      return "" +
        "<tr>" +
          "<td>" + escapeHtml(formatPrequalificationDate(item.created_at)) + "</td>" +
          "<td><strong>" + escapeHtml(item.customer_name) + "</strong></td>" +
          "<td>" + escapeHtml(item.customer_phone) + "</td>" +
          "<td>" + escapeHtml(item.customer_document) + "</td>" +
          "<td>" + escapeHtml(item.model_name) + "</td>" +
          "<td>" + escapeHtml(item.seller_name) + "</td>" +
          "<td><code>" + escapeHtml(item.request_code) + "</code></td>" +
        "</tr>";
    }).join("");
    document.getElementById("prequalificationEmpty").hidden = state.prequalifications.length > 0;
    exportExcelButton.disabled = state.prequalifications.length === 0;
  }

  function downloadPrequalifications() {
    exportMessage.textContent = "";
    exportMessage.classList.remove("is-error");
    if (!window.grupoSurExcel || !state.prequalifications.length) {
      exportMessage.textContent = "No hay datos disponibles para exportar.";
      exportMessage.classList.add("is-error");
      return;
    }
    setBusy(exportExcelButton, true, "Preparando Excel…");
    try {
      var rows = [["Nombre", "Teléfono", "DNI", "Modelo", "Asesor", "Fecha", "Constancia"]].concat(state.prequalifications.map(function (item) {
        return [
          item.customer_name,
          item.customer_phone,
          item.customer_document,
          item.model_name,
          item.seller_name,
          formatPrequalificationDate(item.created_at),
          item.request_code
        ];
      }));
      var bytes = window.grupoSurExcel.buildWorkbook(rows);
      var blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "precalificaciones-" + localDateKey(new Date()) + ".xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      exportMessage.textContent = "Excel generado correctamente con " + state.prequalifications.length + " registros.";
    } catch (error) {
      exportMessage.textContent = "No se pudo generar el Excel. Intentá nuevamente.";
      exportMessage.classList.add("is-error");
    } finally {
      setBusy(exportExcelButton, false);
    }
  }

  function showAdminView(view) {
    var campaigns = view === "campaigns";
    var sellers = view === "sellers";
    var prequalifications = view === "prequalifications";
    var knowledge = view === "knowledge";
    var credits = view === "credits";
    document.getElementById("campaignAdminView").hidden = !campaigns;
    document.getElementById("sellerAdminView").hidden = !sellers;
    document.getElementById("prequalificationAdminView").hidden = !prequalifications;
    document.getElementById("knowledgeAdminView").hidden = !knowledge;
    document.getElementById("creditAdminView").hidden = !credits;
    topbarTitle.textContent = campaigns ? "Gestión de campañas y equipo" : credits ? "Créditos y versiones" : sellers ? "Equipo comercial y accesos" : prequalifications ? "Clientes precalificados" : "Conocimiento de la IA";
    document.querySelectorAll("[data-admin-view]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.adminView === view);
    });
    if (sellers) {
      loadSellers().catch(function (error) {
        sellerFormMessage.textContent = error.message;
        sellerFormMessage.classList.add("is-error");
      });
    }
    if (prequalifications) {
      exportMessage.textContent = "Cargando registros…";
      exportMessage.classList.remove("is-error");
      loadPrequalifications().then(function () {
        exportMessage.textContent = "";
      }).catch(function () {
        exportMessage.textContent = "No se pudieron cargar las precalificaciones. Verificá la conexión e intentá nuevamente.";
        exportMessage.classList.add("is-error");
      });
    }
    if (knowledge) {
      loadKnowledge().catch(function (error) {
        knowledgeMessage.textContent = error.message;
        knowledgeMessage.classList.add("is-error");
      });
    }
    if (credits) loadCredits().catch(function (error) { document.getElementById("creditMessage").textContent = error.message; });
  }

  function knowledgeStatusLabel(status) {
    return { pending: "Pendiente", processing: "Procesando", ready: "Listo", error: "Error" }[status] || status;
  }

  function renderKnowledgeDocuments() {
    var container = document.getElementById("knowledgeDocumentList");
    if (!state.knowledgeDocuments.length) {
      container.innerHTML = '<div class="knowledge-empty"><strong>Todavía no hay documentos</strong><span>Cargá el primer PDF para darle contexto comercial al asistente.</span></div>';
      return;
    }
    container.innerHTML = state.knowledgeDocuments.map(function (document) {
      return '<article class="knowledge-document">' +
        '<div class="knowledge-document-icon">PDF</div>' +
        '<div class="knowledge-document-copy"><strong>' + escapeHtml(document.title) + '</strong><span>' + escapeHtml(document.brand) + ' · ' + escapeHtml(document.category) + '</span><small>' + escapeHtml(document.original_filename) + '</small>' + (document.processing_error ? '<small class="document-error">' + escapeHtml(document.processing_error) + '</small>' : '') + '</div>' +
        '<span class="knowledge-status is-' + escapeHtml(document.processing_status) + '">' + escapeHtml(knowledgeStatusLabel(document.processing_status)) + '</span>' +
        '<button class="document-delete" type="button" data-delete-document="' + escapeHtml(document.id) + '">Eliminar</button>' +
      '</article>';
    }).join("");
  }

  function renderTrainingExamples() {
    var container = document.getElementById("trainingExamplesList");
    var count = state.trainingExamples.length;
    document.getElementById("trainingExamplesCount").textContent = count + (count === 1 ? " ejemplo" : " ejemplos");
    if (!count) {
      container.innerHTML = '<div class="knowledge-empty"><strong>Todavía no hay respuestas revisadas</strong><span>Desde la bandeja de WhatsApp, Supervisión puede aprobar o corregir respuestas de la IA.</span></div>';
      return;
    }
    container.innerHTML = state.trainingExamples.map(function (example) {
      return '<article class="training-example">' +
        '<div><strong>' + (example.rating === "correct" ? "Respuesta aprobada" : "Respuesta corregida") + '</strong><span>' + escapeHtml(example.expected_reply || "Sin respuesta registrada") + '</span><small>' + escapeHtml(example.correction_note || "Revisión de Supervisión") + '</small></div>' +
        '<button class="document-delete" type="button" data-disable-example="' + escapeHtml(example.id) + '">Desactivar</button>' +
      '</article>';
    }).join("");
  }

  async function loadKnowledge() {
    var results = await Promise.all([
      supabaseClient.from("ai_assistant_settings").select("qualification_rules, conversation_style").eq("id", true).single(),
      supabaseClient.from("ai_knowledge_documents").select("id, title, brand, category, original_filename, processing_status, processing_error, created_at").order("created_at", { ascending: false }),
      supabaseClient.from("ai_training_examples").select("id, rating, expected_reply, correction_note, updated_at").eq("active", true).order("updated_at", { ascending: false }).limit(100)
    ]);
    if (results[0].error) throw results[0].error;
    if (results[1].error) throw results[1].error;
    if (results[2].error) throw results[2].error;
    document.getElementById("qualificationRules").value = results[0].data.qualification_rules || "";
    document.getElementById("conversationStyle").value = results[0].data.conversation_style || "";
    state.knowledgeDocuments = results[1].data || [];
    state.trainingExamples = results[2].data || [];
    renderKnowledgeDocuments();
    renderTrainingExamples();
  }

  rulesForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    rulesMessage.textContent = "";
    var button = rulesForm.querySelector('button[type="submit"]');
    setBusy(button, true, "Guardando…");
    try {
      var result = await supabaseClient.from("ai_assistant_settings").update({
        qualification_rules: document.getElementById("qualificationRules").value.trim(),
        conversation_style: document.getElementById("conversationStyle").value.trim(),
        updated_by: state.profile.user_id
      }).eq("id", true);
      if (result.error) throw result.error;
      rulesMessage.textContent = "Reglas y estilo actualizados. Se aplicarán desde el próximo mensaje.";
      rulesMessage.classList.remove("is-error");
    } catch (error) {
      rulesMessage.textContent = error.message;
      rulesMessage.classList.add("is-error");
    } finally {
      setBusy(button, false);
    }
  });

  document.getElementById("knowledgePdf").addEventListener("change", function () {
    document.getElementById("knowledgeFileName").textContent = this.files[0] ? this.files[0].name : "Ningún archivo seleccionado";
  });

  knowledgeUploadForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    knowledgeMessage.textContent = "";
    var file = knowledgeUploadForm.elements.pdf.files[0];
    var button = document.getElementById("uploadKnowledgeButton");
    if (!file || file.type !== "application/pdf" || file.size > 20 * 1024 * 1024) {
      knowledgeMessage.textContent = "Seleccioná un PDF válido de hasta 20 MB.";
      knowledgeMessage.classList.add("is-error");
      return;
    }
    setBusy(button, true, "Procesando PDF…");
    var storagePath = state.profile.user_id + "/" + Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    try {
      var upload = await supabaseClient.storage.from("ai-commercial-knowledge").upload(storagePath, file, { contentType: "application/pdf", upsert: false });
      if (upload.error) throw upload.error;
      var inserted = await supabaseClient.from("ai_knowledge_documents").insert({
        title: knowledgeUploadForm.elements.title.value.trim(),
        brand: knowledgeUploadForm.elements.brand.value,
        category: knowledgeUploadForm.elements.category.value,
        original_filename: file.name,
        storage_path: storagePath,
        mime_type: "application/pdf",
        created_by: state.profile.user_id
      }).select("id").single();
      if (inserted.error) throw inserted.error;
      var ingest = await supabaseClient.functions.invoke("ai-knowledge-ingest", { body: { document_id: inserted.data.id } });
      if (ingest.error) throw ingest.error;
      knowledgeMessage.textContent = ingest.data.status === "ready" ? "PDF cargado y listo para la IA." : "PDF cargado; OpenAI continúa procesándolo.";
      knowledgeMessage.classList.remove("is-error");
      knowledgeUploadForm.reset();
      document.getElementById("knowledgeFileName").textContent = "Ningún archivo seleccionado";
      await loadKnowledge();
    } catch (error) {
      knowledgeMessage.textContent = error.message || "No se pudo procesar el PDF.";
      knowledgeMessage.classList.add("is-error");
    } finally {
      setBusy(button, false);
    }
  });

  document.getElementById("knowledgeDocumentList").addEventListener("click", async function (event) {
    var button = event.target.closest("[data-delete-document]");
    if (!button || !window.confirm("¿Eliminar este documento del conocimiento de la IA?")) return;
    setBusy(button, true, "Eliminando…");
    try {
      var result = await supabaseClient.functions.invoke("ai-knowledge-ingest", { body: { document_id: button.dataset.deleteDocument, action: "delete" } });
      if (result.error) throw result.error;
      await loadKnowledge();
    } catch (error) {
      knowledgeMessage.textContent = error.message;
      knowledgeMessage.classList.add("is-error");
      setBusy(button, false);
    }
  });

  document.getElementById("trainingExamplesList").addEventListener("click", async function (event) {
    var button = event.target.closest("[data-disable-example]");
    if (!button || !window.confirm("¿Desactivar este aprendizaje? La IA dejará de usarlo como ejemplo.")) return;
    setBusy(button, true, "Desactivando…");
    var result = await supabaseClient.from("ai_training_examples").update({ active: false }).eq("id", button.dataset.disableExample);
    if (result.error) {
      rulesMessage.textContent = result.error.message;
      rulesMessage.classList.add("is-error");
      setBusy(button, false);
      return;
    }
    await loadKnowledge();
  });

  document.getElementById("refreshKnowledgeButton").addEventListener("click", function () {
    var button = this;
    setBusy(button, true, "Actualizando…");
    Promise.all(state.knowledgeDocuments.filter(function (document) {
      return document.processing_status === "processing";
    }).map(function (document) {
      return supabaseClient.functions.invoke("ai-knowledge-ingest", { body: { document_id: document.id, action: "status" } });
    })).then(loadKnowledge).catch(function (error) {
      knowledgeMessage.textContent = error.message;
      knowledgeMessage.classList.add("is-error");
    }).finally(function () {
      setBusy(button, false);
    });
  });

  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    loginError.textContent = "";
    var button = document.getElementById("adminLoginButton");
    setBusy(button, true, "Ingresando…");
    try {
      var result = await supabaseClient.auth.signInWithPassword({
        email: loginForm.elements.adminCode.value.trim().toLowerCase(),
        password: loginForm.elements.adminPassword.value
      });
      if (result.error) {
        throw result.error;
      }
      await enterAdmin();
    } catch (error) {
      loginError.textContent = error.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : error.message;
    } finally {
      setBusy(button, false);
    }
  });

  document.getElementById("firstAccessButton").addEventListener("click", async function () {
    loginError.textContent = "";
    var email = loginForm.elements.adminCode.value.trim().toLowerCase();
    var password = loginForm.elements.adminPassword.value;
    if (!email || password.length < 8) {
      loginError.textContent = "Ingresá el correo autorizado y una contraseña de al menos 8 caracteres.";
      return;
    }
    setBusy(this, true, "Creando acceso…");
    try {
      var result = await supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: { emailRedirectTo: window.location.origin + "/administracion/" }
      });
      if (result.error) {
        throw result.error;
      }
      if (result.data.session) {
        await enterAdmin();
      } else {
        loginError.textContent = "Acceso creado. Revisá tu correo para confirmar la cuenta y después ingresá.";
      }
    } catch (error) {
      loginError.textContent = error.message;
    } finally {
      setBusy(this, false);
    }
  });

  document.getElementById("passwordToggle").addEventListener("click", function () {
    var input = document.getElementById("adminPassword");
    var show = input.type === "password";
    input.type = show ? "text" : "password";
    this.textContent = show ? "Ocultar" : "Ver";
  });

  document.getElementById("logoutButton").addEventListener("click", async function () {
    await supabaseClient.auth.signOut({ scope: "local" });
    showLogin();
  });

  document.querySelector(".sidebar nav").addEventListener("click", function (event) {
    var button = event.target.closest("[data-admin-view]");
    if (button) {
      showAdminView(button.dataset.adminView);
    }
  });

  document.getElementById("versionModel").addEventListener("change", renderVersionList);
  document.getElementById("creditModel").addEventListener("change", renderCreditVersions);
  document.getElementById("cancelVersionEdit").addEventListener("click", function () { resetVersionForm(document.getElementById("versionModel").value); });
  document.getElementById("cancelCreditEdit").addEventListener("click", function () { resetCreditForm(document.getElementById("creditModel").value); });

  document.getElementById("versionForm").addEventListener("submit", async function (event) {
    event.preventDefault(); var form = this; var message = document.getElementById("versionMessage"); var button = form.querySelector('button[type="submit"]'); message.textContent = ""; setBusy(button, true, "Guardando…");
    var modelId = form.elements.modelId.value; var payload = { model_id: modelId, name: form.elements.name.value.trim(), suggested_price: form.elements.suggestedPrice.value ? Number(form.elements.suggestedPrice.value) : null, active: true };
    var query = state.editingVersionId ? supabaseClient.from("model_versions").update(payload).eq("id", state.editingVersionId) : supabaseClient.from("model_versions").insert(payload);
    var result = await query.select("id").single();
    if (result.error) { message.textContent = result.error.message; message.classList.add("is-error"); } else { var editing = Boolean(state.editingVersionId); await loadCredits(); document.getElementById("versionModel").value = modelId; document.getElementById("creditModel").value = modelId; resetVersionForm(modelId); renderVersionList(); renderCreditVersions(); message.textContent = editing ? "Versión actualizada correctamente." : "Versión agregada correctamente."; }
    setBusy(button, false);
  });

  document.getElementById("versionList").addEventListener("click", async function (event) {
    var row = event.target.closest("[data-version-id]"); if (!row) return; var version = state.modelVersions.find(function (item) { return item.id === row.dataset.versionId; }); if (!version) return;
    if (event.target.closest("[data-edit-version]")) { editVersion(version); return; }
    if (!event.target.closest("[data-delete-version]")) return;
    if (!window.confirm("¿Querés borrar esta versión? Si ya está asociada a créditos se archivará para conservar el historial.")) return;
    var usage = await supabaseClient.from("bank_credit_offer_versions").select("offer_id", { count: "exact", head: true }).eq("version_id", version.id);
    var result = usage.error ? usage : usage.count ? await supabaseClient.from("model_versions").update({ active: false }).eq("id", version.id) : await supabaseClient.from("model_versions").delete().eq("id", version.id);
    if (result.error) { document.getElementById("versionMessage").textContent = result.error.message; document.getElementById("versionMessage").classList.add("is-error"); return; }
    if (state.editingVersionId === version.id) resetVersionForm(version.model_id); await loadCredits(); document.getElementById("versionModel").value = version.model_id; renderVersionList();
  });

  document.getElementById("creditForm").addEventListener("submit", async function (event) {
    event.preventDefault(); var form = this; var message = document.getElementById("creditMessage"); var button = form.querySelector('button[type="submit"]'); var versionIds = Array.from(form.querySelectorAll('input[name="versionIds"]:checked')).map(function (input) { return input.value; }); message.textContent = ""; message.classList.remove("is-error");
    if (!versionIds.length) { message.textContent = "Elegí al menos una versión habilitada."; message.classList.add("is-error"); return; }
    var min = form.elements.minFinanced.value ? Number(form.elements.minFinanced.value) : null; var max = form.elements.maxFinanced.value ? Number(form.elements.maxFinanced.value) : null;
    if (min !== null && max !== null && min > max) { message.textContent = "El mínimo financiable no puede superar al máximo."; message.classList.add("is-error"); return; }
    var installmentPerThousand = parseLocalizedDecimal(form.elements.installmentPerThousand.value); if (!Number.isFinite(installmentPerThousand) || installmentPerThousand <= 0) { message.textContent = "Ingresá una cuota válida por cada $1.000, por ejemplo 83,33."; message.classList.add("is-error"); return; }
    setBusy(button, true, "Guardando…");
    var payload = { model_id: form.elements.modelId.value, financier_name: form.elements.financierName.value.trim(), offer_name: form.elements.offerName.value.trim(), term_months: Number(form.elements.termMonths.value), min_financed_amount: min, max_financed_amount: max, installment_coefficient: installmentPerThousand / 1000, breakage_rate: Number(form.elements.breakageRate.value || 0), patenting_rate: Number(form.elements.patentingRate.value || 0), fixed_expenses: Number(form.elements.fixedExpenses.value || 0), tna: form.elements.tna.value ? Number(form.elements.tna.value) : null, cftea: form.elements.cftea.value ? Number(form.elements.cftea.value) : null, valid_from: form.elements.validFrom.value || null, valid_to: form.elements.validTo.value || null, notes: form.elements.notes.value.trim() || "" };
    var editingId = state.editingCreditId; var result = editingId ? await supabaseClient.from("bank_credit_offers").update(payload).eq("id", editingId).select("id").single() : await supabaseClient.from("bank_credit_offers").insert(payload).select("id").single();
    if (!result.error && editingId) { var removeLinks = await supabaseClient.from("bank_credit_offer_versions").delete().eq("offer_id", editingId); if (removeLinks.error) result = removeLinks; }
    if (!result.error) { var links = versionIds.map(function (versionId) { return { offer_id: result.data.id, version_id: versionId }; }); var linkResult = await supabaseClient.from("bank_credit_offer_versions").insert(links); if (linkResult.error) { if (!editingId) await supabaseClient.from("bank_credit_offers").delete().eq("id", result.data.id); result = linkResult; } }
    if (result.error) { message.textContent = result.error.message; message.classList.add("is-error"); } else { var modelId = form.elements.modelId.value; await loadCredits(); resetCreditForm(modelId); document.getElementById("creditModel").value = modelId; renderCreditVersions(); message.textContent = editingId ? "Línea de crédito actualizada." : "Línea de crédito disponible para presupuestos."; }
    setBusy(button, false);
  });

  document.getElementById("creditOfferList").addEventListener("click", async function (event) {
    var row = event.target.closest("[data-credit-id]"); if (!row) return; var offer = state.creditOffers.find(function (item) { return item.id === row.dataset.creditId; }); if (!offer) return;
    if (event.target.closest("[data-edit-credit]")) { editCredit(offer); return; }
    if (event.target.closest("[data-toggle-credit]")) { var toggle = await supabaseClient.from("bank_credit_offers").update({ active: !offer.active }).eq("id", offer.id); if (!toggle.error) await loadCredits(); return; }
    if (event.target.closest("[data-duplicate-credit]")) {
      var duplicate = { model_id: offer.model_id, financier_name: offer.financier_name, offer_name: offer.offer_name + " (copia)", term_months: offer.term_months, min_financed_amount: offer.min_financed_amount, max_financed_amount: offer.max_financed_amount, installment_coefficient: offer.installment_coefficient, breakage_rate: offer.breakage_rate, patenting_rate: offer.patenting_rate, fixed_expenses: offer.fixed_expenses, tna: offer.tna, cftea: offer.cftea, notes: offer.notes || "", valid_from: offer.valid_from, valid_to: offer.valid_to, active: false, sort_order: Number(offer.sort_order || 0) + 1 };
      var created = await supabaseClient.from("bank_credit_offers").insert(duplicate).select("id").single();
      if (!created.error) { var versionIds = (offer.versions || []).map(function (link) { var version = Array.isArray(link.version) ? link.version[0] : link.version; return version && version.id; }).filter(Boolean); if (versionIds.length) { var copiedLinks = await supabaseClient.from("bank_credit_offer_versions").insert(versionIds.map(function (versionId) { return { offer_id: created.data.id, version_id: versionId }; })); if (copiedLinks.error) created = copiedLinks; } }
      if (!created.error) await loadCredits(); else { document.getElementById("creditMessage").textContent = created.error.message; document.getElementById("creditMessage").classList.add("is-error"); } return;
    }
    if (event.target.closest("[data-delete-credit]")) {
      if (!window.confirm("¿Querés borrar esta campaña de crédito? Si ya tiene presupuestos emitidos quedará archivada.")) return;
      var usage = await supabaseClient.from("sales_quotes").select("id", { count: "exact", head: true }).eq("bank_credit_offer_id", offer.id);
      var deleted = usage.error ? usage : usage.count ? await supabaseClient.from("bank_credit_offers").update({ active: false }).eq("id", offer.id) : await supabaseClient.from("bank_credit_offers").delete().eq("id", offer.id);
      if (!deleted.error) { if (state.editingCreditId === offer.id) resetCreditForm(offer.model_id); await loadCredits(); } else { document.getElementById("creditMessage").textContent = deleted.error.message; document.getElementById("creditMessage").classList.add("is-error"); }
    }
  });

  exportExcelButton.addEventListener("click", downloadPrequalifications);
  exportSellersButton.addEventListener("click", downloadSellers);

  document.getElementById("brandFilters").addEventListener("click", function (event) {
    var button = event.target.closest("[data-brand]");
    if (!button) {
      return;
    }
    state.brand = button.dataset.brand;
    var first = state.campaigns.find(function (item) { return state.brand === "Todas" || item.brand === state.brand; });
    if (first) {
      state.selectedId = first.id;
    }
    renderFilters();
    renderList();
    renderEditor();
  });

  document.getElementById("campaignList").addEventListener("click", function (event) {
    var button = event.target.closest("[data-id]");
    if (!button) {
      return;
    }
    state.selectedId = button.dataset.id;
    renderList();
    renderEditor();
  });

  campaignForm.addEventListener("input", updatePreview);
  campaignForm.addEventListener("change", updatePreview);

  campaignForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var item = selectedItem();
    var config = formConfig();
    var hours = Number(config.validityHours);
    var slots = config.slots === "" ? null : Number(config.slots);
    var installmentCount = config.installmentCount === "" ? null : Number(config.installmentCount);
    var finalPrice = config.finalPrice === "" ? null : Number(config.finalPrice);
    var advanceAmount = config.advanceAmount === "" ? null : Number(config.advanceAmount);
    var installmentAmount = config.installmentAmount === "" ? null : Number(config.installmentAmount);
    var button = campaignForm.querySelector('button[type="submit"]');
    formMessage.classList.remove("is-error");
    if (config.planName.length < 2) {
      formMessage.textContent = "Ingresá un nombre para el plan comercial.";
      formMessage.classList.add("is-error");
      return;
    }
    if (installmentCount !== null && (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 240)) {
      formMessage.textContent = "La cantidad de cuotas debe estar entre 1 y 240.";
      formMessage.classList.add("is-error");
      return;
    }
    if (finalPrice === null || !Number.isFinite(finalPrice) || finalPrice <= 0) {
      formMessage.textContent = "Ingresá el valor final vigente del plan.";
      formMessage.classList.add("is-error");
      return;
    }
    if ((finalPrice !== null && finalPrice < 0) || (advanceAmount !== null && advanceAmount < 0) || (installmentAmount !== null && installmentAmount < 0)) {
      formMessage.textContent = "El valor final, el anticipo y la cuota no pueden ser negativos.";
      formMessage.classList.add("is-error");
      return;
    }
    if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
      formMessage.textContent = "Ingresá una duración entre 1 y 720 horas.";
      formMessage.classList.add("is-error");
      return;
    }
    if (slots !== null && (!Number.isInteger(slots) || slots < 0)) {
      formMessage.textContent = "Los cupos deben ser un número entero igual o mayor que cero.";
      formMessage.classList.add("is-error");
      return;
    }
    if (config.validFrom && config.validTo && config.validFrom > config.validTo) {
      formMessage.textContent = "La fecha final no puede ser anterior al inicio.";
      formMessage.classList.add("is-error");
      return;
    }
    setBusy(button, true, "Guardando…");
    try {
      var adminProfile = await getAdminProfile();
      if (!adminProfile) {
        var sessionError = new Error("La sesión de administrador venció o cambió.");
        sessionError.code = "ADMIN_SESSION_REQUIRED";
        throw sessionError;
      }
      var result = await supabaseClient.from("campaigns").update({
        active: config.active,
        plan_name: config.planName,
        version_name: config.versionName,
        transmission: config.transmission,
        installment_count: installmentCount,
        final_price: finalPrice,
        advance_amount: advanceAmount,
        installment_amount: installmentAmount,
        installment_is_from: config.installmentIsFrom,
        bonus: config.bonus,
        benefits: config.benefits,
        slots: slots,
        valid_from: config.validFrom || null,
        valid_to: config.validTo || null,
        timer_hours: hours
      }).eq("id", item.id).select().single();
      if (result.error) {
        throw result.error;
      }
      Object.assign(item, {
        active: result.data.active,
        campaign: result.data.plan_name,
        planName: result.data.plan_name,
        versionName: result.data.version_name || "",
        transmission: result.data.transmission || "",
        installmentCount: result.data.installment_count,
        finalPrice: result.data.final_price,
        advanceAmount: result.data.advance_amount,
        installmentAmount: result.data.installment_amount,
        installmentIsFrom: result.data.installment_is_from !== false,
        bonus: result.data.bonus,
        benefits: result.data.benefits,
        slots: result.data.slots,
        validFrom: result.data.valid_from || "",
        validTo: result.data.valid_to || "",
        validityHours: result.data.timer_hours
      });
      renderList();
      renderStats();
      updatePreview();
      formMessage.textContent = "Cambios guardados para todo el equipo.";
    } catch (error) {
      if (error && (error.code === "ADMIN_SESSION_REQUIRED" || error.code === "42501" || error.code === "PGRST116" || error.status === 401 || error.status === 406)) {
        formMessage.textContent = "La sesión activa no tiene permisos de administrador. Volvé a ingresar al panel y repetí el guardado.";
      } else {
        formMessage.textContent = "No se pudieron guardar los cambios. Revisá los datos e intentá nuevamente.";
      }
      formMessage.classList.add("is-error");
    } finally {
      setBusy(button, false);
    }
  });

  document.getElementById("resetButton").addEventListener("click", async function () {
    document.getElementById("campaignActive").checked = true;
    document.getElementById("campaignBonus").value = "Consultar bonificación vigente";
    document.getElementById("campaignBenefits").value = "Asesoramiento personalizado\nCondiciones sujetas a disponibilidad";
    document.getElementById("campaignSlots").value = "";
    document.getElementById("campaignHours").value = "24";
    document.getElementById("campaignValidFrom").value = "";
    document.getElementById("campaignValidTo").value = "";
    updatePreview();
    formMessage.textContent = "Valores iniciales cargados. Presioná Guardar cambios para aplicarlos.";
  });

  document.getElementById("duplicateCampaignButton").addEventListener("click", async function () {
    var item = selectedItem();
    var button = this;
    formMessage.classList.remove("is-error");
    setBusy(button, true, "Duplicando…");
    try {
      var result = await supabaseClient.from("campaigns").insert({
        model_id: item.modelId,
        plan_name: (item.planName + " - nueva").slice(0, 80),
        version_name: item.versionName,
        transmission: item.transmission,
        installment_count: item.installmentCount,
        final_price: item.finalPrice,
        advance_amount: item.advanceAmount,
        installment_amount: item.installmentAmount,
        installment_is_from: item.installmentIsFrom,
        sort_order: item.campaignOrder + 10,
        active: false,
        bonus: item.bonus,
        benefits: item.benefits,
        slots: null,
        valid_from: item.validFrom || null,
        valid_to: item.validTo || null,
        timer_hours: item.validityHours
      }).select("id").single();
      if (result.error) {
        throw result.error;
      }
      state.selectedId = result.data.id;
      await loadCampaigns();
      renderAll();
      formMessage.textContent = "Propuesta duplicada en pausa. Ajustá sus datos y publicala cuando esté lista.";
    } catch (error) {
      formMessage.textContent = "No se pudo duplicar la propuesta. Intentá nuevamente.";
      formMessage.classList.add("is-error");
    } finally {
      setBusy(button, false);
    }
  });

  sellerForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    sellerFormMessage.textContent = "";
    sellerFormMessage.classList.remove("is-error");
    var button = sellerForm.querySelector('button[type="submit"]');
    var requestedRole = sellerForm.elements.role.value;
    setBusy(button, true, "Creando…");
    try {
      await invokeUsers({
        action: "create_user",
        role: requestedRole,
        fullName: sellerForm.elements.fullName.value,
        sellerCode: sellerForm.elements.sellerCode.value,
        tiktokCode: sellerForm.elements.tiktokCode.value,
        phone: sellerForm.elements.phone.value,
        contactEmail: sellerForm.elements.contactEmail.value,
        password: sellerForm.elements.password.value
      });
      sellerForm.reset();
      syncTikTokCodeField();
      sellerFormMessage.textContent = requestedRole === "supervisor" ? "Supervisor creado correctamente." : requestedRole === "admventas" ? "Usuario de Administración de ventas creado correctamente." : "Vendedor creado correctamente.";
      await loadSellers();
    } catch (error) {
      sellerFormMessage.textContent = error.message;
      sellerFormMessage.classList.add("is-error");
    } finally {
      setBusy(button, false);
    }
  });

  document.getElementById("sellerList").addEventListener("click", async function (event) {
    var button = event.target.closest("[data-user-action]");
    if (!button) {
      return;
    }
    if (button.dataset.userAction === "edit") {
      var seller = state.sellers.find(function (item) { return item.user_id === button.dataset.userId; });
      if (!seller) {
        return;
      }
      document.getElementById("editSellerUserId").value = seller.user_id;
      document.getElementById("editSellerFullName").value = seller.full_name || "";
      document.getElementById("editSellerCode").value = seller.seller_code || "";
      document.getElementById("editSellerTikTokCode").value = seller.tiktok_code || "";
      document.getElementById("editSellerPhone").value = seller.phone || "";
      document.getElementById("editSellerEmail").value = seller.contact_email || "";
      document.getElementById("sellerEditMessage").textContent = "";
      document.getElementById("sellerEditMessage").classList.remove("is-error");
      document.getElementById("sellerEditDialog").showModal();
      return;
    }
    if (button.dataset.userAction === "password") {
      document.getElementById("passwordUserId").value = button.dataset.userId;
      document.getElementById("passwordSellerName").textContent = button.dataset.userName;
      document.getElementById("newSellerPassword").value = "";
      document.getElementById("passwordMessage").textContent = "";
      document.getElementById("passwordDialog").showModal();
      return;
    }
    setBusy(button, true, "Guardando…");
    try {
      await invokeUsers({ action: "set_active", userId: button.dataset.userId, active: button.dataset.active !== "true" });
      await loadSellers();
    } catch (error) {
      sellerFormMessage.textContent = error.message;
      sellerFormMessage.classList.add("is-error");
      setBusy(button, false);
    }
  });

  document.getElementById("sellerEditForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (event.submitter && event.submitter.value === "cancel") {
      document.getElementById("sellerEditDialog").close();
      return;
    }
    var message = document.getElementById("sellerEditMessage");
    var button = document.getElementById("saveSellerEditButton");
    message.textContent = "";
    message.classList.remove("is-error");
    setBusy(button, true, "Guardando…");
    try {
      await invokeUsers({
        action: "update_seller",
        userId: document.getElementById("editSellerUserId").value,
        fullName: document.getElementById("editSellerFullName").value,
        sellerCode: document.getElementById("editSellerCode").value,
        tiktokCode: document.getElementById("editSellerTikTokCode").value,
        phone: document.getElementById("editSellerPhone").value,
        contactEmail: document.getElementById("editSellerEmail").value
      });
      document.getElementById("sellerEditDialog").close();
      sellerFormMessage.textContent = "Datos del vendedor actualizados correctamente.";
      sellerFormMessage.classList.remove("is-error");
      await loadSellers();
    } catch (error) {
      message.textContent = error.message;
      message.classList.add("is-error");
    } finally {
      setBusy(button, false);
    }
  });

  sellerForm.elements.role.addEventListener("change", syncTikTokCodeField);
  syncTikTokCodeField();

  document.getElementById("passwordForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (event.submitter && event.submitter.value === "cancel") {
      document.getElementById("passwordDialog").close();
      return;
    }
    var password = document.getElementById("newSellerPassword").value;
    var message = document.getElementById("passwordMessage");
    if (password.length < 8) {
      message.textContent = "La contraseña debe tener al menos 8 caracteres.";
      message.classList.add("is-error");
      return;
    }
    var button = document.getElementById("savePasswordButton");
    setBusy(button, true, "Guardando…");
    try {
      await invokeUsers({ action: "reset_password", userId: document.getElementById("passwordUserId").value, password: password });
      document.getElementById("passwordDialog").close();
      sellerFormMessage.textContent = "Contraseña actualizada correctamente.";
      sellerFormMessage.classList.remove("is-error");
    } catch (error) {
      message.textContent = error.message;
      message.classList.add("is-error");
    } finally {
      setBusy(button, false);
    }
  });

  document.getElementById("currentDate").textContent = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date());

  if (!supabaseClient) {
    loginError.textContent = "No se pudo conectar con el servicio de acceso.";
    return;
  }

  supabaseClient.auth.getUser().then(function (result) {
    if (result.data && result.data.user) {
      enterAdmin().catch(function (error) {
        showLogin();
        loginError.textContent = error.message;
      });
    } else {
      showLogin();
    }
  });
}());
