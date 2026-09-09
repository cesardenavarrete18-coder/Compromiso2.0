(function (root) {
  "use strict";

  var supabaseClient = root.grupoSurSupabaseClient;
  var playbookModel = root.grupoSurManagementPlaybook;
  if (!supabaseClient || !playbookModel) return;

  var TIME_ZONE = "America/Argentina/Buenos_Aires";
  var state = {
    leadId: null,
    lead: null,
    crm: null,
    items: Object.create(null),
    persistenceAvailable: true,
    loadToken: 0
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char];
    });
  }

  function crmOf(lead) {
    if (!lead || !lead.crm) return {};
    return Array.isArray(lead.crm) ? lead.crm[0] || {} : lead.crm;
  }

  function dateKey(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(value));
  }

  function formatDate(value) {
    if (!value) return "Sin programar";
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: TIME_ZONE,
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function formatNextContact(value) {
    if (!value) return "Sin programar";
    var now = new Date();
    var target = new Date(value);
    var time = new Intl.DateTimeFormat("es-AR", {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(target);
    if (dateKey(target) === dateKey(now)) return "Hoy · " + time;
    var tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    if (dateKey(target) === dateKey(tomorrow)) return "Mañana · " + time;
    var parts = {};
    new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short" }).formatToParts(target).forEach(function (part) {
      if (part.type !== "literal") parts[part.type] = part.value;
    });
    var capitalize = function (text) { text = text.replace(/\./g, ""); return text.charAt(0).toUpperCase() + text.slice(1); };
    return capitalize(parts.weekday) + " " + parts.day + " " + capitalize(parts.month) + " · " + time;
  }

  function originLabel(lead) {
    if (!lead) return "Sin origen";
    if (lead.source_channel === "manual") return "Carga manual" + (lead.source_detail ? " · " + lead.source_detail : "");
    if (lead.source_channel === "tiktok") return "TikTok";
    if (lead.source_detail === "meta_ads") return "Meta Ads";
    if (lead.source_channel === "whatsapp") return "WhatsApp";
    return lead.source_detail || lead.source_channel || "Sin origen";
  }

  function sellerName() {
    var node = document.getElementById("sidebarSellerName");
    var value = node && node.textContent && node.textContent.trim();
    return value && value !== "Vendedor" ? value : "tu asesor comercial";
  }

  function contextForTemplate() {
    return {
      customerName: state.lead && state.lead.customer_name || "",
      sellerName: sellerName(),
      modelInterest: state.lead && state.lead.model_interest || ""
    };
  }

  function ensureExperienceRoot() {
    var managePanel = document.querySelector('[data-crm-panel="manage"]');
    if (!managePanel) return null;
    var container = document.getElementById("enGestionExperience");
    if (!container) {
      container = document.createElement("section");
      container.id = "enGestionExperience";
      container.className = "en-gestion-playbook";
      container.hidden = true;
      managePanel.insertBefore(container, managePanel.firstChild);
    }
    return container;
  }

  function setExperienceActive(active) {
    var dialog = document.getElementById("crmLeadDialog");
    var container = ensureExperienceRoot();
    if (dialog) dialog.classList.toggle("en-gestion-active", Boolean(active));
    if (container) container.hidden = !active;
  }

  function relabelLegacyStageNames() {
    var badge = document.getElementById("crmLeadStage");
    if (badge && badge.textContent.trim() === "En proceso") badge.textContent = "En gestión";

    var statusSelect = document.getElementById("crmStatusInput");
    if (statusSelect) {
      Array.from(statusSelect.options).forEach(function (option) {
        if (option.value === "en_proceso" && option.textContent !== "En gestión") option.textContent = "En gestión";
      });
    }

    document.querySelectorAll('.crm-stage[data-stage="en_proceso"]').forEach(function (node) {
      if (node.textContent !== "En gestión") node.textContent = "En gestión";
    });

    document.querySelectorAll("#crmPipeline .pipeline-head strong").forEach(function (node) {
      if (node.textContent.trim() === "En proceso") node.textContent = "En gestión";
    });

    document.querySelectorAll("#crmAgenda .agenda-group.requires-action").forEach(function (group) {
      if (!group.classList.contains("integrity-remediation")) group.classList.add("integrity-remediation");
      var title = group.querySelector(".agenda-group-head h3");
      if (title && title.textContent.trim() === "Sin próxima acción") title.textContent = "Requieren corrección";
      var empty = group.querySelector(".agenda-empty");
      if (empty && empty.textContent.indexOf("próximo paso") !== -1) empty.textContent = "No hay inconsistencias de próxima acción.";
    });
  }

  async function loadLead(leadId) {
    var result = await supabaseClient.from("leads").select(
      "id, customer_phone, customer_name, source_channel, source_detail, intent_summary, model_interest, created_at, last_message_at, crm:lead_crm(status, priority, status_reason, next_contact_at, next_contact_note, next_contact_source, last_contact_at, last_contact_outcome, interview_at, interview_location, deposit_amount, updated_at)"
    ).eq("id", leadId).maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  }

  async function loadPlaybookItems(leadId) {
    var result = await supabaseClient.from("lead_management_playbook_items")
      .select("item_key, completed, completed_at, completed_by, updated_at")
      .eq("lead_id", leadId);
    if (result.error) {
      var missingTable = result.error.code === "42P01" || result.error.code === "PGRST205" || /lead_management_playbook_items/i.test(result.error.message || "");
      if (missingTable) {
        state.persistenceAvailable = false;
        return Object.create(null);
      }
      throw result.error;
    }
    state.persistenceAvailable = true;
    return (result.data || []).reduce(function (map, item) {
      map[item.item_key] = item;
      return map;
    }, Object.create(null));
  }

  async function syncLead(leadId) {
    if (!leadId) return;
    state.leadId = leadId;
    var token = ++state.loadToken;
    relabelLegacyStageNames();
    try {
      var lead = await loadLead(leadId);
      if (token !== state.loadToken || !lead) return;
      state.lead = lead;
      state.crm = crmOf(lead);
      if (state.crm.status !== "en_proceso") {
        setExperienceActive(false);
        return;
      }
      state.items = await loadPlaybookItems(leadId);
      if (token !== state.loadToken) return;
      setExperienceActive(true);
      renderExperience();
    } catch (error) {
      if (token !== state.loadToken) return;
      setExperienceActive(state.crm && state.crm.status === "en_proceso");
      renderFatalError(error);
    }
  }

  function openLead(lead) {
    state.leadId = lead && lead.id || null;
    state.lead = lead || null;
    state.crm = crmOf(lead);
    state.items = Object.create(null);
    var active = Boolean(state.leadId && state.crm.status === "en_proceso");
    setExperienceActive(active);
    if (!active) return;
    renderExperience();
    loadPlaybookItems(state.leadId).then(function (items) {
      if (!state.lead || state.lead.id !== lead.id) return;
      state.items = items;
      renderExperience();
    }).catch(function (error) {
      if (state.lead && state.lead.id === lead.id) renderFatalError(error);
    });
  }

  function completedCount() {
    return playbookModel.allItemKeys().filter(function (key) {
      return state.items[key] && state.items[key].completed;
    }).length;
  }

  function itemAction(item) {
    if (item.kind === "message") return '<button class="en-gestion-action" type="button" data-en-template="' + escapeHtml(item.template || "initial") + '">Usar mensaje</button>';
    if (item.kind === "quote") return '<button class="en-gestion-action" type="button" data-en-budget>Abrir presupuesto</button>';
    if (item.kind === "material") return '<button class="en-gestion-action" type="button" data-en-materials>Ver material</button>';
    if (item.kind === "follow_up") return '<button class="en-gestion-action" type="button" data-en-next>Programar</button>';
    if (item.key === "attempt_next_stage") return '<button class="en-gestion-action" type="button" data-en-result>Registrar resultado</button>';
    return "";
  }

  function renderPlaybookItem(item) {
    var saved = state.items[item.key];
    var complete = Boolean(saved && saved.completed);
    return '<article class="en-gestion-item' + (complete ? ' is-complete' : '') + '" data-playbook-item="' + escapeHtml(item.key) + '">' +
      '<span class="status-dot" aria-hidden="true">' + (complete ? "✓" : "") + '</span>' +
      '<div class="en-gestion-item-copy"><strong>' + escapeHtml(item.label) + '</strong><small>' +
        (complete && saved.completed_at ? "Registrado · " + escapeHtml(formatDate(saved.completed_at)) : "Pendiente de registrar") +
      '</small></div>' +
      '<div class="en-gestion-item-actions">' + itemAction(item) +
        '<button class="en-gestion-record' + (complete ? ' is-complete' : '') + '" type="button" data-playbook-toggle="' + escapeHtml(item.key) + '" aria-pressed="' + (complete ? "true" : "false") + '">' +
          (complete ? "Reabrir" : "Registrar") +
        '</button>' +
      '</div>' +
    '</article>';
  }

  function renderPlaybook() {
    return '<div class="en-gestion-section-heading"><div><span>Playbook comercial</span><strong>Qué conviene resolver en esta etapa</strong></div><small>Registrá hechos ocurridos; no es un puntaje del vendedor.</small></div>' +
      '<div class="en-gestion-groups">' + playbookModel.groups.map(function (group) {
        return '<section class="en-gestion-group"><header><strong>' + escapeHtml(group.label) + '</strong></header><div class="en-gestion-items">' +
          group.items.map(renderPlaybookItem).join("") +
        '</div></section>';
      }).join("") + '</div>';
  }

  function renderMessages() {
    var context = contextForTemplate();
    return '<section class="en-gestion-toolbox" id="enGestionMessages"><header><div><span>Mensajes sugeridos</span><strong>Atajos editables para continuar la conversación</strong></div></header>' +
      '<div class="en-gestion-template-list">' + playbookModel.templates.map(function (template) {
        var body = playbookModel.interpolate(template.body, context);
        return '<article class="en-gestion-template"><div><strong>' + escapeHtml(template.label) + '</strong><p>' + escapeHtml(body) + '</p></div><div class="en-gestion-tool-actions">' +
          '<button type="button" data-copy-template="' + escapeHtml(template.key) + '">Copiar</button>' +
          '<button type="button" data-en-template="' + escapeHtml(template.key) + '">Usar en WhatsApp</button>' +
        '</div></article>';
      }).join("") + '</div></section>';
  }

  function absoluteAssetUrl(path) {
    try { return new URL(path, root.location.origin).href; }
    catch (_) { return path; }
  }

  function materialCard(asset, typeLabel) {
    var absolute = absoluteAssetUrl(asset.url);
    return '<article class="en-gestion-material"><div><strong>' + escapeHtml(asset.label) + '</strong><small>' + escapeHtml(typeLabel) + '</small></div><div class="en-gestion-tool-actions">' +
      '<a href="' + escapeHtml(asset.url) + '" target="_blank" rel="noopener">Ver</a>' +
      '<button type="button" data-share-material="' + escapeHtml(absolute) + '" data-material-label="' + escapeHtml(asset.label) + '">Compartir</button>' +
    '</div></article>';
  }

  function renderMaterials() {
    var material = playbookModel.resolveMaterials(state.lead && state.lead.model_interest);
    var cards = '<article class="en-gestion-material featured"><div><strong>Presupuesto comercial</strong><small>Usa el generador existente y lo vincula a este Lead.</small></div><div class="en-gestion-tool-actions"><button type="button" data-en-budget>Generar</button></div></article>';
    if (material) {
      cards += (material.photos || []).map(function (asset) { return materialCard(asset, "Foto del vehículo"); }).join("");
      cards += (material.technical || []).map(function (asset) { return materialCard(asset, asset.type === "pdf" ? "Ficha técnica PDF" : "Material técnico"); }).join("");
    }
    if (!material) cards += '<div class="en-gestion-empty">No hay material versionado asociado automáticamente a este modelo todavía.</div>';
    return '<section class="en-gestion-toolbox" id="enGestionMaterials"><header><div><span>Material sugerido</span><strong>' + escapeHtml(material ? material.label : state.lead.model_interest || "Modelo a definir") + '</strong></div></header><div class="en-gestion-material-list">' + cards + '</div></section>';
  }

  function renderContext() {
    var crm = state.crm || {};
    return '<section class="en-gestion-context"><div class="en-gestion-section-heading compact"><div><span>Contexto comercial</span><strong>Lo necesario antes de retomar</strong></div></div><dl>' +
      '<div><dt>Modelo / versión</dt><dd>' + escapeHtml(state.lead.model_interest || "A definir") + '</dd></div>' +
      '<div><dt>Origen</dt><dd>' + escapeHtml(originLabel(state.lead)) + '</dd></div>' +
      '<div><dt>Último contacto</dt><dd>' + escapeHtml(crm.last_contact_at ? formatDate(crm.last_contact_at) : "Sin registro") + '</dd></div>' +
      '<div><dt>Próximo objetivo</dt><dd>' + escapeHtml(crm.next_contact_note || "Definir objetivo del contacto") + '</dd></div>' +
    '</dl></section>';
  }

  function renderNextContact() {
    var crm = state.crm || {};
    var missing = !crm.next_contact_at;
    var overdue = crm.next_contact_at && new Date(crm.next_contact_at).getTime() < Date.now();
    if (missing) {
      return '<section class="en-gestion-next en-gestion-integrity"><div><span>Próximo contacto</span><strong>Falta programar fecha y hora</strong><p>Esta gestión proviene de datos anteriores a la nueva regla. No se oculta ni se inventa un horario: corregilo explícitamente antes de continuar.</p></div><button type="button" data-en-next>Definir ahora</button></section>';
    }
    return '<section class="en-gestion-next' + (overdue ? ' is-overdue' : '') + '"><div class="en-gestion-next-main"><span>' + (overdue ? "Contacto vencido" : "Próximo contacto") + '</span><strong>' + escapeHtml(formatNextContact(crm.next_contact_at)) + '</strong><p>' + escapeHtml(crm.next_contact_note || "Sin objetivo detallado") + '</p></div><div class="en-gestion-next-actions"><button class="primary" type="button" data-en-result>Registrar resultado</button><button type="button" data-en-next>Reprogramar</button></div></section>';
  }

  function renderExperience() {
    var container = ensureExperienceRoot();
    if (!container || !state.lead || !state.crm) return;
    var count = completedCount();
    var total = playbookModel.allItemKeys().length;
    container.innerHTML =
      '<div class="en-gestion-head"><div><span class="en-gestion-kicker">EN GESTIÓN</span><h3>' + escapeHtml(state.lead.customer_name || "Cliente sin nombre") + ' · ' + escapeHtml(state.lead.model_interest || "Modelo a definir") + '</h3><p>' + escapeHtml(state.lead.intent_summary || "Conversación comercial activa") + '</p></div><div class="en-gestion-progress"><strong>' + count + '/' + total + '</strong><span>hechos registrados</span></div></div>' +
      renderNextContact() +
      (!state.persistenceAvailable ? '<div class="en-gestion-persistence-note"><strong>Vista de rama</strong><span>La UI está activa, pero la persistencia del playbook requiere la migración preparada en esta rama. El CRM principal sigue funcionando.</span></div>' : '') +
      renderPlaybook() +
      '<div class="en-gestion-tools">' + renderMessages() + renderMaterials() + '</div>' +
      renderContext() +
      '<p class="en-gestion-status" id="enGestionStatus" role="status" aria-live="polite"></p>';
    relabelLegacyStageNames();
  }

  function renderFatalError(error) {
    var container = ensureExperienceRoot();
    if (!container) return;
    container.hidden = false;
    container.innerHTML = '<div class="en-gestion-integrity"><strong>No se pudo cargar la experiencia de En Gestión</strong><p>' + escapeHtml(error && error.message || "Error desconocido") + '</p><small>La ficha CRM original continúa disponible debajo.</small></div>';
  }

  function setStatus(message, isError) {
    var node = document.getElementById("enGestionStatus");
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("error", Boolean(isError));
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        area.remove();
      }
    });
  }

  function templateBody(key) {
    var template = playbookModel.findTemplate(key);
    return template ? playbookModel.interpolate(template.body, contextForTemplate()) : "";
  }

  function openWhatsApp(body) {
    var phone = String(state.lead && state.lead.customer_phone || "").replace(/\D/g, "");
    if (!phone) {
      setStatus("El Lead no tiene un teléfono válido para abrir WhatsApp.", true);
      return;
    }
    root.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(body), "_blank", "noopener");
  }

  function focusNextContact() {
    var dialog = document.getElementById("crmLeadDialog");
    if (dialog) dialog.classList.add("is-editing-outcome");
    var statusInput = document.getElementById("crmStatusInput");
    if (statusInput) statusInput.value = "en_proceso";
    var dateInput = document.getElementById("crmNextContactDateInput");
    var managementHeading = document.querySelector(".crm-management-heading");
    if (managementHeading) managementHeading.scrollIntoView({ behavior: "smooth", block: "start" });
    if (dateInput) {
      dateInput.classList.add("en-gestion-attention");
      dateInput.focus({ preventScroll: true });
      root.setTimeout(function () { dateInput.classList.remove("en-gestion-attention"); }, 1800);
    }
  }

  function focusResult() {
    var statusInput = document.getElementById("crmStatusInput");
    var dialog = document.getElementById("crmLeadDialog");
    if (dialog) dialog.classList.add("is-editing-outcome");
    var managementHeading = document.querySelector(".crm-management-heading");
    if (managementHeading) managementHeading.scrollIntoView({ behavior: "smooth", block: "start" });
    if (statusInput) {
      statusInput.classList.add("en-gestion-attention");
      statusInput.focus({ preventScroll: true });
      root.setTimeout(function () { statusInput.classList.remove("en-gestion-attention"); }, 1800);
    }
  }

  async function togglePlaybookItem(key, button) {
    if (!state.leadId) return;
    if (!state.persistenceAvailable) {
      setStatus("La persistencia del playbook todavía no está disponible en esta base. No se modificó el Lead.", true);
      return;
    }
    var current = state.items[key];
    var completed = !(current && current.completed);
    if (button) button.disabled = true;
    setStatus("Guardando…", false);
    var result = await supabaseClient.from("lead_management_playbook_items").upsert({
      lead_id: state.leadId,
      item_key: key,
      completed: completed
    }, { onConflict: "lead_id,item_key" }).select("item_key, completed, completed_at, completed_by, updated_at").single();
    if (result.error) {
      setStatus(result.error.message || "No se pudo registrar el elemento del playbook.", true);
      if (button) button.disabled = false;
      return;
    }
    state.items[key] = result.data;
    renderExperience();
    setStatus(completed ? "Hecho registrado en el historial del playbook." : "Elemento reabierto y registrado en el historial.", false);
  }

  document.addEventListener("click", function (event) {
    var leadCard = event.target.closest("[data-crm-lead-id]");
    if (leadCard) {
      state.leadId = leadCard.dataset.crmLeadId;
      root.setTimeout(function () { syncLead(state.leadId); }, 0);
    }
  }, true);

  document.addEventListener("click", function (event) {
    var toggle = event.target.closest("[data-playbook-toggle]");
    if (toggle) {
      togglePlaybookItem(toggle.dataset.playbookToggle, toggle);
      return;
    }

    var templateButton = event.target.closest("[data-en-template]");
    if (templateButton) {
      var body = templateBody(templateButton.dataset.enTemplate);
      if (body) openWhatsApp(body);
      return;
    }

    var copyTemplate = event.target.closest("[data-copy-template]");
    if (copyTemplate) {
      var copyBody = templateBody(copyTemplate.dataset.copyTemplate);
      copyText(copyBody).then(function () { setStatus("Mensaje copiado.", false); }).catch(function () { setStatus("No se pudo copiar el mensaje.", true); });
      return;
    }

    var shareMaterial = event.target.closest("[data-share-material]");
    if (shareMaterial) {
      var shareText = "Te comparto " + (shareMaterial.dataset.materialLabel || "el material") + " de " + (state.lead && state.lead.model_interest || "la unidad") + ": " + shareMaterial.dataset.shareMaterial;
      openWhatsApp(shareText);
      return;
    }

    if (event.target.closest("[data-en-budget]")) {
      var budget = document.getElementById("crmBudgetFromManagement") || document.getElementById("crmBudgetButton");
      if (budget) budget.click();
      return;
    }

    if (event.target.closest("[data-en-materials]")) {
      var materials = document.getElementById("enGestionMaterials");
      if (materials) materials.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (event.target.closest("[data-en-next]")) {
      focusNextContact();
      return;
    }

    if (event.target.closest("[data-en-result]")) {
      focusResult();
    }
  });

  var dialog = document.getElementById("crmLeadDialog");
  if (dialog && root.MutationObserver) {
    new MutationObserver(function () {
      relabelLegacyStageNames();
      if (!dialog.open) {
        setExperienceActive(false);
        return;
      }
      if (state.leadId) root.setTimeout(function () { syncLead(state.leadId); }, 0);
    }).observe(dialog, { attributes: true, attributeFilter: ["open"] });
  }

  [document.getElementById("crmAgenda"), document.getElementById("crmPipeline")].forEach(function (container) {
    if (!container || !root.MutationObserver) return;
    new MutationObserver(relabelLegacyStageNames).observe(container, { childList: true, subtree: true });
  });

  relabelLegacyStageNames();
  root.grupoSurEnGestionExperience = {
    openLead: openLead,
    syncLead: syncLead,
    relabelLegacyStageNames: relabelLegacyStageNames
  };
}(typeof window === "undefined" ? globalThis : window));
