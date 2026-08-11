(function () {
  "use strict";

  var supabaseClient = window.grupoSurSupabaseClient;

  var BRANDS = {
    Volkswagen: {
      image: "../assets/brand-selector-vw-v2.webp",
      description: "SUV, SUVW y pick-up",
      models: [
        {
          name: "Amarok",
          image: "../assets/vw-amarok.webp",
          campaign: "Plan 70/30",
          short: "Bonificación y entrega pactada según campaña.",
          advance: "$10.400.000",
          installment: "Desde $600.000",
          availability: "2 cupos (demo)",
          validityHours: 24
        },
        {
          name: "Tera",
          image: "../assets/vw-tera.webp",
          campaign: "Plan 70/30",
          short: "Alternativas de retiro en cuotas pactadas.",
          advance: "$11.000.000",
          installment: "Desde $500.000",
          availability: "3 cupos (demo)",
          validityHours: 24
        },
        {
          name: "Taos",
          image: "../assets/vw-taos.webp",
          campaign: "Plan 60/40",
          short: "Propuesta con anticipo y financiación vigente.",
          advance: "$15.000.000",
          installment: "A confirmar",
          availability: "Disponible (demo)",
          validityHours: 24
        },
        {
          name: "Nivus",
          image: "../assets/vw-nivus.webp",
          campaign: "Plan 80/20",
          short: "Financiación según versión seleccionada.",
          advance: "$6.656.310",
          installment: "Desde $423.000",
          availability: "4 cupos (demo)",
          validityHours: 24
        },
        {
          name: "T-Cross",
          image: "../assets/vw-tcross.webp",
          campaign: "Plan 80/20",
          short: "Condición preliminar con entrega pactada.",
          advance: "$7.583.060",
          installment: "Desde $482.000",
          availability: "Disponible (demo)",
          validityHours: 24
        },
        {
          name: "Virtus",
          image: "../assets/vw-virtus.webp",
          campaign: "Plan 90/10",
          short: "Ingreso inicial reducido sujeto a campaña.",
          advance: "$3.365.910",
          installment: "A confirmar",
          availability: "2 cupos (demo)",
          validityHours: 24
        }
      ]
    },
    Peugeot: {
      image: "../assets/brand-selector-peugeot-v2.webp",
      description: "Hatchback, SUV y utilitario",
      models: [
        {
          name: "208",
          image: "../assets/peugeot-208.webp",
          campaign: "Plan 80/20",
          short: "Propuesta urbana con retiro pactado.",
          advance: "$4.000.000",
          installment: "Desde $400.000",
          availability: "3 cupos (demo)",
          validityHours: 24
        },
        {
          name: "2008",
          image: "../assets/peugeot-2008.webp",
          campaign: "Plan 70/30",
          short: "SUV con alternativas de financiación vigente.",
          advance: "$4.900.000",
          installment: "Desde $550.000",
          availability: "2 cupos (demo)",
          validityHours: 24
        },
        {
          name: "Partner",
          image: "../assets/peugeot-partner.webp",
          campaign: "Plan utilitario",
          short: "Condición comercial para uso laboral.",
          advance: "$10.000.000",
          installment: "Desde $500.000",
          availability: "Disponible (demo)",
          validityHours: 24
        },
        {
          name: "Expert",
          image: "../assets/peugeot-expert.webp",
          campaign: "Plan utilitario",
          short: "Alternativa de financiación para trabajo.",
          advance: "$10.000.000",
          installment: "Desde $500.000",
          availability: "A confirmar (demo)",
          validityHours: 24
        }
      ]
    },
    Fiat: {
      image: "../assets/brand-selector-fiat-v2.webp",
      description: "Urbano, sedán, SUV y pick-up",
      models: [
        {
          name: "Cronos",
          image: "../assets/fiat-cronos.webp",
          campaign: "Plan 80/20",
          short: "Retiro pactado según condición vigente.",
          advance: "$5.000.000",
          installment: "Desde $500.000",
          availability: "4 cupos (demo)",
          validityHours: 24
        },
        {
          name: "Mobi",
          image: "../assets/fiat-mobi.webp",
          campaign: "Plan 80/20",
          short: "Ingreso inicial y cuota accesible.",
          advance: "$5.000.000",
          installment: "Desde $500.000",
          availability: "3 cupos (demo)",
          validityHours: 24
        },
        {
          name: "Argo",
          image: "../assets/fiat-argo.webp",
          campaign: "Campaña lanzamiento",
          short: "Condición preliminar de lanzamiento.",
          advance: "A confirmar",
          installment: "A confirmar",
          availability: "Disponible (demo)",
          validityHours: 24
        },
        {
          name: "Titano",
          image: "../assets/fiat-titano.webp",
          campaign: "Plan pick-up",
          short: "Propuesta para uso laboral y personal.",
          advance: "A confirmar",
          installment: "A confirmar",
          availability: "2 cupos (demo)",
          validityHours: 24
        },
        {
          name: "Fastback",
          image: "../assets/fiat-fastback.webp",
          campaign: "Plan 70/30",
          short: "Financiación sujeta a versión y campaña.",
          advance: "A confirmar",
          installment: "A confirmar",
          availability: "Disponible (demo)",
          validityHours: 24
        },
        {
          name: "Strada",
          image: "../assets/fiat-strada.webp",
          campaign: "Plan utilitario",
          short: "Alternativas para trabajo y uso diario.",
          advance: "A confirmar",
          installment: "A confirmar",
          availability: "Disponible (demo)",
          validityHours: 24
        }
      ]
    }
  };

  var state = {
    seller: null,
    brand: "",
    model: null,
    client: null,
    validUntil: null,
    history: [],
    countdownTimer: null,
    visibleModels: [],
    userId: "",
    requestId: "",
    prequalificationId: "",
    applicationId: "",
    application: null
  };

  var loginPage = document.getElementById("loginPage");
  var portal = document.getElementById("portal");
  var loginForm = document.getElementById("loginForm");
  var loginError = document.getElementById("loginError");
  var passwordToggle = document.getElementById("passwordToggle");
  var logoutButton = document.getElementById("logoutButton");
  var clientForm = document.getElementById("clientForm");
  var clientError = document.getElementById("clientError");
  var processingOverlay = document.getElementById("processingOverlay");
  var processingTitle = document.getElementById("processingTitle");
  var processingCopy = document.getElementById("processingCopy");
  var processingBar = document.getElementById("processingBar");
  var applicationButton = document.getElementById("applicationButton");
  var applicationForm = document.getElementById("applicationForm");
  var applicationError = document.getElementById("applicationError");
  var applicationSubmitButton = document.getElementById("applicationSubmitButton");
  var minutePrint = document.getElementById("minutePrint");

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function resolveModelConfig(brandName, model) {
    var result = Object.assign({
      active: true,
      benefits: ["Asesoramiento personalizado", "Condiciones sujetas a disponibilidad"],
      bonus: "Consultar bonificación vigente",
      slots: null,
      validFrom: "",
      validTo: ""
    }, model);

    if (result.slots !== null && result.slots !== "" && Number.isFinite(Number(result.slots))) {
      result.availability = Number(result.slots) === 1
        ? "1 cupo disponible"
        : Number(result.slots) + " cupos disponibles";
    } else {
      result.availability = "Disponibilidad a confirmar";
    }
    result.validityHours = Math.max(1, Number(result.validityHours) || 24);
    return result;
  }

  async function loadCentralCampaigns() {
    var response = await supabaseClient
      .from("campaigns")
      .select("id, active, bonus, benefits, slots, valid_from, valid_to, timer_hours, model:models!inner(id, name, image_path, campaign_name, short_description, advance_text, installment_text, sort_order, active, brand:brands!inner(name, description, image_path, sort_order, active))");
    var grouped = {};
    if (response.error) {
      throw response.error;
    }
    (response.data || []).forEach(function (row) {
      var model = Array.isArray(row.model) ? row.model[0] : row.model;
      var brand = model && (Array.isArray(model.brand) ? model.brand[0] : model.brand);
      if (!model || !brand) {
        return;
      }
      if (!grouped[brand.name]) {
        grouped[brand.name] = {
          image: brand.image_path,
          description: brand.description,
          sortOrder: brand.sort_order || 0,
          models: []
        };
      }
      grouped[brand.name].models.push({
        id: model.id,
        campaignId: row.id,
        name: model.name,
        image: model.image_path,
        campaign: model.campaign_name,
        short: model.short_description,
        advance: model.advance_text,
        installment: model.installment_text,
        active: row.active && model.active && brand.active,
        bonus: row.bonus,
        benefits: row.benefits || [],
        slots: row.slots,
        validFrom: row.valid_from || "",
        validTo: row.valid_to || "",
        validityHours: row.timer_hours || 24,
        sortOrder: model.sort_order || 0
      });
    });
    Object.keys(grouped).forEach(function (brandName) {
      grouped[brandName].models.sort(function (a, b) { return a.sortOrder - b.sortOrder; });
    });
    BRANDS = Object.keys(grouped).sort(function (a, b) {
      return grouped[a].sortOrder - grouped[b].sortOrder;
    }).reduce(function (result, brandName) {
      result[brandName] = grouped[brandName];
      return result;
    }, {});
  }

  function isCampaignActive(model) {
    var now = Date.now();
    var startsAt = model.validFrom ? new Date(model.validFrom + "T00:00:00").getTime() : null;
    var endsAt = model.validTo ? new Date(model.validTo + "T23:59:59").getTime() : null;
    return model.active !== false &&
      (!startsAt || now >= startsAt) &&
      (!endsAt || now <= endsAt);
  }

  function initials(name) {
    return String(name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) { return part.charAt(0).toUpperCase(); })
      .join("");
  }

  function brandTheme(brandName) {
    return String(brandName || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  function formatCurrentDate() {
    document.getElementById("currentDate").textContent = new Intl.DateTimeFormat("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(new Date());
  }

  function showPortal(seller) {
    state.seller = seller;
    loginPage.hidden = true;
    portal.hidden = false;
    document.getElementById("sellerAvatar").textContent = initials(seller.name);
    document.getElementById("sidebarSellerName").textContent = seller.name;
    document.getElementById("sidebarSellerCode").textContent = "Código " + seller.code;
    resetFlow();
  }

  function showLogin() {
    state.seller = null;
    state.brand = "";
    state.model = null;
    state.client = null;
    portal.hidden = true;
    loginPage.hidden = false;
    loginForm.reset();
    loginError.textContent = "";
    document.getElementById("sellerCode").focus();
  }

  async function getSellerProfile() {
    var userResponse = await supabaseClient.auth.getUser();
    var user = userResponse.data && userResponse.data.user;
    if (!user || userResponse.error) {
      return null;
    }
    var profileResponse = await supabaseClient
      .from("profiles")
      .select("user_id, full_name, seller_code, phone, role, active")
      .eq("user_id", user.id)
      .single();
    if (profileResponse.error || !profileResponse.data || profileResponse.data.role !== "seller" || !profileResponse.data.active) {
      return null;
    }
    state.userId = user.id;
    return {
      name: profileResponse.data.full_name,
      code: profileResponse.data.seller_code,
      phone: profileResponse.data.phone || "Sin teléfono informado"
    };
  }

  function renderBrands() {
    var container = document.getElementById("brandOptions");
    container.innerHTML = Object.keys(BRANDS).map(function (brandName) {
      var brand = BRANDS[brandName];
      var available = brand.models.map(function (model) { return resolveModelConfig(brandName, model); }).filter(isCampaignActive).length;
      return "" +
        '<button class="brand-option brand-' + brandTheme(brandName) + '" type="button" data-brand="' + escapeHtml(brandName) + '">' +
          '<span class="brand-option-image"><img src="' + brand.image + '" alt="' + escapeHtml(brandName) + '"></span>' +
          '<span class="brand-option-content">' +
            '<span><span class="brand-card-kicker">Propuestas disponibles</span><h3>' + escapeHtml(brandName) + '</h3><p>' + escapeHtml(available) + ' modelos activos · ' + escapeHtml(brand.description) + '</p></span>' +
            '<span class="option-arrow" aria-hidden="true">→</span>' +
          '</span>' +
        '</button>';
    }).join("");
  }

  function renderModels() {
    var brand = BRANDS[state.brand];
    var container = document.getElementById("modelOptions");
    state.visibleModels = brand.models
      .map(function (model) { return resolveModelConfig(state.brand, model); })
      .filter(isCampaignActive);
    document.getElementById("selectedBrandBadge").textContent = state.brand;
    document.getElementById("modelViewCopy").textContent = state.visibleModels.length + " propuestas comerciales activas para acompañar la consulta del cliente.";
    if (!state.visibleModels.length) {
      container.innerHTML = '<div class="history-empty"><strong>No hay campañas activas</strong>El administrador debe activar al menos un modelo para esta marca.</div>';
      return;
    }
    container.innerHTML = state.visibleModels.map(function (model, index) {
      return "" +
        '<button class="model-option" type="button" data-model-index="' + index + '">' +
          '<span class="model-option-image"><img src="' + model.image + '" alt="' + escapeHtml(state.brand + " " + model.name) + '"></span>' +
          '<span class="model-option-content">' +
            '<span class="model-option-topline"><span>' + escapeHtml(state.brand) + '</span><span class="stock-badge">Condición disponible</span></span>' +
            '<h3>' + escapeHtml(model.name) + '</h3>' +
            '<p>' + escapeHtml(model.short) + '</p>' +
            '<span class="model-condition"><span>' + escapeHtml(model.campaign) + '</span><strong>' + escapeHtml(model.installment) + '</strong></span>' +
          '</span>' +
        '</button>';
    }).join("");
  }

  function renderSelectionSummary() {
    var model = state.model;
    document.getElementById("selectionSummary").innerHTML = "" +
      '<div class="summary-image"><img src="' + model.image + '" alt="' + escapeHtml(state.brand + " " + model.name) + '"></div>' +
      '<div class="summary-content">' +
        '<span>Propuesta seleccionada</span>' +
        '<h3>' + escapeHtml(state.brand + " " + model.name) + '</h3>' +
        '<p>' + escapeHtml(model.short) + '</p>' +
        '<ul class="summary-list">' +
          '<li><span>Campaña</span><strong>' + escapeHtml(model.campaign) + '</strong></li>' +
          '<li><span>Anticipo estimado</span><strong>' + escapeHtml(model.advance) + '</strong></li>' +
          '<li><span>Cuota estimada</span><strong>' + escapeHtml(model.installment) + '</strong></li>' +
          '<li><span>Disponibilidad</span><strong>' + escapeHtml(model.availability) + '</strong></li>' +
          '<li><span>Bonificación</span><strong>' + escapeHtml(model.bonus) + '</strong></li>' +
          '<li><span>Beneficios</span><strong>' + escapeHtml((model.benefits || []).join(" · ")) + '</strong></li>' +
          '<li><span>Temporizador</span><strong>' + escapeHtml(model.validityHours) + ' horas</strong></li>' +
        '</ul>' +
      '</div>';
  }

  function setView(viewName) {
    document.querySelectorAll(".view").forEach(function (view) {
      view.classList.toggle("is-active", view.id === viewName + "View");
    });

    var stepOrder = ["brand", "model", "client", "result"];
    var activeIndex = stepOrder.indexOf(viewName);
    var isHistory = viewName === "history";
    var isApplication = viewName === "application";
    document.getElementById("stepper").hidden = isHistory || isApplication;

    document.querySelectorAll("#stepper li").forEach(function (item, index) {
      item.classList.toggle("is-current", index === activeIndex);
      item.classList.toggle("is-complete", activeIndex > index);
    });

    var titles = {
      brand: "Iniciar nueva gestión",
      model: "Selección de propuesta",
      client: "Validación del cliente",
      result: "Constancia comercial",
      application: "Solicitud comercial",
      history: "Gestiones recientes"
    };
    document.getElementById("pageTitle").textContent = titles[viewName] || "Portal comercial";
    document.querySelectorAll(".nav-item").forEach(function (item) {
      item.classList.toggle("is-active", isHistory ? item.dataset.action === "history" : item.dataset.action === "home");
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetFlow() {
    state.brand = "";
    state.model = null;
    state.client = null;
    state.validUntil = null;
    state.requestId = "";
    state.prequalificationId = "";
    state.applicationId = "";
    state.application = null;
    portal.removeAttribute("data-brand-theme");
    if (state.countdownTimer) {
      window.clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }
    clientForm.reset();
    clientError.textContent = "";
    applicationForm.reset();
    applicationError.textContent = "";
    applicationButton.disabled = true;
    applicationButton.textContent = "Preparando solicitud…";
    renderBrands();
    setView("brand");
  }

  function selectBrand(brandName) {
    if (!BRANDS[brandName]) {
      return;
    }
    state.brand = brandName;
    state.model = null;
    portal.setAttribute("data-brand-theme", brandTheme(brandName));
    renderModels();
    setView("model");
  }

  function selectModel(index) {
    var model = state.visibleModels[index];
    if (!model) {
      return;
    }
    state.model = model;
    renderSelectionSummary();
    clientForm.reset();
    clientError.textContent = "";
    setView("client");
    clientForm.elements.fullName.focus();
  }

  function digits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatCuilInput(value) {
    var clean = digits(value).slice(0, 11);
    if (clean.length <= 2) {
      return clean;
    }
    if (clean.length <= 10) {
      return clean.slice(0, 2) + "-" + clean.slice(2);
    }
    return clean.slice(0, 2) + "-" + clean.slice(2, 10) + "-" + clean.slice(10);
  }

  function isValidCuil(value) {
    var clean = digits(value);
    var personalPrefix = /^(20|23|24|25|26|27)/;

    return clean.length === 11 &&
      !/^(\d)\1+$/.test(clean) &&
      personalPrefix.test(clean);
  }

  function validateClient(data) {
    var phone = digits(data.phone);
    var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (data.fullName.length < 5 || data.fullName.indexOf(" ") === -1) {
      return "Ingresá el nombre y apellido completos del cliente.";
    }
    if (phone.length < 8 || phone.length > 15 || /^(\d)\1+$/.test(phone)) {
      return "Ingresá un teléfono válido.";
    }
    if (!emailPattern.test(data.email)) {
      return "Ingresá un correo electrónico válido.";
    }
    if (!isValidCuil(data.cuil)) {
      return "Ingresá un CUIL de 11 dígitos con un prefijo personal válido.";
    }
    if (!data.consent) {
      return "El cliente debe leer y aceptar el consentimiento para continuar.";
    }
    return "";
  }

  function maskCuil(value) {
    var clean = digits(value);
    return clean.slice(0, 2) + "-******" + clean.slice(8, 10) + "-" + clean.slice(10);
  }

  function makeRequestId() {
    var date = new Date();
    var datePart = date.getFullYear() + String(date.getMonth() + 1).padStart(2, "0") + String(date.getDate()).padStart(2, "0");
    var randomPart = Math.random().toString(36).slice(2, 7).toUpperCase();
    return "GS-" + datePart + "-" + randomPart;
  }

  function runProcessing() {
    var stages = [
      { title: "Validando los datos de la gestión…", copy: "Comprobando que la información esté completa para continuar.", progress: "34%", delay: 1100 },
      { title: "Confirmando la condición comercial…", copy: "Revisando vigencia, beneficios y disponibilidad informada.", progress: "68%", delay: 1250 },
      { title: "Preparando la propuesta para el cliente…", copy: "Organizando la constancia y los próximos pasos de la gestión.", progress: "100%", delay: 1100 }
    ];
    var index = 0;

    processingOverlay.hidden = false;
    processingBar.style.width = "12%";

    function nextStage() {
      var stage = stages[index];
      processingTitle.textContent = stage.title;
      processingCopy.textContent = stage.copy;
      processingBar.style.width = stage.progress;
      index += 1;
      if (index < stages.length) {
        window.setTimeout(nextStage, stage.delay);
      } else {
        window.setTimeout(function () {
          processingOverlay.hidden = true;
          buildResult();
        }, stage.delay);
      }
    }

    nextStage();
  }

  function savePrequalificationEvent(requestId) {
    var cleanCuil = digits(state.client.cuil);
    return supabaseClient.from("prequalification_events").insert({
      seller_user_id: state.userId,
      model_id: state.model.id,
      campaign_id: state.model.campaignId,
      request_code: requestId,
      customer_initials: initials(state.client.fullName),
      cuil_last4: cleanCuil.slice(-4),
      timer_hours: state.model.validityHours,
      valid_until: state.validUntil.toISOString(),
      campaign_snapshot: {
        brand: state.brand,
        model: state.model.name,
        campaign: state.model.campaign,
        bonus: state.model.bonus,
        benefits: state.model.benefits,
        slots: state.model.slots
      }
    }).select("id").single();
  }

  function buildResult() {
    var model = state.model;
    var client = state.client;
    var seller = state.seller;
    var requestId = makeRequestId();
    state.requestId = requestId;
    state.prequalificationId = "";
    state.applicationId = "";
    state.application = null;
    state.validUntil = new Date(Date.now() + model.validityHours * 60 * 60 * 1000);
    applicationButton.disabled = true;
    applicationButton.textContent = "Preparando solicitud…";

    document.getElementById("resultVehicleImage").src = model.image;
    document.getElementById("resultVehicleImage").alt = state.brand + " " + model.name;
    document.getElementById("resultBrand").textContent = state.brand + " · " + model.campaign;
    document.getElementById("resultTitle").textContent = model.name;
    document.getElementById("resultIntro").textContent = client.fullName + ", la gestión reúne las condiciones comerciales preliminares de esta propuesta. El asesor te explicará los próximos pasos para avanzar.";
    document.getElementById("resultClientName").textContent = client.fullName;
    document.getElementById("resultCuil").textContent = maskCuil(client.cuil);
    document.getElementById("resultPhone").textContent = client.phone;
    document.getElementById("resultEmail").textContent = client.email;
    document.getElementById("resultCampaign").textContent = model.campaign;
    document.getElementById("resultAdvance").textContent = model.advance;
    document.getElementById("resultInstallment").textContent = model.installment;
    document.getElementById("resultAvailability").textContent = model.availability;
    document.getElementById("resultBonus").textContent = model.bonus;
    document.getElementById("resultBenefits").textContent = (model.benefits || []).join(" · ");
    document.getElementById("resultSellerName").textContent = seller.name;
    document.getElementById("resultSellerCode").textContent = seller.code;
    document.getElementById("resultSellerPhone").textContent = seller.phone;
    document.getElementById("resultRequestId").textContent = requestId;
    document.getElementById("validUntil").textContent = "Hasta " + new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(state.validUntil);

    state.history.unshift({
      name: client.fullName,
      cuil: maskCuil(client.cuil),
      vehicle: state.brand + " " + model.name,
      campaign: model.campaign,
      requestId: requestId,
      date: new Date(),
      application: false
    });
    savePrequalificationEvent(requestId).then(function (response) {
      if (response.error) {
        document.getElementById("resultRequestId").title = "La constancia se generó, pero no pudo registrarse en el historial central.";
        applicationButton.textContent = "No se pudo habilitar la solicitud";
        return;
      }
      state.prequalificationId = response.data.id;
      applicationButton.disabled = false;
      applicationButton.textContent = "Completar solicitud comercial";
    });
    renderHistory();
    startCountdown();
    setView("result");
  }

  function startCountdown() {
    var target = state.validUntil.getTime();
    var countdown = document.getElementById("countdown");

    if (state.countdownTimer) {
      window.clearInterval(state.countdownTimer);
    }

    function update() {
      var remaining = Math.max(0, target - Date.now());
      var hours = Math.floor(remaining / 3600000);
      var minutes = Math.floor((remaining % 3600000) / 60000);
      var seconds = Math.floor((remaining % 60000) / 1000);
      countdown.textContent = String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
      if (remaining === 0 && state.countdownTimer) {
        window.clearInterval(state.countdownTimer);
      }
    }

    update();
    state.countdownTimer = window.setInterval(update, 1000);
  }

  function splitClientName(fullName) {
    var parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
    return {
      firstName: parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] || ""),
      lastName: parts.length > 1 ? parts[parts.length - 1] : ""
    };
  }

  function parseMoney(value) {
    var clean = digits(value);
    return clean ? Number(clean) : null;
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === "") {
      return "A confirmar";
    }
    return "$ " + new Intl.NumberFormat("es-AR", {
      maximumFractionDigits: 0
    }).format(Number(value));
  }

  function formatYears(value) {
    var years = Number(value);
    return years === 1 ? "1 año" : years + " años";
  }

  function formatDate(value) {
    if (!value) {
      return "No informado";
    }
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date(value + "T12:00:00"));
  }

  function readApplicationData() {
    var fields = applicationForm.elements;
    return {
      firstName: String(fields.firstName.value || "").trim().replace(/\s+/g, " "),
      lastName: String(fields.lastName.value || "").trim().replace(/\s+/g, " "),
      documentType: String(fields.documentType.value || "").trim(),
      documentNumber: digits(fields.documentNumber.value),
      cuil: digits(fields.cuil.value),
      birthDate: fields.birthDate.value || "",
      address: String(fields.address.value || "").trim().replace(/\s+/g, " "),
      cityProvince: String(fields.cityProvince.value || "").trim().replace(/\s+/g, " "),
      postalCode: String(fields.postalCode.value || "").trim().toUpperCase(),
      maritalStatus: String(fields.maritalStatus.value || "").trim(),
      spouseName: String(fields.spouseName.value || "").trim().replace(/\s+/g, " "),
      spouseDocument: digits(fields.spouseDocument.value),
      primaryPhone: String(fields.primaryPhone.value || "").trim(),
      alternatePhone: String(fields.alternatePhone.value || "").trim(),
      email: String(fields.email.value || "").trim().toLowerCase(),
      contactSchedule: String(fields.contactSchedule.value || "").trim().replace(/\s+/g, " "),
      employmentStatus: String(fields.employmentStatus.value || "").trim(),
      employerName: String(fields.employerName.value || "").trim().replace(/\s+/g, " "),
      employmentSeniority: fields.employmentSeniority.value === "" ? null : Number(fields.employmentSeniority.value),
      monthlyIncome: fields.monthlyIncome.value === "" ? null : Number(fields.monthlyIncome.value),
      automaticDebit: fields.automaticDebit.value === "true",
      automaticDebitSelected: fields.automaticDebit.value !== "",
      deferredInstallment: fields.deferredInstallment.value === "true",
      deferredInstallmentSelected: fields.deferredInstallment.value !== "",
      installmentsPaid: Number(fields.installmentsPaid.value),
      installmentsToPay: Number(fields.installmentsToPay.value),
      planType: String(fields.planType.value || "").trim().replace(/\s+/g, " "),
      agreedPrice: parseMoney(fields.agreedPrice.value),
      firstPaymentDate: fields.firstPaymentDate.value || "",
      firstPaymentAmount: parseMoney(fields.firstPaymentAmount.value),
      secondPaymentDate: fields.secondPaymentDate.value || "",
      secondPaymentAmount: parseMoney(fields.secondPaymentAmount.value),
      consent: fields.applicationConsent.checked
    };
  }

  function validateApplication(data) {
    var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var adultDate = new Date();
    adultDate.setFullYear(adultDate.getFullYear() - 18);

    if (data.firstName.length < 2 || data.lastName.length < 2) {
      return "Completá el nombre y el apellido del cliente.";
    }
    if (data.documentNumber.length < 7 || data.documentNumber.length > 12) {
      return "Ingresá un número de documento válido.";
    }
    if (!isValidCuil(data.cuil)) {
      return "El CUIL asociado a la solicitud no es válido.";
    }
    if (!data.birthDate || new Date(data.birthDate + "T12:00:00") > adultDate) {
      return "La solicitud debe corresponder a una persona mayor de 18 años.";
    }
    if (data.address.length < 5 || data.cityProvince.length < 3 || data.postalCode.length < 3) {
      return "Completá el domicilio, la localidad/provincia y el código postal.";
    }
    if (!data.maritalStatus) {
      return "Seleccioná el estado civil.";
    }
    if ((data.maritalStatus === "Casado/a" || data.maritalStatus === "Conviviente") && (data.spouseName.length < 3 || data.spouseDocument.length < 7)) {
      return "Completá el nombre y DNI del cónyuge o conviviente.";
    }
    if (digits(data.primaryPhone).length < 8 || !emailPattern.test(data.email) || data.contactSchedule.length < 3) {
      return "Revisá el teléfono, el correo y el horario de contacto.";
    }
    if (!data.employmentStatus || data.employerName.length < 2) {
      return "Completá la condición laboral y la empresa o actividad.";
    }
    if (!Number.isInteger(data.employmentSeniority) || data.employmentSeniority < 0 || data.employmentSeniority > 80) {
      return "Ingresá la antigüedad laboral como una cantidad de años válida.";
    }
    if (!Number.isInteger(data.monthlyIncome) || data.monthlyIncome < 1) {
      return "Ingresá el sueldo mensual como un número entero.";
    }
    if (!data.automaticDebitSelected || !data.deferredInstallmentSelected) {
      return "Indicá si corresponde débito automático y cuota diferida.";
    }
    if (!Number.isInteger(data.installmentsPaid) || data.installmentsPaid < 0 || !Number.isInteger(data.installmentsToPay) || data.installmentsToPay < 1) {
      return "Revisá la cantidad de cuotas abonadas y cuotas a pagar.";
    }
    if (data.planType.length < 3 || !data.agreedPrice) {
      return "Completá el tipo de plan y el precio pactado.";
    }
    if (Boolean(data.firstPaymentDate) !== Boolean(data.firstPaymentAmount) || Boolean(data.secondPaymentDate) !== Boolean(data.secondPaymentAmount)) {
      return "Cada pago informado debe tener fecha e importe.";
    }
    if (!data.consent) {
      return "El vendedor y el cliente deben confirmar los datos antes de generar la minuta.";
    }
    return "";
  }

  function setApplicationField(name, value) {
    var field = applicationForm.elements[name];
    if (!field) {
      return;
    }
    if (field.type === "checkbox") {
      field.checked = Boolean(value);
    } else if (value !== null && value !== undefined) {
      field.value = String(value);
    }
  }

  function openCommercialApplication() {
    var names;
    var data;
    if (!state.prequalificationId) {
      return;
    }
    names = splitClientName(state.client.fullName);
    data = state.application || {
      firstName: names.firstName,
      lastName: names.lastName,
      documentType: "DNI",
      documentNumber: "",
      cuil: state.client.cuil,
      birthDate: "",
      address: "",
      cityProvince: "",
      postalCode: "",
      maritalStatus: "",
      spouseName: "",
      spouseDocument: "",
      primaryPhone: state.client.phone,
      alternatePhone: "",
      email: state.client.email,
      contactSchedule: "",
      employmentStatus: "",
      employerName: "",
      employmentSeniority: "",
      monthlyIncome: "",
      automaticDebit: "",
      deferredInstallment: "",
      installmentsPaid: 0,
      installmentsToPay: "",
      planType: state.model.campaign,
      agreedPrice: "",
      firstPaymentDate: "",
      firstPaymentAmount: "",
      secondPaymentDate: "",
      secondPaymentAmount: "",
      consent: false
    };

    applicationForm.reset();
    Object.keys(data).forEach(function (name) {
      var value = data[name];
      if (name === "automaticDebit" || name === "deferredInstallment") {
        value = value === "" ? "" : String(value);
      }
      setApplicationField(name === "consent" ? "applicationConsent" : name, value);
    });
    setApplicationField("cuil", formatCuilInput(data.cuil));
    document.getElementById("applicationRequestCode").textContent = state.requestId;
    document.getElementById("applicationVehicle").textContent = state.brand + " " + state.model.name;
    document.getElementById("applicationCampaign").textContent = state.model.campaign;
    applicationError.textContent = "";
    setView("application");
    applicationForm.elements.firstName.focus();
  }

  function saveCommercialApplication(data) {
    return supabaseClient.from("commercial_applications").upsert({
      prequalification_event_id: state.prequalificationId,
      seller_user_id: state.userId,
      request_code: state.requestId,
      brand_name: state.brand,
      model_name: state.model.name,
      campaign_name: state.model.campaign,
      first_name: data.firstName,
      last_name: data.lastName,
      document_type: data.documentType,
      document_number: data.documentNumber,
      cuil: data.cuil,
      birth_date: data.birthDate,
      address: data.address,
      city_province: data.cityProvince,
      postal_code: data.postalCode,
      marital_status: data.maritalStatus,
      spouse_name: data.spouseName || null,
      spouse_document: data.spouseDocument || null,
      primary_phone: data.primaryPhone,
      alternate_phone: data.alternatePhone || null,
      email: data.email,
      contact_schedule: data.contactSchedule,
      employment_status: data.employmentStatus,
      employer_name: data.employerName,
      employment_seniority: formatYears(data.employmentSeniority),
      monthly_income: data.monthlyIncome,
      automatic_debit: data.automaticDebit,
      deferred_installment: data.deferredInstallment,
      installments_paid: data.installmentsPaid,
      installments_to_pay: data.installmentsToPay,
      plan_type: data.planType,
      agreed_price: data.agreedPrice,
      first_payment_date: data.firstPaymentDate || null,
      first_payment_amount: data.firstPaymentAmount,
      second_payment_date: data.secondPaymentDate || null,
      second_payment_amount: data.secondPaymentAmount,
      status: "completed",
      terms_version: "GS-MINUTA-2026-01",
      confirmed_at: new Date().toISOString(),
      commercial_snapshot: {
        advance: state.model.advance,
        installment: state.model.installment,
        availability: state.model.availability,
        bonus: state.model.bonus,
        benefits: state.model.benefits,
        image: state.model.image,
        sellerName: state.seller.name,
        sellerCode: state.seller.code,
        sellerPhone: state.seller.phone
      }
    }, { onConflict: "prequalification_event_id" }).select("id").single();
  }

  function minuteValue(value) {
    return escapeHtml(value || "No informado");
  }

  function minuteRow(label, value) {
    return '<div><span>' + escapeHtml(label) + '</span><strong>' + minuteValue(value) + '</strong></div>';
  }

  function buildMinute(data) {
    var issueDate = new Date();
    var minuteCode = "MIN-" + state.requestId.replace(/^GS-/, "");
    var spouse = data.spouseName ? data.spouseName + (data.spouseDocument ? " · DNI " + data.spouseDocument : "") : "No corresponde";
    minutePrint.innerHTML = '' +
      '<article class="minute-sheet" data-brand-theme="' + escapeHtml(brandTheme(state.brand)) + '">' +
        '<header class="minute-header">' +
          '<div class="minute-header-brand"><img src="../assets/logo-header.webp" alt="Grupo Sur Automotores"><div class="minute-brand-lockup"><strong>' + escapeHtml(state.brand) + '</strong><span>Solicitud comercial · ' + escapeHtml(state.model.name) + '</span></div></div>' +
          '<div class="minute-identifiers"><strong>' + escapeHtml(minuteCode) + '</strong><span>Fecha: ' + escapeHtml(new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(issueDate)) + '</span><span>Precalificación: ' + escapeHtml(state.requestId) + '</span></div>' +
        '</header>' +
        '<section class="minute-vehicle">' +
          '<div class="minute-vehicle-image"><img src="' + escapeHtml(state.model.image) + '" alt="' + escapeHtml(state.brand + " " + state.model.name) + '"></div>' +
          '<div class="minute-vehicle-copy"><span>Vehículo evaluado</span><h1>' + escapeHtml(state.brand + " " + state.model.name) + '</h1><p>' + escapeHtml(state.model.campaign) + '</p><strong>Precalificación aprobada</strong></div>' +
        '</section>' +
        '<section class="minute-print-section"><h2>Datos del cliente</h2><div class="minute-data-grid">' +
          minuteRow("Nombre y apellido", data.firstName + " " + data.lastName) +
          minuteRow(data.documentType, data.documentNumber) +
          minuteRow("CUIL", formatCuilInput(data.cuil)) +
          minuteRow("Fecha de nacimiento", formatDate(data.birthDate)) +
          minuteRow("Domicilio", data.address) +
          minuteRow("Localidad / Provincia", data.cityProvince) +
          minuteRow("Código postal", data.postalCode) +
          minuteRow("Estado civil", data.maritalStatus) +
          minuteRow("Cónyuge / conviviente", spouse) +
        '</div></section>' +
        '<section class="minute-print-section"><h2>Contacto y situación laboral</h2><div class="minute-data-grid">' +
          minuteRow("Teléfono", data.primaryPhone) +
          minuteRow("Teléfono alternativo", data.alternatePhone || "No informado") +
          minuteRow("Correo electrónico", data.email) +
          minuteRow("Contacto preferido", data.contactSchedule) +
          minuteRow("Condición laboral", data.employmentStatus) +
          minuteRow("Empresa / actividad", data.employerName) +
          minuteRow("Antigüedad", formatYears(data.employmentSeniority)) +
          minuteRow("Ingresos mensuales", formatMoney(data.monthlyIncome)) +
        '</div></section>' +
        '<section class="minute-print-section"><h2>Condiciones comerciales</h2><div class="minute-data-grid three-columns">' +
          minuteRow("Marca", state.brand) +
          minuteRow("Modelo", state.model.name) +
          minuteRow("Tipo de plan", data.planType) +
          minuteRow("Precio pactado", formatMoney(data.agreedPrice)) +
          minuteRow("Cuotas abonadas", String(data.installmentsPaid)) +
          minuteRow("Cuotas a pagar", String(data.installmentsToPay)) +
          minuteRow("Débito automático", data.automaticDebit ? "Sí" : "No") +
          minuteRow("Cuota diferida", data.deferredInstallment ? "Sí" : "No") +
          minuteRow("Asesor", state.seller.name + " · " + state.seller.code) +
          minuteRow("Primer pago", data.firstPaymentDate ? formatDate(data.firstPaymentDate) + " · " + formatMoney(data.firstPaymentAmount) : "No informado") +
          minuteRow("Segundo pago", data.secondPaymentDate ? formatDate(data.secondPaymentDate) + " · " + formatMoney(data.secondPaymentAmount) : "No informado") +
          minuteRow("Bonificación", state.model.bonus) +
        '</div></section>' +
        '<section class="minute-print-section"><h2>Constancia y condiciones</h2><ol class="minute-terms">' +
          '<li>La presente minuta registra los datos y condiciones comerciales informados durante esta gestión. No constituye una solicitud de adhesión, aprobación financiera, adjudicación ni obligación de entrega.</li>' +
          '<li>La operación queda sujeta a validación documental y crediticia, vigencia de la campaña, disponibilidad del modelo y aceptación de las condiciones definitivas por las partes intervinientes.</li>' +
          '<li>Toda suma declarada deberá contar con el comprobante correspondiente emitido por el receptor autorizado. Esta minuta no acredita por sí misma pago, reserva ni cancelación.</li>' +
          '<li>Cuando se entregue un vehículo usado, su valor será determinado al momento de la tasación y peritaje, sujeto a la presentación de la documentación requerida.</li>' +
          '<li>Únicamente se considerarán los beneficios y bonificaciones expresamente incluidos en esta minuta y vigentes al momento de formalizar la operación.</li>' +
        '</ol></section>' +
        '<div class="minute-signatures"><div>Firma del cliente</div><div>Aclaración y DNI</div><div>Asesor responsable</div></div>' +
        '<footer class="minute-footer">Documento emitido desde el portal interno de Grupo Sur Automotores · Versión GS-MINUTA-2026-01</footer>' +
      '</article>';
    minutePrint.setAttribute("aria-hidden", "false");
  }

  function printMinute() {
    var images = Array.prototype.slice.call(minutePrint.querySelectorAll("img"));
    document.body.classList.add("printing-minute");
    Promise.all(images.map(function (image) {
      if (image.complete) {
        return Promise.resolve();
      }
      return new Promise(function (resolve) {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    })).then(function () {
      window.setTimeout(function () { window.print(); }, 80);
    });
  }

  function renderHistory() {
    var list = document.getElementById("historyList");
    if (!state.history.length) {
      list.innerHTML = '<div class="history-empty"><strong>Todavía no hay gestiones en esta sesión</strong>Generá una propuesta comercial para verla acá.</div>';
      return;
    }
    list.innerHTML = state.history.map(function (item) {
      return "" +
        '<div class="history-row">' +
          '<div><strong>' + escapeHtml(item.name) + '</strong><span>' + escapeHtml(item.cuil) + '</span></div>' +
          '<div><strong>' + escapeHtml(item.vehicle) + '</strong><span>' + escapeHtml(item.campaign) + '</span></div>' +
          '<div><strong>' + escapeHtml(item.requestId) + '</strong><span>' + escapeHtml(new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(item.date)) + '</span></div>' +
          '<span class="history-status' + (item.application ? ' has-minute' : '') + '">' + (item.application ? 'Minuta generada' : 'Aprobada') + '</span>' +
        '</div>';
    }).join("");
  }

  passwordToggle.addEventListener("click", function () {
    var input = document.getElementById("sellerPassword");
    var show = input.type === "password";
    input.type = show ? "text" : "password";
    passwordToggle.textContent = show ? "Ocultar" : "Ver";
    passwordToggle.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
  });

  loginForm.addEventListener("submit", async function (event) {
    var code;
    var button = loginForm.querySelector('button[type="submit"]');
    event.preventDefault();
    loginError.textContent = "";
    code = String(loginForm.elements.sellerCode.value || "").trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) {
      loginError.textContent = "Ingresá un código de vendedor válido.";
      return;
    }
    button.disabled = true;
    button.textContent = "Ingresando…";
    try {
      var authResponse = await supabaseClient.auth.signInWithPassword({
        email: code.toLowerCase() + "@acceso.compromisomi0km.com.ar",
        password: loginForm.elements.sellerPassword.value
      });
      if (authResponse.error) {
        throw authResponse.error;
      }
      var seller = await getSellerProfile();
      if (!seller) {
        await supabaseClient.auth.signOut();
        throw new Error("El acceso está pausado o no corresponde a un vendedor.");
      }
      await loadCentralCampaigns();
      showPortal(seller);
    } catch (error) {
      loginError.textContent = error.message === "Invalid login credentials" ? "El código o la contraseña no son correctos." : error.message;
    } finally {
      button.disabled = false;
      button.textContent = "Ingresar al portal";
    }
  });

  logoutButton.addEventListener("click", async function () {
    await supabaseClient.auth.signOut();
    showLogin();
  });

  document.getElementById("brandOptions").addEventListener("click", function (event) {
    var button = event.target.closest("[data-brand]");
    if (button) {
      selectBrand(button.dataset.brand);
    }
  });

  document.getElementById("modelOptions").addEventListener("click", function (event) {
    var button = event.target.closest("[data-model-index]");
    if (button) {
      selectModel(Number(button.dataset.modelIndex));
    }
  });

  document.addEventListener("click", function (event) {
    var actionButton = event.target.closest("[data-action]");
    var action;
    if (!actionButton) {
      return;
    }
    action = actionButton.dataset.action;
    if (action === "home" || action === "new-request") {
      resetFlow();
    } else if (action === "history") {
      renderHistory();
      setView("history");
    } else if (action === "back-to-brands") {
      state.brand = "";
      state.model = null;
      setView("brand");
    } else if (action === "back-to-models") {
      state.model = null;
      renderModels();
      setView("model");
    } else if (action === "back-to-result") {
      setView("result");
    }
  });

  clientForm.elements.cuil.addEventListener("input", function () {
    this.value = formatCuilInput(this.value);
  });

  clientForm.addEventListener("submit", function (event) {
    var data;
    var error;
    event.preventDefault();
    clientError.textContent = "";
    data = {
      fullName: String(clientForm.elements.fullName.value || "").trim().replace(/\s+/g, " "),
      phone: String(clientForm.elements.phone.value || "").trim(),
      email: String(clientForm.elements.email.value || "").trim().toLowerCase(),
      cuil: String(clientForm.elements.cuil.value || "").trim(),
      consent: clientForm.elements.consent.checked
    };
    error = validateClient(data);
    if (error) {
      clientError.textContent = error;
      return;
    }
    state.client = data;
    runProcessing();
  });

  applicationButton.addEventListener("click", openCommercialApplication);

  applicationForm.addEventListener("submit", async function (event) {
    var data;
    var error;
    var response;
    event.preventDefault();
    applicationError.textContent = "";
    data = readApplicationData();
    error = validateApplication(data);
    if (error) {
      applicationError.textContent = error;
      return;
    }
    applicationSubmitButton.disabled = true;
    applicationSubmitButton.textContent = "Guardando solicitud…";
    try {
      response = await saveCommercialApplication(data);
      if (response.error) {
        throw response.error;
      }
      state.applicationId = response.data.id;
      state.application = data;
      state.history.forEach(function (item) {
        if (item.requestId === state.requestId) {
          item.application = true;
        }
      });
      renderHistory();
      buildMinute(data);
      applicationSubmitButton.textContent = "Solicitud guardada";
      printMinute();
    } catch (saveError) {
      applicationError.textContent = saveError.message || "No se pudo guardar la solicitud comercial.";
      applicationSubmitButton.textContent = "Guardar y generar PDF";
    } finally {
      applicationSubmitButton.disabled = false;
    }
  });

  document.getElementById("printButton").addEventListener("click", function () {
    document.body.classList.remove("printing-minute");
    window.print();
  });

  window.addEventListener("afterprint", function () {
    document.body.classList.remove("printing-minute");
    minutePrint.setAttribute("aria-hidden", "true");
  });

  window.addEventListener("focus", async function () {
    if (!state.seller) {
      return;
    }
    try {
      await loadCentralCampaigns();
      if (state.brand && !state.model) {
        renderModels();
      }
    } catch (error) {
      return;
    }
  });

  formatCurrentDate();
  renderHistory();

  if (!supabaseClient) {
    loginError.textContent = "No se pudo conectar con el servicio de acceso.";
  } else {
    supabaseClient.auth.getUser().then(async function (response) {
      if (!response.data || !response.data.user) {
        showLogin();
        return;
      }
      var seller = await getSellerProfile();
      if (!seller) {
        await supabaseClient.auth.signOut();
        showLogin();
        return;
      }
      try {
        await loadCentralCampaigns();
        showPortal(seller);
      } catch (error) {
        await supabaseClient.auth.signOut();
        showLogin();
        loginError.textContent = "No se pudieron cargar las campañas. Intentá nuevamente.";
      }
    });
    document.getElementById("sellerCode").focus();
  }
}());
