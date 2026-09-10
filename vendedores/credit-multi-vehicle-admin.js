(function () {
  "use strict";

  var supabaseClient = window.grupoSurSupabaseClient;
  var core = window.grupoSurCreditApplicability;
  if (!supabaseClient || !core) return;

  var creditView = document.getElementById("creditAdminView");
  var form = document.getElementById("creditForm");
  var versionOptions = document.getElementById("creditVersionOptions");
  var offerList = document.getElementById("creditOfferList");
  var message = document.getElementById("creditMessage");
  var cancelButton = document.getElementById("cancelCreditEdit");
  var submitButton = document.getElementById("creditSubmit");
  var legacyModel = document.getElementById("creditModel");
  if (!creditView || !form || !versionOptions || !offerList || !legacyModel) return;

  var state = {
    models: [],
    versions: [],
    offers: [],
    selectedVersionIds: new Set(),
    editingId: "",
    renderingOffers: false,
    renderingApplicability: false,
    refreshTimer: null
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatMoney(value) {
    if (value == null || value === "" || !Number.isFinite(Number(value))) return "—";
    return "$" + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Number(value));
  }

  function parseLocalizedDecimal(value) {
    var clean = String(value == null ? "" : value).trim().replace(/\s/g, "");
    if (!clean) return NaN;
    if (clean.includes(",") && clean.includes(".")) {
      clean = clean.lastIndexOf(",") > clean.lastIndexOf(".")
        ? clean.replace(/\./g, "").replace(",", ".")
        : clean.replace(/,/g, "");
    } else {
      clean = clean.replace(",", ".");
    }
    return Number(clean);
  }

  function brandOf(model) {
    var brand = model && model.brand;
    brand = Array.isArray(brand) ? brand[0] : brand;
    return brand || { name: "Sin marca", sort_order: 999 };
  }

  function sortedModels() {
    return state.models.slice().sort(function (a, b) {
      var brandA = brandOf(a); var brandB = brandOf(b);
      return Number(brandA.sort_order || 0) - Number(brandB.sort_order || 0)
        || Number(a.sort_order || 0) - Number(b.sort_order || 0)
        || a.name.localeCompare(b.name, "es");
    });
  }

  function injectStyles() {
    if (document.getElementById("creditMultiVehicleStyles")) return;
    var style = document.createElement("style");
    style.id = "creditMultiVehicleStyles";
    style.textContent = [
      "#creditModel{display:none!important}",
      ".credit-multi-legacy-model{display:none!important}",
      ".credit-multi-toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px}",
      ".credit-multi-toolbar p{margin:0;color:#667085;font-size:13px}",
      ".credit-multi-actions{display:flex;gap:8px;flex-wrap:wrap}",
      ".credit-multi-actions button{border:1px solid #d0d5dd;background:#fff;border-radius:9px;padding:7px 10px;font-weight:700;cursor:pointer}",
      ".credit-brand-block{border:1px solid #e4e7ec;border-radius:12px;margin:10px 0;overflow:hidden;background:#fff}",
      ".credit-brand-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f8fafc}",
      ".credit-brand-head strong{font-size:14px}",
      ".credit-model-block{border-top:1px solid #eef2f6;padding:10px 12px}",
      ".credit-model-line{display:flex;align-items:center;justify-content:space-between;gap:12px}",
      ".credit-model-line label{display:flex;gap:8px;align-items:center;font-weight:800;cursor:pointer}",
      ".credit-model-line small{color:#667085}",
      ".credit-version-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:7px 12px;margin-top:9px;padding-left:24px}",
      ".credit-version-grid label{display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer}",
      ".credit-model-empty{color:#98a2b3;font-size:12px;margin-top:6px;padding-left:24px}",
      ".credit-applicability-summary{font-weight:800;color:#344054}",
      ".credit-offer-models{display:block;color:#344054;font-size:12px;margin-top:4px}",
      ".credit-offer-versions{display:block;color:#667085;font-size:11px;margin-top:3px}",
      ".credit-multi-state{display:inline-flex;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:800;background:#ecfdf3;color:#027a48;margin-left:6px}",
      ".credit-multi-state.paused{background:#f2f4f7;color:#667085}",
      ".credit-multi-no-versions{padding:14px;border:1px dashed #d0d5dd;border-radius:10px;color:#667085}"
    ].join("");
    document.head.appendChild(style);
    var modelLabel = legacyModel.closest("label");
    if (modelLabel) modelLabel.classList.add("credit-multi-legacy-model");
    var fieldset = versionOptions.closest("fieldset");
    if (fieldset) {
      var legend = fieldset.querySelector("legend");
      if (legend) legend.textContent = "Modelos y versiones a los que aplica";
    }
  }

  async function loadData() {
    var results = await Promise.all([
      supabaseClient.from("models").select("id,name,sort_order,active,brand:brands!inner(name,sort_order)").eq("active", true),
      supabaseClient.from("model_versions").select("id,model_id,name,suggested_price,sort_order,active").order("sort_order").order("name"),
      supabaseClient.from("bank_credit_offers").select("id,model_id,financier_name,offer_name,term_months,min_financed_amount,max_financed_amount,installment_coefficient,breakage_rate,patenting_rate,fixed_expenses,tna,cftea,notes,valid_from,valid_to,active,sort_order,created_at,versions:bank_credit_offer_versions(version:model_versions(id,model_id,name,suggested_price,active))").order("created_at", { ascending: false })
    ]);
    var failed = results.find(function (item) { return item.error; });
    if (failed) throw failed.error;
    state.models = results[0].data || [];
    state.versions = results[1].data || [];
    state.offers = results[2].data || [];
    renderApplicability();
    renderOffers();
  }

  function selectedCountText() {
    var selected = state.selectedVersionIds.size;
    var modelCount = new Set(state.versions.filter(function (version) {
      return state.selectedVersionIds.has(version.id);
    }).map(function (version) { return version.model_id; })).size;
    return modelCount + (modelCount === 1 ? " modelo" : " modelos") + " · " + selected + (selected === 1 ? " versión" : " versiones");
  }

  function renderApplicability() {
    if (state.renderingApplicability) return;
    state.renderingApplicability = true;
    try {
      var groups = core.groupSelectedVersions(sortedModels(), state.versions, state.selectedVersionIds);
      var brands = [];
      groups.forEach(function (group) {
        var brand = brandOf(group.model);
        var existing = brands.find(function (item) { return item.name === brand.name; });
        if (!existing) {
          existing = { name: brand.name, groups: [] };
          brands.push(existing);
        }
        existing.groups.push(group);
      });
      var html = '<div data-credit-multi-root><div class="credit-multi-toolbar"><p>Marcá uno o varios modelos. “Todo el modelo” guarda las versiones que existen hoy; una versión nueva no se habilita automáticamente.</p><div class="credit-multi-actions"><button type="button" data-credit-clear>Limpiar</button></div><strong class="credit-applicability-summary">' + escapeHtml(selectedCountText()) + '</strong></div>';
      brands.forEach(function (brand) {
        html += '<section class="credit-brand-block"><div class="credit-brand-head"><strong>' + escapeHtml(brand.name) + '</strong><div class="credit-multi-actions"><button type="button" data-credit-select-brand="' + escapeHtml(brand.name) + '">Seleccionar toda la marca</button></div></div>';
        brand.groups.forEach(function (group) {
          html += '<div class="credit-model-block" data-credit-model-block="' + group.model.id + '"><div class="credit-model-line"><label><input type="checkbox" data-credit-model-checkbox="' + group.model.id + '"' + (group.allSelected ? ' checked' : '') + (group.versions.length ? '' : ' disabled') + '><span>' + escapeHtml(group.model.name) + '</span></label><small>' + group.selectedCount + '/' + group.versions.length + ' seleccionadas</small></div>';
          if (group.versions.length) {
            html += '<div class="credit-version-grid">' + group.versions.map(function (version) {
              return '<label><input type="checkbox" data-credit-version-id="' + version.id + '"' + (state.selectedVersionIds.has(version.id) ? ' checked' : '') + '><span>' + escapeHtml(version.name) + (version.suggested_price == null ? '' : ' · ' + formatMoney(version.suggested_price)) + '</span></label>';
            }).join("") + '</div>';
          } else {
            html += '<div class="credit-model-empty">Sin versiones cargadas. Primero agregalas desde el catálogo.</div>';
          }
          html += '</div>';
        });
        html += '</section>';
      });
      if (!brands.length) html += '<div class="credit-multi-no-versions">No hay modelos activos disponibles.</div>';
      html += '</div>';
      versionOptions.innerHTML = html;
      groups.forEach(function (group) {
        var checkbox = versionOptions.querySelector('[data-credit-model-checkbox="' + group.model.id + '"]');
        if (checkbox) checkbox.indeterminate = group.partiallySelected;
      });
    } finally {
      state.renderingApplicability = false;
    }
  }

  function offerModelsSummary(offer) {
    var versionIds = new Set(core.offerVersionIds(offer));
    var groups = core.groupSelectedVersions(sortedModels(), state.versions, versionIds).filter(function (group) { return group.selectedCount > 0; });
    return groups.map(function (group) {
      return group.model.name + " " + group.selectedCount + "/" + group.versions.length;
    }).join(" · ");
  }

  function offerVersionsSummary(offer) {
    return (offer.versions || []).map(core.unwrapVersion).filter(Boolean).map(function (version) { return version.name; }).join(", ");
  }

  function renderOffers() {
    if (state.renderingOffers) return;
    state.renderingOffers = true;
    try {
      offerList.innerHTML = state.offers.length ? state.offers.map(function (offer) {
        var coefficient = Number(offer.installment_coefficient || 0) * 1000;
        var models = offerModelsSummary(offer) || "Sin aplicabilidad";
        var versions = offerVersionsSummary(offer) || "Sin versiones habilitadas";
        return '<article class="credit-offer-row' + (offer.active ? '' : ' is-paused') + '" data-credit-id="' + offer.id + '" data-credit-multi-row><div><strong>' + escapeHtml(offer.financier_name + " · " + offer.offer_name) + '<span class="credit-multi-state' + (offer.active ? '' : ' paused') + '">' + (offer.active ? 'Activa' : 'Pausada') + '</span></strong><span>' + escapeHtml(offer.term_months + " cuotas · " + formatMoney(offer.min_financed_amount) + " a " + formatMoney(offer.max_financed_amount)) + '</span><small class="credit-offer-models">' + escapeHtml(models) + '</small><small class="credit-offer-versions">' + escapeHtml(versions) + '</small></div><div><strong>$' + escapeHtml(new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(coefficient)) + '</strong><span>por cada $1.000</span></div><div class="credit-row-actions"><button data-edit-credit type="button">Editar</button><button data-duplicate-credit type="button">Duplicar</button><button data-toggle-credit type="button">' + (offer.active ? 'Pausar' : 'Activar') + '</button><button class="danger" data-delete-credit type="button">Borrar</button></div></article>';
      }).join("") : '<div class="seller-empty">Todavía no hay líneas de crédito cargadas.</div>';
    } finally {
      state.renderingOffers = false;
    }
  }

  function setMessage(text, isError) {
    message.textContent = text || "";
    message.classList.toggle("is-error", Boolean(isError));
  }

  function setBusy(busy, label) {
    if (!submitButton) return;
    if (busy) {
      submitButton.dataset.creditLabel = submitButton.textContent;
      submitButton.textContent = label || "Guardando…";
      submitButton.disabled = true;
    } else {
      submitButton.textContent = state.editingId ? "Guardar cambios" : "Guardar línea de crédito";
      delete submitButton.dataset.creditLabel;
      submitButton.disabled = false;
    }
  }

  function resetForm() {
    state.editingId = "";
    state.selectedVersionIds = new Set();
    form.reset();
    form.elements.breakageRate.value = "0";
    form.elements.patentingRate.value = "0";
    form.elements.fixedExpenses.value = "0";
    document.getElementById("creditFormTitle").textContent = "Nueva línea de crédito";
    submitButton.textContent = "Guardar línea de crédito";
    cancelButton.hidden = true;
    renderApplicability();
    setMessage("", false);
  }

  function editOffer(offer) {
    state.editingId = offer.id;
    state.selectedVersionIds = new Set((offer.versions || []).map(core.unwrapVersion).filter(function (version) { return version && version.active !== false; }).map(function (version) { return version.id; }));
    form.elements.financierName.value = offer.financier_name || "";
    form.elements.offerName.value = offer.offer_name || "";
    form.elements.termMonths.value = offer.term_months || "";
    form.elements.minFinanced.value = offer.min_financed_amount == null ? "" : offer.min_financed_amount;
    form.elements.maxFinanced.value = offer.max_financed_amount == null ? "" : offer.max_financed_amount;
    form.elements.installmentPerThousand.value = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(Number(offer.installment_coefficient || 0) * 1000);
    form.elements.breakageRate.value = offer.breakage_rate || 0;
    form.elements.patentingRate.value = offer.patenting_rate || 0;
    form.elements.fixedExpenses.value = offer.fixed_expenses || 0;
    form.elements.tna.value = offer.tna == null ? "" : offer.tna;
    form.elements.cftea.value = offer.cftea == null ? "" : offer.cftea;
    form.elements.validFrom.value = offer.valid_from || "";
    form.elements.validTo.value = offer.valid_to || "";
    form.elements.notes.value = offer.notes || "";
    document.getElementById("creditFormTitle").textContent = "Editar línea de crédito";
    submitButton.textContent = "Guardar cambios";
    cancelButton.hidden = false;
    renderApplicability();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function rpcPayload(offerId, active, sortOrder, offerNameOverride) {
    var min = form.elements.minFinanced.value ? Number(form.elements.minFinanced.value) : null;
    var max = form.elements.maxFinanced.value ? Number(form.elements.maxFinanced.value) : null;
    var perThousand = parseLocalizedDecimal(form.elements.installmentPerThousand.value);
    return {
      p_offer_id: offerId || null,
      p_financier_name: form.elements.financierName.value.trim(),
      p_offer_name: offerNameOverride == null ? form.elements.offerName.value.trim() : offerNameOverride,
      p_term_months: Number(form.elements.termMonths.value),
      p_min_financed_amount: min,
      p_max_financed_amount: max,
      p_installment_coefficient: perThousand / 1000,
      p_breakage_rate: Number(form.elements.breakageRate.value || 0),
      p_patenting_rate: Number(form.elements.patentingRate.value || 0),
      p_fixed_expenses: Number(form.elements.fixedExpenses.value || 0),
      p_tna: form.elements.tna.value ? Number(form.elements.tna.value) : null,
      p_cftea: form.elements.cftea.value ? Number(form.elements.cftea.value) : null,
      p_notes: form.elements.notes.value.trim() || "",
      p_valid_from: form.elements.validFrom.value || null,
      p_valid_to: form.elements.validTo.value || null,
      p_active: active !== false,
      p_sort_order: Number(sortOrder == null ? 10 : sortOrder),
      p_version_ids: Array.from(state.selectedVersionIds)
    };
  }

  function validateForm() {
    if (!state.selectedVersionIds.size) return "Elegí al menos una versión habilitada.";
    var min = form.elements.minFinanced.value ? Number(form.elements.minFinanced.value) : null;
    var max = form.elements.maxFinanced.value ? Number(form.elements.maxFinanced.value) : null;
    if (min !== null && max !== null && min > max) return "El mínimo financiable no puede superar al máximo.";
    var perThousand = parseLocalizedDecimal(form.elements.installmentPerThousand.value);
    if (!Number.isFinite(perThousand) || perThousand <= 0) return "Ingresá una cuota válida por cada $1.000, por ejemplo 83,33.";
    if (!form.elements.financierName.value.trim() || !form.elements.offerName.value.trim()) return "Completá financiera y nombre de la línea.";
    if (!Number.isInteger(Number(form.elements.termMonths.value)) || Number(form.elements.termMonths.value) < 1) return "Ingresá una cantidad de cuotas válida.";
    return "";
  }

  async function saveOffer(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    setMessage("", false);
    var validation = validateForm();
    if (validation) { setMessage(validation, true); return; }
    var existing = state.offers.find(function (offer) { return offer.id === state.editingId; });
    setBusy(true, "Guardando…");
    try {
      var result = await supabaseClient.rpc("admin_upsert_bank_credit_offer", rpcPayload(state.editingId || null, existing ? existing.active : true, existing ? existing.sort_order : 10));
      if (result.error) throw result.error;
      await loadData();
      resetForm();
      setMessage(existing ? "Línea de crédito actualizada para todos los modelos seleccionados." : "Línea de crédito creada y disponible para las versiones seleccionadas.", false);
    } catch (error) {
      setMessage(error.message || "No se pudo guardar la línea de crédito.", true);
    } finally {
      setBusy(false);
    }
  }

  async function duplicateOffer(offer) {
    editOffer(offer);
    var payload = rpcPayload(null, false, Number(offer.sort_order || 0) + 1, offer.offer_name + " (copia)");
    var result = await supabaseClient.rpc("admin_upsert_bank_credit_offer", payload);
    if (result.error) throw result.error;
    await loadData();
    resetForm();
    setMessage("Copia creada en pausa. Podés editarla y activarla cuando esté lista.", false);
  }

  async function deleteOffer(offer) {
    var usage = await supabaseClient.from("sales_quotes").select("id", { count: "exact", head: true }).eq("bank_credit_offer_id", offer.id);
    if (usage.error) throw usage.error;
    var result;
    if (usage.count) {
      result = await supabaseClient.from("bank_credit_offers").update({ active: false }).eq("id", offer.id);
      if (!result.error) setMessage("El crédito tiene presupuestos históricos: quedó archivado en lugar de borrarse.", false);
    } else {
      result = await supabaseClient.from("bank_credit_offers").delete().eq("id", offer.id);
      if (!result.error) setMessage("Crédito eliminado.", false);
    }
    if (result.error) throw result.error;
    if (state.editingId === offer.id) resetForm();
    await loadData();
  }

  function scheduleRefresh(delay) {
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(function () {
      if (creditView.hidden) return;
      loadData().catch(function (error) { setMessage(error.message, true); });
    }, delay == null ? 0 : delay);
  }

  versionOptions.addEventListener("change", function (event) {
    var versionId = event.target.getAttribute("data-credit-version-id");
    var modelId = event.target.getAttribute("data-credit-model-checkbox");
    if (versionId) {
      if (event.target.checked) state.selectedVersionIds.add(versionId); else state.selectedVersionIds.delete(versionId);
      renderApplicability();
      return;
    }
    if (modelId) {
      state.versions.filter(function (version) { return version.model_id === modelId && version.active !== false; }).forEach(function (version) {
        if (event.target.checked) state.selectedVersionIds.add(version.id); else state.selectedVersionIds.delete(version.id);
      });
      renderApplicability();
    }
  }, true);

  versionOptions.addEventListener("click", function (event) {
    var clear = event.target.closest("[data-credit-clear]");
    if (clear) { state.selectedVersionIds = new Set(); renderApplicability(); return; }
    var brandButton = event.target.closest("[data-credit-select-brand]");
    if (brandButton) {
      var brandName = brandButton.getAttribute("data-credit-select-brand");
      var modelIds = new Set(state.models.filter(function (model) { return brandOf(model).name === brandName; }).map(function (model) { return model.id; }));
      state.versions.filter(function (version) { return modelIds.has(version.model_id) && version.active !== false; }).forEach(function (version) { state.selectedVersionIds.add(version.id); });
      renderApplicability();
    }
  }, true);

  form.addEventListener("submit", saveOffer, true);

  cancelButton.addEventListener("click", function (event) {
    event.preventDefault(); event.stopImmediatePropagation(); resetForm();
  }, true);

  offerList.addEventListener("click", async function (event) {
    var row = event.target.closest("[data-credit-id]");
    if (!row) return;
    event.preventDefault(); event.stopImmediatePropagation();
    var offer = state.offers.find(function (item) { return item.id === row.getAttribute("data-credit-id"); });
    if (!offer) return;
    try {
      if (event.target.closest("[data-edit-credit]")) { editOffer(offer); return; }
      if (event.target.closest("[data-toggle-credit]")) {
        var toggle = await supabaseClient.from("bank_credit_offers").update({ active: !offer.active }).eq("id", offer.id);
        if (toggle.error) throw toggle.error;
        await loadData(); return;
      }
      if (event.target.closest("[data-duplicate-credit]")) { await duplicateOffer(offer); return; }
      if (event.target.closest("[data-delete-credit]")) {
        if (!window.confirm("¿Querés eliminar esta línea de crédito? Si ya tiene presupuestos emitidos se archivará para conservar el historial.")) return;
        await deleteOffer(offer);
      }
    } catch (error) {
      setMessage(error.message || "No se pudo completar la acción.", true);
    }
  }, true);

  document.querySelector(".sidebar nav").addEventListener("click", function (event) {
    var button = event.target.closest('[data-admin-view="credits"]');
    if (button) scheduleRefresh(50);
  });

  var offerObserver = new MutationObserver(function () {
    if (creditView.hidden || state.renderingOffers) return;
    if (!offerList.querySelector("[data-credit-multi-row]") && state.offers.length) window.setTimeout(renderOffers, 0);
  });
  offerObserver.observe(offerList, { childList: true });

  var applicabilityObserver = new MutationObserver(function () {
    if (creditView.hidden || state.renderingApplicability) return;
    if (!versionOptions.querySelector("[data-credit-multi-root]")) window.setTimeout(renderApplicability, 0);
  });
  applicabilityObserver.observe(versionOptions, { childList: true });

  var versionForm = document.getElementById("versionForm");
  if (versionForm) versionForm.addEventListener("submit", function () { scheduleRefresh(700); });
  var versionList = document.getElementById("versionList");
  if (versionList) versionList.addEventListener("click", function () { scheduleRefresh(700); });

  injectStyles();
  if (!creditView.hidden) scheduleRefresh(0);
}());
