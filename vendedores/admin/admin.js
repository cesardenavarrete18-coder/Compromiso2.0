(function () {
  "use strict";

  var supabaseClient = window.grupoSurSupabaseClient;
  var state = {
    brand: "Todas",
    selectedId: "",
    campaigns: [],
    profile: null,
    sellers: [],
    prequalifications: []
  };

  var adminLogin = document.getElementById("adminLogin");
  var adminApp = document.getElementById("adminApp");
  var loginForm = document.getElementById("adminLoginForm");
  var loginError = document.getElementById("loginError");
  var campaignForm = document.getElementById("campaignForm");
  var formMessage = document.getElementById("formMessage");
  var sellerForm = document.getElementById("sellerForm");
  var sellerFormMessage = document.getElementById("sellerFormMessage");
  var exportMessage = document.getElementById("exportMessage");
  var exportExcelButton = document.getElementById("exportExcelButton");
  var topbarTitle = document.querySelector(".topbar h1");

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
      campaign: model.campaign_name,
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
      .select("id, active, bonus, benefits, slots, valid_from, valid_to, timer_hours, model:models!inner(id, name, image_path, campaign_name, sort_order, brand:brands!inner(name, sort_order))");
    if (result.error) {
      throw result.error;
    }
    state.campaigns = (result.data || []).map(normalizeCampaign).sort(function (a, b) {
      return a.brandOrder - b.brandOrder || a.modelOrder - b.modelOrder;
    });
    if (!state.selectedId && state.campaigns[0]) {
      state.selectedId = state.campaigns[0].id;
    }
  }

  async function enterAdmin() {
    var profile = await getAdminProfile();
    if (!profile) {
      await supabaseClient.auth.signOut();
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
          '<span class="campaign-item-copy"><span>' + escapeHtml(item.brand) + '</span><strong>' + escapeHtml(item.name) + '</strong><small>' + escapeHtml(availability + " · " + item.validityHours + " h") + '</small></span>' +
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
    document.getElementById("editorCampaign").textContent = item.campaign;
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
    document.getElementById("previewTitle").textContent = item.brand + " " + item.name;
    document.getElementById("previewBonus").textContent = config.bonus || "Sin bonificación destacada";
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
    state.sellers = (data.users || []).filter(function (user) { return user.role === "seller"; });
    renderSellers();
  }

  function renderSellers() {
    document.getElementById("sellerCount").textContent = state.sellers.length === 1 ? "1 vendedor" : state.sellers.length + " vendedores";
    var list = document.getElementById("sellerList");
    if (!state.sellers.length) {
      list.innerHTML = '<div class="seller-empty"><strong>Todavía no hay vendedores</strong>Creá el primer acceso desde el formulario.</div>';
      return;
    }
    list.innerHTML = state.sellers.map(function (seller) {
      return "" +
        '<div class="seller-row">' +
          '<div class="seller-identity"><span>' + escapeHtml((seller.full_name || "V").charAt(0)) + '</span><div><strong>' + escapeHtml(seller.full_name) + '</strong><small>' + escapeHtml(seller.seller_code) + (seller.phone ? " · " + escapeHtml(seller.phone) : "") + '</small></div></div>' +
          '<span class="seller-status ' + (seller.active ? "is-active" : "is-paused") + '">' + (seller.active ? "Activo" : "Pausado") + '</span>' +
          '<div class="seller-actions"><button type="button" data-user-action="password" data-user-id="' + seller.user_id + '" data-user-name="' + escapeHtml(seller.full_name) + '">Contraseña</button><button type="button" data-user-action="toggle" data-user-id="' + seller.user_id + '" data-active="' + seller.active + '">' + (seller.active ? "Pausar" : "Activar") + '</button></div>' +
        "</div>";
    }).join("");
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
    document.getElementById("campaignAdminView").hidden = !campaigns;
    document.getElementById("sellerAdminView").hidden = !sellers;
    document.getElementById("prequalificationAdminView").hidden = !prequalifications;
    topbarTitle.textContent = campaigns ? "Gestión de campañas y equipo" : sellers ? "Equipo comercial y accesos" : "Clientes precalificados";
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
  }

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
        options: { emailRedirectTo: window.location.origin + "/vendedores/admin/" }
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
    await supabaseClient.auth.signOut();
    showLogin();
  });

  document.querySelector(".sidebar nav").addEventListener("click", function (event) {
    var button = event.target.closest("[data-admin-view]");
    if (button) {
      showAdminView(button.dataset.adminView);
    }
  });

  exportExcelButton.addEventListener("click", downloadPrequalifications);

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
    var button = campaignForm.querySelector('button[type="submit"]');
    formMessage.classList.remove("is-error");
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
      var result = await supabaseClient.from("campaigns").update({
        active: config.active,
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
      formMessage.textContent = "No se pudieron guardar los cambios. Intentá nuevamente.";
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

  sellerForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    sellerFormMessage.textContent = "";
    sellerFormMessage.classList.remove("is-error");
    var button = sellerForm.querySelector('button[type="submit"]');
    setBusy(button, true, "Creando…");
    try {
      await invokeUsers({
        action: "create_seller",
        fullName: sellerForm.elements.fullName.value,
        sellerCode: sellerForm.elements.sellerCode.value,
        phone: sellerForm.elements.phone.value,
        password: sellerForm.elements.password.value
      });
      sellerForm.reset();
      sellerFormMessage.textContent = "Vendedor creado correctamente.";
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
