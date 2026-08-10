(function () {
  "use strict";

  var STORAGE_KEY = "grupoSurCampaignConfigV1";
  var SESSION_KEY = "grupoSurDemoAdmin";
  var DEMO_ADMIN = { code: "ADMIN", password: "admin2026" };

  var CATALOG = [
    { brand: "Volkswagen", name: "Amarok", image: "/assets/vw-amarok.webp", campaign: "Plan 70/30", slots: 2 },
    { brand: "Volkswagen", name: "Tera", image: "/assets/vw-tera.webp", campaign: "Plan 70/30", slots: 3 },
    { brand: "Volkswagen", name: "Taos", image: "/assets/vw-taos.webp", campaign: "Plan 60/40", slots: null },
    { brand: "Volkswagen", name: "Nivus", image: "/assets/vw-nivus.webp", campaign: "Plan 80/20", slots: 4 },
    { brand: "Volkswagen", name: "T-Cross", image: "/assets/vw-tcross.webp", campaign: "Plan 80/20", slots: null },
    { brand: "Volkswagen", name: "Virtus", image: "/assets/vw-virtus.webp", campaign: "Plan 90/10", slots: 2 },
    { brand: "Peugeot", name: "208", image: "/assets/peugeot-208.webp", campaign: "Plan 80/20", slots: 3 },
    { brand: "Peugeot", name: "2008", image: "/assets/peugeot-2008.webp", campaign: "Plan 70/30", slots: 2 },
    { brand: "Peugeot", name: "Partner", image: "/assets/peugeot-partner.webp", campaign: "Plan utilitario", slots: null },
    { brand: "Peugeot", name: "Expert", image: "/assets/peugeot-expert.webp", campaign: "Plan utilitario", slots: null },
    { brand: "Fiat", name: "Cronos", image: "/assets/fiat-cronos.webp", campaign: "Plan 80/20", slots: 4 },
    { brand: "Fiat", name: "Mobi", image: "/assets/fiat-mobi.webp", campaign: "Plan 80/20", slots: 3 },
    { brand: "Fiat", name: "Argo", image: "/assets/fiat-argo.webp", campaign: "Campaña lanzamiento", slots: null },
    { brand: "Fiat", name: "Titano", image: "/assets/fiat-titano.webp", campaign: "Plan pick-up", slots: 2 },
    { brand: "Fiat", name: "Fastback", image: "/assets/fiat-fastback.webp", campaign: "Plan 70/30", slots: null },
    { brand: "Fiat", name: "Strada", image: "/assets/fiat-strada.webp", campaign: "Plan utilitario", slots: null }
  ];

  var DEFAULTS = {
    active: true,
    bonus: "Consultar bonificación vigente",
    benefits: ["Asesoramiento personalizado", "Condiciones sujetas a disponibilidad"],
    validFrom: "",
    validTo: "",
    validityHours: 24
  };

  var state = {
    brand: "Todas",
    selectedKey: keyFor(CATALOG[0]),
    config: readConfig()
  };

  var adminLogin = document.getElementById("adminLogin");
  var adminApp = document.getElementById("adminApp");
  var loginForm = document.getElementById("adminLoginForm");
  var loginError = document.getElementById("loginError");
  var campaignForm = document.getElementById("campaignForm");
  var formMessage = document.getElementById("formMessage");

  function keyFor(item) {
    return item.brand + "::" + item.name;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function readConfig() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
    } catch (error) {
      return {};
    }
  }

  function writeConfig() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
  }

  function readSession() {
    try {
      return sessionStorage.getItem(SESSION_KEY) === "true";
    } catch (error) {
      return false;
    }
  }

  function writeSession(active) {
    try {
      if (active) {
        sessionStorage.setItem(SESSION_KEY, "true");
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch (error) {
      return;
    }
  }

  function effectiveConfig(item) {
    return Object.assign({}, DEFAULTS, { slots: item.slots }, state.config[keyFor(item)] || {});
  }

  function dateStatus(config) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var from = config.validFrom ? new Date(config.validFrom + "T00:00:00") : null;
    var to = config.validTo ? new Date(config.validTo + "T23:59:59") : null;
    if (config.active === false) {
      return { active: false, label: "Pausada" };
    }
    if (from && today < from) {
      return { active: false, label: "Programada" };
    }
    if (to && today > to) {
      return { active: false, label: "Vencida" };
    }
    return { active: true, label: "Activa" };
  }

  function selectedItem() {
    return CATALOG.find(function (item) { return keyFor(item) === state.selectedKey; }) || CATALOG[0];
  }

  function showApp() {
    writeSession(true);
    adminLogin.hidden = true;
    adminApp.hidden = false;
    renderAll();
  }

  function showLogin() {
    writeSession(false);
    adminApp.hidden = true;
    adminLogin.hidden = false;
    loginForm.reset();
    loginError.textContent = "";
    document.getElementById("adminCode").focus();
  }

  function renderFilters() {
    var brands = ["Todas", "Volkswagen", "Peugeot", "Fiat"];
    document.getElementById("brandFilters").innerHTML = brands.map(function (brand) {
      return '<button class="brand-filter' + (brand === state.brand ? " is-active" : "") + '" type="button" data-brand="' + escapeHtml(brand) + '">' + escapeHtml(brand) + "</button>";
    }).join("");
  }

  function renderList() {
    var items = CATALOG.filter(function (item) {
      return state.brand === "Todas" || item.brand === state.brand;
    });
    document.getElementById("campaignList").innerHTML = items.map(function (item) {
      var config = effectiveConfig(item);
      var status = dateStatus(config);
      var availability = config.slots === null || config.slots === "" ? "Cupos sin informar" : config.slots + " cupos";
      return "" +
        '<button class="campaign-item' + (keyFor(item) === state.selectedKey ? " is-selected" : "") + '" type="button" data-key="' + escapeHtml(keyFor(item)) + '">' +
          '<img src="' + item.image + '" alt="">' +
          '<span class="campaign-item-copy"><span>' + escapeHtml(item.brand) + '</span><strong>' + escapeHtml(item.name) + '</strong><small>' + escapeHtml(availability + " · " + config.validityHours + " h") + '</small></span>' +
          '<i class="status-dot' + (status.active ? " is-active" : "") + '" title="' + escapeHtml(status.label) + '"></i>' +
        "</button>";
    }).join("");
  }

  function renderEditor() {
    var item = selectedItem();
    var config = effectiveConfig(item);
    document.getElementById("editorImage").src = item.image;
    document.getElementById("editorImage").alt = item.brand + " " + item.name;
    document.getElementById("editorBrand").textContent = item.brand;
    document.getElementById("editorModel").textContent = item.name;
    document.getElementById("editorCampaign").textContent = item.campaign;
    document.getElementById("campaignActive").checked = config.active !== false;
    document.getElementById("campaignBonus").value = config.bonus || "";
    document.getElementById("campaignBenefits").value = (config.benefits || []).join("\n");
    document.getElementById("campaignSlots").value = config.slots === null || config.slots === "" ? "" : config.slots;
    document.getElementById("campaignHours").value = config.validityHours || 24;
    document.getElementById("campaignValidFrom").value = config.validFrom || "";
    document.getElementById("campaignValidTo").value = config.validTo || "";
    formMessage.textContent = "";
    formMessage.classList.remove("is-error");
    updatePreview();
  }

  function renderStats() {
    var active = 0;
    var slots = 0;
    var hours = 0;
    CATALOG.forEach(function (item) {
      var config = effectiveConfig(item);
      if (dateStatus(config).active) {
        active += 1;
      }
      if (config.slots !== null && config.slots !== "" && Number.isFinite(Number(config.slots))) {
        slots += Number(config.slots);
      }
      hours += Number(config.validityHours) || 24;
    });
    document.getElementById("activeCount").textContent = active;
    document.getElementById("slotCount").textContent = slots;
    document.getElementById("timerAverage").textContent = Math.round(hours / CATALOG.length) + " h";
  }

  function updatePreview() {
    var item = selectedItem();
    var previewConfig = {
      active: document.getElementById("campaignActive").checked,
      bonus: document.getElementById("campaignBonus").value.trim(),
      slots: document.getElementById("campaignSlots").value,
      validFrom: document.getElementById("campaignValidFrom").value,
      validTo: document.getElementById("campaignValidTo").value,
      validityHours: document.getElementById("campaignHours").value
    };
    var status = dateStatus(previewConfig);
    document.getElementById("previewTitle").textContent = item.brand + " " + item.name;
    document.getElementById("previewBonus").textContent = previewConfig.bonus || "Sin bonificación destacada";
    document.getElementById("previewSlots").textContent = previewConfig.slots === "" ? "Sin informar" : previewConfig.slots + " disponibles";
    document.getElementById("previewHours").textContent = (previewConfig.validityHours || 24) + " horas";
    document.getElementById("previewStatus").textContent = status.label;
  }

  function renderAll() {
    renderFilters();
    renderList();
    renderEditor();
    renderStats();
  }

  loginForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var code = loginForm.elements.adminCode.value.trim().toUpperCase();
    var password = loginForm.elements.adminPassword.value;
    if (code !== DEMO_ADMIN.code || password !== DEMO_ADMIN.password) {
      loginError.textContent = "Usuario o contraseña incorrectos.";
      return;
    }
    loginError.textContent = "";
    showApp();
  });

  document.getElementById("passwordToggle").addEventListener("click", function () {
    var input = document.getElementById("adminPassword");
    var show = input.type === "password";
    input.type = show ? "text" : "password";
    this.textContent = show ? "Ocultar" : "Ver";
  });

  document.getElementById("logoutButton").addEventListener("click", showLogin);

  document.getElementById("brandFilters").addEventListener("click", function (event) {
    var button = event.target.closest("[data-brand]");
    if (!button) {
      return;
    }
    state.brand = button.dataset.brand;
    var firstVisible = CATALOG.find(function (item) { return state.brand === "Todas" || item.brand === state.brand; });
    if (firstVisible) {
      state.selectedKey = keyFor(firstVisible);
    }
    renderFilters();
    renderList();
    renderEditor();
  });

  document.getElementById("campaignList").addEventListener("click", function (event) {
    var button = event.target.closest("[data-key]");
    if (!button) {
      return;
    }
    state.selectedKey = button.dataset.key;
    renderList();
    renderEditor();
  });

  campaignForm.addEventListener("input", updatePreview);
  campaignForm.addEventListener("change", updatePreview);

  campaignForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var item = selectedItem();
    var slotsValue = document.getElementById("campaignSlots").value;
    var hours = Number(document.getElementById("campaignHours").value);
    var validFrom = document.getElementById("campaignValidFrom").value;
    var validTo = document.getElementById("campaignValidTo").value;
    var benefits = document.getElementById("campaignBenefits").value.split("\n").map(function (line) { return line.trim(); }).filter(Boolean);

    formMessage.classList.remove("is-error");
    if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
      formMessage.textContent = "Ingresá una duración entre 1 y 720 horas.";
      formMessage.classList.add("is-error");
      return;
    }
    if (slotsValue !== "" && (!Number.isInteger(Number(slotsValue)) || Number(slotsValue) < 0)) {
      formMessage.textContent = "Los cupos deben ser un número entero igual o mayor que cero.";
      formMessage.classList.add("is-error");
      return;
    }
    if (validFrom && validTo && validFrom > validTo) {
      formMessage.textContent = "La fecha de finalización no puede ser anterior al inicio.";
      formMessage.classList.add("is-error");
      return;
    }

    state.config[keyFor(item)] = {
      active: document.getElementById("campaignActive").checked,
      bonus: document.getElementById("campaignBonus").value.trim(),
      benefits: benefits,
      slots: slotsValue === "" ? null : Number(slotsValue),
      validFrom: validFrom,
      validTo: validTo,
      validityHours: hours,
      updatedAt: new Date().toISOString()
    };
    writeConfig();
    renderList();
    renderStats();
    updatePreview();
    formMessage.textContent = "Cambios guardados. Ya están disponibles en el portal de este navegador.";
  });

  document.getElementById("resetButton").addEventListener("click", function () {
    var item = selectedItem();
    delete state.config[keyFor(item)];
    writeConfig();
    renderList();
    renderStats();
    renderEditor();
    formMessage.textContent = "Se restauraron los valores iniciales de este modelo.";
  });

  window.addEventListener("storage", function (event) {
    if (event.key === STORAGE_KEY) {
      state.config = readConfig();
      renderAll();
    }
  });

  document.getElementById("currentDate").textContent = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date());

  if (readSession()) {
    showApp();
  } else {
    showLogin();
  }
}());
