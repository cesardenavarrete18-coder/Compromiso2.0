(function () {
  "use strict";

  var supabaseClient = window.grupoSurSupabaseClient;

  var BRAND_LOGOS = Object.freeze({
    Volkswagen: "../assets/brand-logo-vw-flat.png",
    Peugeot: "../assets/brand-logo-peugeot-flat.png",
    Fiat: "../assets/brand-logo-fiat-flat.png"
  });

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
    modelGroup: null,
    model: null,
    client: null,
    validUntil: null,
    history: [],
    countdownTimer: null,
    visibleModels: [],
    visibleOffers: [],
    userId: "",
    requestId: "",
    prequalificationId: "",
    applicationId: "",
    application: null,
    applicationContext: null
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

  function formatCommercialMoney(value, isFrom) {
    if (value === null || value === "" || !Number.isFinite(Number(value))) {
      return "A confirmar";
    }
    return (isFrom ? "Desde " : "") + "$" + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Number(value));
  }

  function vehicleVersion(model) {
    return [model.versionName, model.transmission].filter(Boolean).join(" ") || "Versión a confirmar";
  }

  function vehicleTitle(model) {
    return [model.name, model.versionName, model.transmission].filter(Boolean).join(" ");
  }

  function planDescription(model) {
    return model.campaign + (model.installmentCount ? " · " + model.installmentCount + " cuotas" : "");
  }

  async function loadCentralCampaigns() {
    var response = await supabaseClient
      .from("campaigns")
      .select("id, plan_name, version_name, transmission, installment_count, final_price, advance_amount, installment_amount, installment_is_from, sort_order, active, bonus, benefits, slots, valid_from, valid_to, timer_hours, model:models!inner(id, name, image_path, short_description, sort_order, active, brand:brands!inner(name, description, image_path, sort_order, active))");
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
          models: [],
          modelMap: {}
        };
      }
      if (!grouped[brand.name].modelMap[model.id]) {
        grouped[brand.name].modelMap[model.id] = {
          id: model.id,
          name: model.name,
          image: model.image_path,
          short: model.short_description,
          active: model.active && brand.active,
          sortOrder: model.sort_order || 0,
          offers: []
        };
        grouped[brand.name].models.push(grouped[brand.name].modelMap[model.id]);
      }
      grouped[brand.name].modelMap[model.id].offers.push({
        campaignId: row.id,
        campaign: row.plan_name,
        versionName: row.version_name || "",
        transmission: row.transmission || "",
        installmentCount: row.installment_count,
        finalPrice: row.final_price,
        advanceAmount: row.advance_amount,
        installmentAmount: row.installment_amount,
        installmentIsFrom: row.installment_is_from !== false,
        advance: formatCommercialMoney(row.advance_amount, false),
        installment: formatCommercialMoney(row.installment_amount, row.installment_is_from !== false),
        active: row.active && model.active && brand.active,
        bonus: row.bonus,
        benefits: row.benefits || [],
        slots: row.slots,
        validFrom: row.valid_from || "",
        validTo: row.valid_to || "",
        validityHours: row.timer_hours || 24,
        sortOrder: row.sort_order || 0
      });
    });
    Object.keys(grouped).forEach(function (brandName) {
      grouped[brandName].models.sort(function (a, b) { return a.sortOrder - b.sortOrder; });
      grouped[brandName].models.forEach(function (model) {
        model.offers.sort(function (a, b) { return a.sortOrder - b.sortOrder; });
      });
      delete grouped[brandName].modelMap;
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

  function resolveCommercialCampaign(campaignId) {
    var resolved = null;
    Object.keys(BRANDS).some(function (brandName) {
      var brand = BRANDS[brandName];
      return brand.models.some(function (model) {
        var offer = model.offers.find(function (item) {
          return item.campaignId === campaignId && isCampaignActive(item);
        });
        if (!offer || model.active === false) {
          return false;
        }
        resolved = { brandName: brandName, brand: brand, model: model, offer: offer };
        return true;
      });
    });
    return resolved;
  }

  function commercialCampaignError(resolved) {
    var offer;
    if (!resolved) {
      return "La campaña seleccionada ya no está vigente. Actualizá el catálogo y elegí otra opción.";
    }
    offer = resolved.offer;
    if (!offer.campaignId || !resolved.brandName || !resolved.model.id || !resolved.model.name) {
      return "La campaña no tiene una identidad comercial completa.";
    }
    if (!offer.versionName || !offer.transmission) {
      return "La campaña no tiene versión y transmisión completas.";
    }
    if (!offer.campaign || !Number.isInteger(Number(offer.installmentCount)) || Number(offer.installmentCount) < 1) {
      return "La campaña no tiene plan o cantidad de cuotas válidos.";
    }
    if (!Number.isFinite(Number(offer.finalPrice)) || Number(offer.finalPrice) <= 0) {
      return "La campaña seleccionada no tiene un valor final vigente cargado.";
    }
    if (offer.advanceAmount === null || offer.advanceAmount === "" || !Number.isFinite(Number(offer.advanceAmount))
      || offer.installmentAmount === null || offer.installmentAmount === "" || !Number.isFinite(Number(offer.installmentAmount)) || Number(offer.installmentAmount) <= 0) {
      return "La campaña seleccionada no tiene anticipo o cuota vigentes cargados.";
    }
    if (!resolved.model.image) {
      return "El modelo seleccionado no tiene una imagen vigente cargada.";
    }
    return "";
  }

  function buildCommercialCatalog() {
    return Object.keys(BRANDS).map(function (brandName) {
      var brand = BRANDS[brandName];
      var models = brand.models.filter(function (model) {
        return model.active !== false && model.offers.some(isCampaignActive);
      }).map(function (model) {
        var versionMap = {};
        model.offers.filter(isCampaignActive).forEach(function (offer) {
          var key = offer.versionName + "\u001f" + offer.transmission;
          if (!versionMap[key]) {
            versionMap[key] = {
              key: key,
              label: vehicleVersion(offer),
              campaigns: []
            };
          }
          versionMap[key].campaigns.push({
            id: offer.campaignId,
            label: planDescription(offer),
            planName: offer.campaign,
            installmentCount: offer.installmentCount,
            finalPrice: offer.finalPrice,
            validationError: commercialCampaignError({ brandName: brandName, brand: brand, model: model, offer: offer })
          });
        });
        return {
          id: model.id,
          name: model.name,
          versions: Object.keys(versionMap).map(function (key) { return versionMap[key]; })
        };
      });
      return { name: brandName, models: models };
    }).filter(function (brand) { return brand.models.length > 0; });
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

  function brandLogo(brandName) {
    return BRAND_LOGOS[brandName] || "../assets/logo-header.webp";
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
    document.getElementById("authLoading").hidden = true;
    loginPage.hidden = true;
    portal.hidden = false;
    document.getElementById("sellerAvatar").textContent = initials(seller.name);
    document.getElementById("sidebarSellerName").textContent = seller.name;
    document.getElementById("sidebarSellerCode").textContent = "Código " + seller.code;
    resetFlow();
    if (window.grupoSurCRM && typeof window.grupoSurCRM.open === "function") {
      window.grupoSurCRM.open("agenda");
    }
  }

  function showLogin() {
    state.seller = null;
    state.brand = "";
    state.modelGroup = null;
    state.model = null;
    state.client = null;
    portal.hidden = true;
    document.getElementById("authLoading").hidden = true;
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
      var available = brand.models.filter(function (model) {
        return model.active !== false && model.offers.map(function (offer) { return resolveModelConfig(brandName, offer); }).some(isCampaignActive);
      }).length;
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
      .filter(function (model) {
        return model.active !== false && model.offers.map(function (offer) { return resolveModelConfig(state.brand, offer); }).some(isCampaignActive);
      });
    document.getElementById("selectedBrandBadge").textContent = state.brand;
    document.getElementById("modelViewCopy").textContent = state.visibleModels.length + " modelos con propuestas comerciales activas.";
    if (!state.visibleModels.length) {
      container.innerHTML = '<div class="history-empty"><strong>No hay campañas activas</strong>El administrador debe activar al menos un modelo para esta marca.</div>';
      return;
    }
    container.innerHTML = state.visibleModels.map(function (model, index) {
      var activeOffers = model.offers.map(function (offer) { return resolveModelConfig(state.brand, offer); }).filter(isCampaignActive);
      var offerCount = activeOffers.length === 1 ? "1 plan disponible" : activeOffers.length + " planes disponibles";
      return "" +
        '<button class="model-option" type="button" data-model-index="' + index + '">' +
          '<span class="model-option-image"><img src="' + model.image + '" alt="' + escapeHtml(state.brand + " " + model.name) + '"></span>' +
          '<span class="model-option-content">' +
            '<span class="model-option-topline"><span>' + escapeHtml(state.brand) + '</span><span class="stock-badge">' + escapeHtml(offerCount) + '</span></span>' +
            '<h3>' + escapeHtml(model.name) + '</h3>' +
            '<p>' + escapeHtml(model.short) + '</p>' +
            '<span class="model-condition"><span>Comparar propuestas</span><strong>Ver planes →</strong></span>' +
          '</span>' +
        '</button>';
    }).join("");
  }

  function renderOffers() {
    var group = state.modelGroup;
    var container = document.getElementById("offerOptions");
    state.visibleOffers = group.offers
      .map(function (offer) { return resolveModelConfig(state.brand, offer); })
      .filter(isCampaignActive);
    document.getElementById("selectedModelBadge").textContent = state.brand + " " + group.name;
    document.getElementById("offerViewCopy").textContent = state.visibleOffers.length === 1
      ? "Hay una propuesta comercial activa para este modelo."
      : "Hay " + state.visibleOffers.length + " propuestas activas. Elegí la versión y el plan a presentar.";
    container.innerHTML = state.visibleOffers.map(function (offer, index) {
      return '<button class="offer-option" type="button" data-offer-index="' + index + '">' +
        '<span class="offer-option-head"><span>' + escapeHtml(vehicleVersion(offer)) + '</span><i>Disponible</i></span>' +
        '<h3>' + escapeHtml(offer.campaign) + '</h3>' +
        '<p>' + escapeHtml(offer.installmentCount ? offer.installmentCount + " cuotas" : "Cantidad de cuotas a confirmar") + '</p>' +
        '<dl><div><dt>Anticipo</dt><dd>' + escapeHtml(offer.advance) + '</dd></div><div><dt>Cuota visible</dt><dd>' + escapeHtml(offer.installment) + '</dd></div></dl>' +
        '<span class="offer-option-action">Presentar esta propuesta →</span>' +
      '</button>';
    }).join("");
  }

  function renderSelectionSummary() {
    var model = state.model;
    document.getElementById("selectionSummary").innerHTML = "" +
      '<div class="summary-image"><img src="' + model.image + '" alt="' + escapeHtml(state.brand + " " + model.name) + '"></div>' +
      '<div class="summary-content">' +
        '<span>Propuesta seleccionada</span>' +
        '<h3>' + escapeHtml(state.brand + " " + vehicleTitle(model)) + '</h3>' +
        '<p>' + escapeHtml(model.short) + '</p>' +
        '<ul class="summary-list">' +
          '<li><span>Plan</span><strong>' + escapeHtml(planDescription(model)) + '</strong></li>' +
          '<li><span>Versión</span><strong>' + escapeHtml(vehicleVersion(model)) + '</strong></li>' +
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

    var stepOrder = ["brand", "model", "offer", "client", "result"];
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
      offer: "Selección de plan comercial",
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
    state.modelGroup = null;
    state.model = null;
    state.client = null;
    state.validUntil = null;
    state.requestId = "";
    state.prequalificationId = "";
    state.applicationId = "";
    state.application = null;
    state.applicationContext = null;
    state.visibleOffers = [];
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
    state.modelGroup = null;
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
    state.modelGroup = model;
    state.model = null;
    renderOffers();
    setView("offer");
  }

  function selectOffer(index) {
    var offer = state.visibleOffers[index];
    if (!offer || !state.modelGroup) {
      return;
    }
    state.model = Object.assign({}, state.modelGroup, offer);
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
      customer_name: state.client.fullName,
      customer_phone: state.client.phone,
      customer_document: cleanCuil.slice(2, -1),
      model_name: vehicleTitle(state.model),
      seller_name: state.seller.name,
      timer_hours: state.model.validityHours,
      valid_until: state.validUntil.toISOString(),
      campaign_snapshot: {
        brand: state.brand,
        model: state.model.name,
        campaign: state.model.campaign,
        version: state.model.versionName,
        transmission: state.model.transmission,
        installmentCount: state.model.installmentCount,
        finalPrice: state.model.finalPrice,
        advance: state.model.advance,
        installment: state.model.installment,
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
    document.getElementById("resultVehicleImage").alt = state.brand + " " + vehicleTitle(model);
    document.getElementById("resultBrandLogo").src = brandLogo(state.brand);
    document.getElementById("resultBrandLogo").alt = "Logo " + state.brand;
    document.getElementById("resultBrand").textContent = state.brand + " · " + planDescription(model);
    document.getElementById("resultTitle").textContent = vehicleTitle(model);
    document.getElementById("resultIntro").textContent = client.fullName + ", la gestión reúne las condiciones comerciales preliminares de esta propuesta. El asesor te explicará los próximos pasos para avanzar.";
    document.getElementById("resultClientName").textContent = client.fullName;
    document.getElementById("resultCuil").textContent = maskCuil(client.cuil);
    document.getElementById("resultPhone").textContent = client.phone;
    document.getElementById("resultEmail").textContent = client.email;
    document.getElementById("resultCampaign").textContent = planDescription(model);
    document.getElementById("resultAdvance").textContent = model.advance;
    document.getElementById("resultInstallment").textContent = model.installment;
    document.getElementById("resultVersion").textContent = vehicleVersion(model);
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
      vehicle: state.brand + " " + vehicleTitle(model),
      campaign: planDescription(model),
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

  function parseDisplayDate(value) {
    var match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || "").trim());
    var parsed;
    if (!match) {
      return "";
    }
    parsed = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    if (parsed.getFullYear() !== Number(match[3]) || parsed.getMonth() !== Number(match[2]) - 1 || parsed.getDate() !== Number(match[1])) {
      return "";
    }
    return match[3] + "-" + match[2] + "-" + match[1];
  }

  function displayDateInput(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").slice(0, 10));
    return match ? match[3] + "/" + match[2] + "/" + match[1] : String(value || "");
  }

  function maskDateInput(field) {
    var clean = String(field.value || "").replace(/\D/g, "").slice(0, 8);
    field.value = [clean.slice(0, 2), clean.slice(2, 4), clean.slice(4, 8)].filter(Boolean).join("/");
  }

  function readApplicationData() {
    var fields = applicationForm.elements;
    return {
      firstName: String(fields.firstName.value || "").trim().replace(/\s+/g, " "),
      lastName: String(fields.lastName.value || "").trim().replace(/\s+/g, " "),
      documentType: String(fields.documentType.value || "").trim(),
      documentNumber: digits(fields.documentNumber.value),
      cuil: digits(fields.cuil.value),
      birthDate: parseDisplayDate(fields.birthDate.value),
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
      deferredInstallment: false,
      installmentsPaid: 0,
      installmentsToPay: Number(state.model.installmentCount) || 1,
      planType: String(fields.planType.value || "").trim().replace(/\s+/g, " "),
      agreedPrice: Number(state.model.finalPrice) || null,
      firstPaymentDate: "",
      firstPaymentAmount: null,
      secondPaymentDate: "",
      secondPaymentAmount: null,
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
    if (!data.automaticDebitSelected) {
      return "Indicá si corresponde débito automático.";
    }
    if (data.planType.length < 3 || !data.agreedPrice) {
      return "El plan seleccionado debe tener un valor final vigente cargado en su ficha.";
    }
    if (!data.consent) {
      return "El vendedor y el cliente deben confirmar los datos antes de enviar el datero.";
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
      field.value = name === "birthDate" ? displayDateInput(value) : String(value);
    }
  }

  function crmApplicationClient(lead) {
    var customer = lead && lead.customer;
    customer = Array.isArray(customer) ? customer[0] || {} : customer || {};
    return {
      fullName: customer.full_name || lead.customer_name || "",
      phone: customer.primary_phone || lead.customer_phone || "",
      email: customer.email || "",
      cuil: customer.cuil || "",
      documentNumber: customer.document_number || ""
    };
  }

  function openCommercialApplication(context) {
    var names;
    var data;
    var isCrmLead = context && context.origin === "crm_lead";
    var client;
    var selectedCampaign;
    if (isCrmLead) {
      selectedCampaign = resolveCommercialCampaign(context.campaignId);
      if (!context.lead || !context.lead.id || commercialCampaignError(selectedCampaign)) {
        return;
      }
      client = crmApplicationClient(context.lead);
      state.applicationContext = {
        origin: "crm_lead",
        leadId: context.lead.id,
        campaignId: selectedCampaign.offer.campaignId
      };
      state.prequalificationId = "";
      state.applicationId = "";
      state.application = null;
      state.requestId = "CRM-" + context.lead.id;
      state.client = client;
      state.brand = selectedCampaign.brandName;
      state.model = Object.assign({}, selectedCampaign.model, selectedCampaign.offer);
    } else {
      if (!state.prequalificationId) {
        return;
      }
      state.applicationContext = { origin: "prequalification" };
      client = state.client;
    }
    names = splitClientName(client.fullName);
    data = state.application || {
      firstName: names.firstName,
      lastName: names.lastName,
      documentType: "DNI",
      documentNumber: client.documentNumber || "",
      cuil: client.cuil,
      birthDate: "",
      address: "",
      cityProvince: "",
      postalCode: "",
      maritalStatus: "",
      spouseName: "",
      spouseDocument: "",
      primaryPhone: client.phone,
      alternatePhone: "",
      email: client.email,
      contactSchedule: "",
      employmentStatus: "",
      employerName: "",
      employmentSeniority: "",
      monthlyIncome: "",
      automaticDebit: "",
      planType: planDescription(state.model),
      agreedPrice: state.model.finalPrice || "",
      firstPaymentDate: "",
      firstPaymentAmount: "",
      secondPaymentDate: "",
      secondPaymentAmount: "",
      consent: false
    };

    applicationForm.reset();
    Object.keys(data).forEach(function (name) {
      var value = data[name];
      if (name === "automaticDebit") {
        value = value === "" ? "" : String(value);
      }
      setApplicationField(name === "consent" ? "applicationConsent" : name, value);
    });
    setApplicationField("cuil", formatCuilInput(data.cuil));
    applicationForm.elements.cuil.readOnly = !isCrmLead;
    applicationForm.elements.planType.readOnly = isCrmLead;
    applicationForm.elements.agreedPrice.readOnly = true;
    setApplicationField("agreedPrice", state.model.finalPrice ? formatMoney(state.model.finalPrice) : "");
    document.getElementById("applicationRequestCode").textContent = state.requestId;
    document.getElementById("applicationVehicle").textContent = state.brand + " " + vehicleTitle(state.model);
    document.getElementById("applicationCampaign").textContent = planDescription(state.model) || "Sin presupuesto asociado";
    document.querySelector('[data-action="back-to-result"]').textContent = isCrmLead ? "← Volver al Lead" : "← Volver a la precalificación";
    applicationError.textContent = "";
    setView("application");
    applicationForm.elements.firstName.focus();
  }

  function saveCommercialApplication(data) {
    var isCrmLead = state.applicationContext && state.applicationContext.origin === "crm_lead";
    var payload = {
      seller_user_id: state.userId,
      request_code: state.requestId,
      brand_name: state.brand,
      model_name: state.model.name,
      campaign_name: isCrmLead ? state.model.campaign : planDescription(state.model),
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
      first_payment_date: null,
      first_payment_amount: null,
      second_payment_date: null,
      second_payment_amount: null,
      status: "completed",
      terms_version: "GS-DATERO-PROVISORIO-2026-01",
      confirmed_at: new Date().toISOString(),
      commercial_snapshot: {
        plan: state.model.campaign,
        campaignId: state.model.campaignId,
        modelId: state.model.id,
        version: state.model.versionName,
        transmission: state.model.transmission,
        installmentCount: state.model.installmentCount,
        finalPrice: state.model.finalPrice,
        advanceAmount: state.model.advanceAmount,
        installmentAmount: state.model.installmentAmount,
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
    };
    if (isCrmLead) {
      payload.lead_id = state.applicationContext.leadId;
      payload.campaign_id = state.applicationContext.campaignId;
    } else {
      payload.prequalification_event_id = state.prequalificationId;
    }
    return supabaseClient.from("commercial_applications").upsert(payload, {
      onConflict: isCrmLead ? "lead_id" : "prequalification_event_id"
    }).select("id").single();
  }

  function minuteValue(value) {
    return escapeHtml(value || "No informado");
  }

  function minuteRow(label, value) {
    return '<div><span>' + escapeHtml(label) + '</span><strong>' + minuteValue(value) + '</strong></div>';
  }

  function buildMinute(data) {
    var issueDate = new Date();
    var minuteCode = "DAT-" + state.requestId.replace(/^GS-/, "");
    var spouse = data.spouseName ? data.spouseName + (data.spouseDocument ? " · DNI " + data.spouseDocument : "") : "No corresponde";
    minutePrint.innerHTML = '' +
      '<article class="minute-sheet" data-brand-theme="' + escapeHtml(brandTheme(state.brand)) + '">' +
        '<header class="minute-header">' +
          '<div class="minute-header-brand"><img class="minute-company-logo" src="../assets/logo-header.webp" alt="Grupo Sur Automotores"><div class="minute-brand-lockup"><img class="minute-brand-logo" src="' + escapeHtml(brandLogo(state.brand)) + '" alt="Logo ' + escapeHtml(state.brand) + '"><span>Datero provisorio · ' + escapeHtml(vehicleTitle(state.model)) + '</span></div></div>' +
          '<div class="minute-identifiers"><strong>' + escapeHtml(minuteCode) + '</strong><span>Fecha: ' + escapeHtml(new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(issueDate)) + '</span><span>Precalificación: ' + escapeHtml(state.requestId) + '</span></div>' +
        '</header>' +
        '<section class="minute-vehicle">' +
          '<div class="minute-vehicle-image"><img src="' + escapeHtml(state.model.image) + '" alt="' + escapeHtml(state.brand + " " + vehicleTitle(state.model)) + '"></div>' +
          '<div class="minute-vehicle-copy"><span>Vehículo evaluado</span><h1>' + escapeHtml(state.brand + " " + vehicleTitle(state.model)) + '</h1><p>' + escapeHtml(planDescription(state.model)) + '</p><strong>Precalificación aprobada</strong></div>' +
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
          minuteRow("Versión", vehicleVersion(state.model)) +
          minuteRow("Tipo de plan", planDescription(state.model)) +
          minuteRow("Anticipo informado", state.model.advance) +
          minuteRow("Cuota informada", state.model.installment) +
          minuteRow("Valor final del plan", formatMoney(data.agreedPrice)) +
          minuteRow("Débito automático", data.automaticDebit ? "Sí" : "No") +
          minuteRow("Asesor", state.seller.name + " · " + state.seller.code) +
        '</div></section>' +
        '<section class="minute-print-section"><h2>Carácter provisorio</h2><ol class="minute-terms">' +
          '<li>El presente datero registra información provisoria para que Supervisión evalúe la operación. No constituye una minuta definitiva, solicitud de adhesión, aprobación financiera, adjudicación ni obligación de entrega.</li>' +
          '<li>La operación queda sujeta a validación documental y crediticia, vigencia de la campaña, disponibilidad del modelo y aceptación de las condiciones definitivas por las partes intervinientes.</li>' +
          '<li>Este datero no registra ni acredita pagos, reservas o cancelaciones. Esos datos sólo se incorporarán en la minuta definitiva luego de la aprobación de Supervisión.</li>' +
          '<li>Cuando se entregue un vehículo usado, su valor será determinado al momento de la tasación y peritaje, sujeto a la presentación de la documentación requerida.</li>' +
          '<li>Únicamente se considerarán los beneficios y bonificaciones vigentes al momento de formalizar la operación.</li>' +
        '</ol></section>' +
        '<div class="minute-signatures"><div>Firma del cliente</div><div>Aclaración y DNI</div><div>Asesor responsable</div></div>' +
        '<footer class="minute-footer">Datero provisorio emitido desde el portal interno de Grupo Sur Automotores · Versión GS-DATERO-PROVISORIO-2026-01</footer>' +
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

  function buildPrequalificationPrint() {
    var benefits = (state.model.benefits || []).join(" · ") || "Sin beneficios adicionales informados";
    minutePrint.innerHTML = '' +
      '<article class="prequalification-print-sheet" data-brand-theme="' + escapeHtml(brandTheme(state.brand)) + '">' +
        '<header class="prequalification-print-header"><div><img src="../assets/logo-header.webp" alt="Grupo Sur Automotores"><span>Constancia comercial preliminar</span></div><div><strong>' + escapeHtml(state.requestId) + '</strong><span>Emitida ' + escapeHtml(new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date())) + '</span></div></header>' +
        '<section class="prequalification-print-hero"><div class="prequalification-print-image"><img src="' + escapeHtml(state.model.image) + '" alt="' + escapeHtml(state.brand + " " + vehicleTitle(state.model)) + '"></div><div><span>Precalificación aprobada</span><p>' + escapeHtml(state.brand + " · " + planDescription(state.model)) + '</p><h1>' + escapeHtml(vehicleTitle(state.model)) + '</h1><strong>Vigente hasta ' + escapeHtml(new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(state.validUntil)) + '</strong></div></section>' +
        '<div class="prequalification-print-columns"><section><h2>Cliente</h2><dl>' +
          '<div><dt>Nombre y apellido</dt><dd>' + escapeHtml(state.client.fullName) + '</dd></div>' +
          '<div><dt>CUIL</dt><dd>' + escapeHtml(maskCuil(state.client.cuil)) + '</dd></div>' +
          '<div><dt>Teléfono</dt><dd>' + escapeHtml(state.client.phone) + '</dd></div>' +
          '<div><dt>Correo</dt><dd>' + escapeHtml(state.client.email) + '</dd></div>' +
        '</dl></section><section><h2>Condición preliminar</h2><dl>' +
          '<div><dt>Plan</dt><dd>' + escapeHtml(planDescription(state.model)) + '</dd></div>' +
          '<div><dt>Versión</dt><dd>' + escapeHtml(vehicleVersion(state.model)) + '</dd></div>' +
          '<div><dt>Anticipo estimado</dt><dd>' + escapeHtml(state.model.advance) + '</dd></div>' +
          '<div><dt>Cuota estimada</dt><dd>' + escapeHtml(state.model.installment) + '</dd></div>' +
          '<div><dt>Disponibilidad</dt><dd>' + escapeHtml(state.model.availability) + '</dd></div>' +
        '</dl></section></div>' +
        '<section class="prequalification-print-benefits"><div><span>Bonificación informada</span><strong>' + escapeHtml(state.model.bonus || "Sin bonificación informada") + '</strong></div><div><span>Beneficios</span><strong>' + escapeHtml(benefits) + '</strong></div></section>' +
        '<section class="prequalification-print-advisor"><div><span>Asesor responsable</span><strong>' + escapeHtml(state.seller.name) + '</strong></div><div><span>Código</span><strong>' + escapeHtml(state.seller.code) + '</strong></div><div><span>Contacto</span><strong>' + escapeHtml(state.seller.phone) + '</strong></div></section>' +
        '<section class="prequalification-print-legal"><strong>Información importante</strong><p>Resultado comercial preliminar y no vinculante. No constituye una aprobación financiera definitiva, adjudicación ni compromiso de entrega. Sujeto a validación documental, análisis crediticio, disponibilidad, vigencia de campaña y aceptación de las condiciones definitivas.</p></section>' +
        '<footer>Documento emitido desde el portal interno de Grupo Sur Automotores</footer>' +
      '</article>';
    minutePrint.setAttribute("aria-hidden", "false");
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
          '<span class="history-status' + (item.application ? ' has-minute' : '') + '">' + (item.application ? 'Datero enviado' : 'Aprobada') + '</span>' +
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
        await supabaseClient.auth.signOut({ scope: "local" });
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
    await supabaseClient.auth.signOut({ scope: "local" });
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

  document.getElementById("offerOptions").addEventListener("click", function (event) {
    var button = event.target.closest("[data-offer-index]");
    if (button) {
      selectOffer(Number(button.dataset.offerIndex));
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
      state.modelGroup = null;
      state.model = null;
      setView("brand");
    } else if (action === "back-to-models") {
      state.modelGroup = null;
      state.model = null;
      renderModels();
      setView("model");
    } else if (action === "back-to-offers") {
      state.model = null;
      renderOffers();
      setView("offer");
    } else if (action === "back-to-result") {
      if (state.applicationContext && state.applicationContext.origin === "crm_lead") {
        if (window.grupoSurCRM && typeof window.grupoSurCRM.open === "function") {
          window.grupoSurCRM.open("agenda");
        } else {
          setView("crmAgenda");
        }
        if (window.grupoSurCRM && typeof window.grupoSurCRM.openLead === "function") {
          window.grupoSurCRM.openLead(state.applicationContext.leadId);
        }
      } else {
        setView("result");
      }
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

  applicationButton.addEventListener("click", function () {
    openCommercialApplication({ origin: "prequalification" });
  });

  applicationForm.elements.birthDate.addEventListener("input", function () {
    maskDateInput(this);
  });

  applicationForm.elements.cuil.addEventListener("input", function () {
    this.value = formatCuilInput(this.value);
  });

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
    applicationSubmitButton.textContent = "Enviando a supervisión…";
    try {
      response = await saveCommercialApplication(data);
      if (response.error) {
        throw response.error;
      }
      var saleFunction = state.applicationContext && state.applicationContext.origin === "crm_lead"
        ? "submit_crm_lead_sale"
        : "submit_prequalification_sale";
      var saleResponse = await supabaseClient.rpc(saleFunction, {
        p_application_id: response.data.id,
        p_notes: state.applicationContext && state.applicationContext.origin === "crm_lead"
          ? "Operación originada en el Lead " + state.applicationContext.leadId
          : "Operación originada en la precalificación " + state.requestId
      });
      if (saleResponse.error) {
        throw saleResponse.error;
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
      applicationSubmitButton.textContent = "Datero enviado";
      printMinute();
    } catch (saveError) {
      applicationError.textContent = saveError.message || "No se pudo enviar el datero a Supervisión.";
      applicationSubmitButton.textContent = "Guardar y enviar a supervisión";
    } finally {
      applicationSubmitButton.disabled = false;
    }
  });

  document.getElementById("printButton").addEventListener("click", function () {
    buildPrequalificationPrint();
    printMinute();
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
      if (state.brand && !state.modelGroup) {
        renderModels();
      } else if (state.modelGroup && !state.model) {
        var refreshedBrand = BRANDS[state.brand];
        var refreshedModel = refreshedBrand && refreshedBrand.models.find(function (model) {
          return model.id === state.modelGroup.id;
        });
        if (refreshedModel) {
          state.modelGroup = refreshedModel;
        }
        renderOffers();
      }
    } catch (error) {
      return;
    }
  });

  window.grupoSurCommercialApplication = {
    open: openCommercialApplication,
    getCatalog: async function (options) {
      if (options && options.refresh) {
        await loadCentralCampaigns();
      }
      return buildCommercialCatalog();
    },
    validateCampaign: function (campaignId) {
      return commercialCampaignError(resolveCommercialCampaign(campaignId));
    }
  };

  formatCurrentDate();
  renderHistory();

  if (!supabaseClient) {
    showLogin();
    loginError.textContent = "No se pudo conectar con el servicio de acceso.";
  } else {
    supabaseClient.auth.getUser().then(async function (response) {
      if (!response.data || !response.data.user) {
        showLogin();
        return;
      }
      var seller = await getSellerProfile();
      if (!seller) {
        await supabaseClient.auth.signOut({ scope: "local" });
        showLogin();
        return;
      }
      try {
        await loadCentralCampaigns();
        showPortal(seller);
      } catch (error) {
        await supabaseClient.auth.signOut({ scope: "local" });
        showLogin();
        loginError.textContent = "No se pudieron cargar las campañas. Intentá nuevamente.";
      }
    });
    document.getElementById("sellerCode").focus();
  }
}());
