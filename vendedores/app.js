(function () {
  "use strict";

  var DEMO_SELLERS = {
    GS001: {
      password: "demo2026",
      name: "Asesor Demo",
      code: "GS001",
      phone: "11 0000 0000"
    }
  };

  var BRANDS = {
    Volkswagen: {
      image: "../assets/brand-mini-vw.webp",
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
      image: "../assets/brand-mini-peugeot.webp",
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
      image: "../assets/brand-mini-fiat.webp",
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
    countdownTimer: null
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

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function initials(name) {
    return String(name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) { return part.charAt(0).toUpperCase(); })
      .join("");
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
    sessionStorage.setItem("grupoSurDemoSeller", seller.code);
    resetFlow();
  }

  function showLogin() {
    state.seller = null;
    state.brand = "";
    state.model = null;
    state.client = null;
    sessionStorage.removeItem("grupoSurDemoSeller");
    portal.hidden = true;
    loginPage.hidden = false;
    loginForm.reset();
    loginError.textContent = "";
    document.getElementById("sellerCode").focus();
  }

  function renderBrands() {
    var container = document.getElementById("brandOptions");
    container.innerHTML = Object.keys(BRANDS).map(function (brandName) {
      var brand = BRANDS[brandName];
      return "" +
        '<button class="brand-option" type="button" data-brand="' + escapeHtml(brandName) + '">' +
          '<span class="brand-option-image"><img src="' + brand.image + '" alt="' + escapeHtml(brandName) + '"></span>' +
          '<span class="brand-option-content">' +
            '<span><h3>' + escapeHtml(brandName) + '</h3><p>' + escapeHtml(brand.models.length) + ' modelos · ' + escapeHtml(brand.description) + '</p></span>' +
            '<span class="option-arrow" aria-hidden="true">→</span>' +
          '</span>' +
        '</button>';
    }).join("");
  }

  function renderModels() {
    var brand = BRANDS[state.brand];
    var container = document.getElementById("modelOptions");
    document.getElementById("selectedBrandBadge").textContent = state.brand;
    document.getElementById("modelViewCopy").textContent = brand.models.length + " modelos con condiciones comerciales cargadas.";
    container.innerHTML = brand.models.map(function (model, index) {
      return "" +
        '<button class="model-option" type="button" data-model-index="' + index + '">' +
          '<span class="model-option-image"><img src="' + model.image + '" alt="' + escapeHtml(state.brand + " " + model.name) + '"></span>' +
          '<span class="model-option-content">' +
            '<span class="model-option-topline"><span>' + escapeHtml(state.brand) + '</span><span class="stock-badge">Campaña activa</span></span>' +
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
        '<span>Vehículo seleccionado</span>' +
        '<h3>' + escapeHtml(state.brand + " " + model.name) + '</h3>' +
        '<p>' + escapeHtml(model.short) + '</p>' +
        '<ul class="summary-list">' +
          '<li><span>Campaña</span><strong>' + escapeHtml(model.campaign) + '</strong></li>' +
          '<li><span>Anticipo estimado</span><strong>' + escapeHtml(model.advance) + '</strong></li>' +
          '<li><span>Cuota estimada</span><strong>' + escapeHtml(model.installment) + '</strong></li>' +
          '<li><span>Disponibilidad</span><strong>' + escapeHtml(model.availability) + '</strong></li>' +
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
    document.getElementById("stepper").hidden = isHistory;

    document.querySelectorAll("#stepper li").forEach(function (item, index) {
      item.classList.toggle("is-current", index === activeIndex);
      item.classList.toggle("is-complete", activeIndex > index);
    });

    var titles = {
      brand: "Nueva precalificación",
      model: "Selección de modelo",
      client: "Datos del cliente",
      result: "Constancia de precalificación",
      history: "Actividad reciente"
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
    if (state.countdownTimer) {
      window.clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }
    clientForm.reset();
    clientError.textContent = "";
    renderBrands();
    setView("brand");
  }

  function selectBrand(brandName) {
    if (!BRANDS[brandName]) {
      return;
    }
    state.brand = brandName;
    state.model = null;
    renderModels();
    setView("model");
  }

  function selectModel(index) {
    var models = BRANDS[state.brand] && BRANDS[state.brand].models;
    var model = models && models[index];
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
    var weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    var sum = 0;
    var check;
    var i;

    if (clean.length !== 11 || /^(\d)\1+$/.test(clean)) {
      return false;
    }

    for (i = 0; i < 10; i += 1) {
      sum += Number(clean.charAt(i)) * weights[i];
    }
    check = (11 - (sum % 11)) % 11;
    if (check === 10) {
      return false;
    }
    return check === Number(clean.charAt(10));
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
      return "Revisá el CUIL ingresado. El dígito verificador no es válido.";
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
      { title: "Validando los datos ingresados…", copy: "Comprobando formato e integridad de la información.", progress: "34%", delay: 1100 },
      { title: "Verificando la campaña seleccionada…", copy: "Revisando las condiciones preliminares del modelo.", progress: "68%", delay: 1250 },
      { title: "Preparando la constancia…", copy: "Generando el resultado comercial para presentar al cliente.", progress: "100%", delay: 1100 }
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

  function buildResult() {
    var model = state.model;
    var client = state.client;
    var seller = state.seller;
    var requestId = makeRequestId();
    state.validUntil = new Date(Date.now() + model.validityHours * 60 * 60 * 1000);

    document.getElementById("resultVehicleImage").src = model.image;
    document.getElementById("resultVehicleImage").alt = state.brand + " " + model.name;
    document.getElementById("resultBrand").textContent = state.brand + " · " + model.campaign;
    document.getElementById("resultTitle").textContent = model.name;
    document.getElementById("resultIntro").textContent = client.fullName + ", la solicitud reúne las condiciones comerciales preliminares cargadas para esta campaña.";
    document.getElementById("resultClientName").textContent = client.fullName;
    document.getElementById("resultCuil").textContent = maskCuil(client.cuil);
    document.getElementById("resultPhone").textContent = client.phone;
    document.getElementById("resultEmail").textContent = client.email;
    document.getElementById("resultCampaign").textContent = model.campaign;
    document.getElementById("resultAdvance").textContent = model.advance;
    document.getElementById("resultInstallment").textContent = model.installment;
    document.getElementById("resultAvailability").textContent = model.availability;
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
      date: new Date()
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

  function renderHistory() {
    var list = document.getElementById("historyList");
    if (!state.history.length) {
      list.innerHTML = '<div class="history-empty"><strong>Todavía no hay actividad</strong>Completá una precalificación de demostración para verla acá.</div>';
      return;
    }
    list.innerHTML = state.history.map(function (item) {
      return "" +
        '<div class="history-row">' +
          '<div><strong>' + escapeHtml(item.name) + '</strong><span>' + escapeHtml(item.cuil) + '</span></div>' +
          '<div><strong>' + escapeHtml(item.vehicle) + '</strong><span>' + escapeHtml(item.campaign) + '</span></div>' +
          '<div><strong>' + escapeHtml(item.requestId) + '</strong><span>' + escapeHtml(new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(item.date)) + '</span></div>' +
          '<span class="history-status">Aprobada</span>' +
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

  loginForm.addEventListener("submit", function (event) {
    var code;
    var seller;
    event.preventDefault();
    loginError.textContent = "";
    code = String(loginForm.elements.sellerCode.value || "").trim().toUpperCase();
    seller = DEMO_SELLERS[code];
    if (!seller || seller.password !== loginForm.elements.sellerPassword.value) {
      loginError.textContent = "El código o la contraseña no son correctos.";
      return;
    }
    showPortal(seller);
  });

  logoutButton.addEventListener("click", showLogin);

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

  document.getElementById("printButton").addEventListener("click", function () {
    window.print();
  });

  formatCurrentDate();
  renderHistory();

  var existingSellerCode = sessionStorage.getItem("grupoSurDemoSeller");
  if (existingSellerCode && DEMO_SELLERS[existingSellerCode]) {
    showPortal(DEMO_SELLERS[existingSellerCode]);
  } else {
    document.getElementById("sellerCode").focus();
  }
}());
