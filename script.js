(function () {
  "use strict";

  var config = window.LEAD_CAPTURE_CONFIG || {};
  var webhookUrl = String(config.LEAD_WEBHOOK_URL || "").trim();
  var whatsappNumber = String(config.WHATSAPP_FALLBACK_NUMBER || "").replace(/\D/g, "");
  var form = document.getElementById("homeLeadForm");
  var message = document.getElementById("homeFormMessage");
  var success = document.getElementById("homeFormSuccess");
  var postLeadWhatsapp = document.getElementById("homePostLeadWhatsapp");
  var floatingWhatsapp = document.getElementById("homeFloatingWhatsapp");

  var modelsByBrand = {
    Volkswagen: ["Amarok", "Tera", "Taos", "Nivus", "T-Cross"],
    Peugeot: ["Partner", "208", "2008"],
    Fiat: ["Cronos", "Titano", "Mobi"]
  };

  function track() {
    if (typeof window.fbq === "function") {
      window.fbq.apply(window, arguments);
    }
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function buildWhatsAppUrl(text) {
    if (!whatsappNumber) {
      return "#";
    }
    return "https://wa.me/" + whatsappNumber + "?text=" + encodeURIComponent(text);
  }

  function configureWhatsappLink(link, source, text) {
    if (!link) {
      return;
    }
    if (!whatsappNumber) {
      link.hidden = true;
      return;
    }
    link.href = buildWhatsAppUrl(text);
    link.addEventListener("click", function () {
      track("trackCustom", "WhatsAppClick", {
        content_name: "Home Compromiso Mi 0km",
        content_category: "Home",
        content_type: "vehicle",
        source: source,
        value: 1,
        currency: "ARS"
      });
    });
  }

  configureWhatsappLink(
    floatingWhatsapp,
    "home_floating_whatsapp",
    "Hola, quiero conocer las propuestas disponibles para un 0km."
  );

  function updateModels() {
    var brand = form.elements.brand.value;
    var modelSelect = form.elements.model;
    modelSelect.innerHTML = "";
    (modelsByBrand[brand] || []).forEach(function (model) {
      var option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      modelSelect.appendChild(option);
    });
  }

  function normalizeName(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function validateLead(data) {
    var blockedNames = /^(john doe|jane doe|test|prueba|nn|n\/n|asdf|qwerty|nombre|sin nombre)$/i;
    var phoneDigits = data.phone.replace(/\D/g, "");

    if (data.name.length < 2 || blockedNames.test(data.name)) {
      return "Ingresá tu nombre real para poder contactarte.";
    }

    if (
      phoneDigits.length < 8 ||
      phoneDigits.length > 15 ||
      phoneDigits === whatsappNumber ||
      /^(\d)\1+$/.test(phoneDigits) ||
      phoneDigits === "12345678" ||
      phoneDigits === "1123456789"
    ) {
      return "Ingresá un WhatsApp válido para enviarte la propuesta.";
    }

    return "";
  }

  function collectUtm() {
    var params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get("utm_source") || "",
      utm_campaign: params.get("utm_campaign") || "",
      utm_content: params.get("utm_content") || "",
      utm_medium: params.get("utm_medium") || ""
    };
  }

  function createLead() {
    var now = new Date();
    var utm = collectUtm();
    return {
      name: normalizeName(form.elements.name.value),
      phone: String(form.elements.phone.value || "").trim(),
      brand: form.elements.brand.value,
      model: form.elements.model.value,
      purchaseIntent: form.elements.purchaseIntent.value,
      source: "home_form",
      url: window.location.href,
      utm_source: utm.utm_source,
      utm_campaign: utm.utm_campaign,
      utm_content: utm.utm_content,
      utm_medium: utm.utm_medium,
      userAgent: navigator.userAgent,
      date: now.toISOString(),
      fecha: now.toISOString()
    };
  }

  function showError(text) {
    message.textContent = text;
    message.classList.remove("is-success");
  }

  function setSubmitting(isSubmitting) {
    var button = form.querySelector('button[type="submit"]');
    button.disabled = isSubmitting;
    button.textContent = isSubmitting ? "Enviando..." : "Solicitar propuesta";
  }

  var contactTracked = false;
  form.addEventListener("focusin", function () {
    if (contactTracked) {
      return;
    }
    contactTracked = true;
    track("track", "Contact", {
      content_name: "Formulario Home",
      content_category: "Home",
      content_type: "vehicle",
      source: "home_form_start"
    });
  });

  form.elements.brand.addEventListener("change", updateModels);
  updateModels();

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    showError("");

    var lead = createLead();
    var validationError = validateLead(lead);
    if (validationError) {
      showError(validationError);
      return;
    }

    if (!webhookUrl) {
      console.error("Home lead capture: LEAD_WEBHOOK_URL no está configurado.", lead);
      showError("No pudimos enviar tu consulta. Intentá nuevamente en unos minutos.");
      return;
    }

    setSubmitting(true);

    try {
      var response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(lead)
      });
      var result = await response.json();

      if (!response.ok || result.ok !== true) {
        throw new Error("Apps Script no confirmó ok:true");
      }

      var leadEventId = "lead_home_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
      var contentName = lead.brand + " " + lead.model;

      track("track", "Lead", {
        content_name: contentName,
        content_category: lead.brand,
        content_type: "vehicle",
        content_ids: [slugify(contentName)],
        lead_source: "google_sheets_home_form"
      }, {
        eventID: leadEventId
      });

      configureWhatsappLink(
        postLeadWhatsapp,
        "home_post_lead_whatsapp",
        "Hola, ya envié mis datos y quiero consultar por " + contentName + "."
      );

      form.hidden = true;
      success.hidden = false;
    } catch (error) {
      console.error("Home lead capture: error al enviar el lead.", error, lead);
      showError("No pudimos enviar tu consulta. Revisá tu conexión e intentá nuevamente.");
    } finally {
      setSubmitting(false);
    }
  });
}());
