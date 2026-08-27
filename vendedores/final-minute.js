(function () {
  "use strict";

  var BRAND_LOGOS = {
    Volkswagen: "/assets/brand-logo-vw-flat.png",
    Peugeot: "/assets/brand-logo-peugeot-flat.png",
    Fiat: "/assets/brand-logo-fiat-flat.png"
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function one(value) {
    return Array.isArray(value) ? value[0] : value;
  }

  function numeric(value) {
    return value === null || value === undefined || value === "" ? null : Number(value);
  }

  function money(value) {
    var amount = numeric(value);
    if (amount === null || !Number.isFinite(amount)) return "A confirmar";
    return "$ " + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(amount);
  }

  function installmentMoney(value, isFrom) {
    var formatted = money(value);
    return formatted === "A confirmar" ? formatted : (isFrom ? "Desde " : "") + formatted;
  }

  function parseDisplayDate(value) {
    var match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || "").trim());
    var parsed;
    if (!match) return "";
    parsed = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    if (parsed.getFullYear() !== Number(match[3]) || parsed.getMonth() !== Number(match[2]) - 1 || parsed.getDate() !== Number(match[1])) return "";
    return match[3] + "-" + match[2] + "-" + match[1];
  }

  function displayDateInput(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").slice(0, 10));
    return match ? match[3] + "/" + match[2] + "/" + match[1] : "";
  }

  function formatDate(value) {
    var iso = String(value || "").slice(0, 10);
    return displayDateInput(iso) || "No informado";
  }

  function formatDateTime(value) {
    var date = value instanceof Date ? value : new Date(value || Date.now());
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires"
    }).format(date);
  }

  function maskDateInput(field) {
    var clean = String(field.value || "").replace(/\D/g, "").slice(0, 8);
    field.value = [clean.slice(0, 2), clean.slice(2, 4), clean.slice(4, 8)].filter(Boolean).join("/");
  }

  function formatCuil(value) {
    var clean = String(value || "").replace(/\D/g, "");
    return clean.length === 11 ? clean.slice(0, 2) + "-" + clean.slice(2, 10) + "-" + clean.slice(10) : String(value || "");
  }

  function normalizeCampaign(row) {
    var model = one(row && row.model) || {};
    var brand = one(model.brand) || {};
    var count = numeric(row && row.installment_count);
    var version = [row && row.version_name, row && row.transmission].filter(Boolean).join(" ");
    var planName = String(row && row.plan_name || "").trim();
    return {
      id: row && row.id || "",
      updatedAt: row && row.updated_at || "",
      active: row && row.active !== false,
      validFrom: row && row.valid_from || "",
      validTo: row && row.valid_to || "",
      brand: String(brand.name || "").trim(),
      model: String(model.name || "").trim(),
      version: version,
      versionName: String(row && row.version_name || "").trim(),
      transmission: String(row && row.transmission || "").trim(),
      planName: planName,
      planDescription: planName + (count ? " · " + count + " cuotas" : ""),
      installmentCount: count,
      finalPrice: numeric(row && row.final_price),
      advanceAmount: numeric(row && row.advance_amount),
      installmentAmount: numeric(row && row.installment_amount),
      installmentIsFrom: row && row.installment_is_from !== false,
      bonus: String(row && row.bonus || "").trim(),
      benefits: row && row.benefits || [],
      image: String(model.image_path || "").trim()
    };
  }

  function campaignFingerprint(campaign) {
    return JSON.stringify({
      id: campaign.id,
      updatedAt: campaign.updatedAt,
      brand: campaign.brand,
      model: campaign.model,
      version: campaign.version,
      planName: campaign.planName,
      installmentCount: campaign.installmentCount,
      finalPrice: campaign.finalPrice,
      advanceAmount: campaign.advanceAmount,
      installmentAmount: campaign.installmentAmount,
      installmentIsFrom: campaign.installmentIsFrom,
      bonus: campaign.bonus,
      benefits: campaign.benefits,
      image: campaign.image
    });
  }

  function commercialSnapshot(campaign, context) {
    context = context || {};
    return {
      source: "final_sales_minute",
      campaign_id: campaign.id,
      campaign_read_at: new Date().toISOString(),
      campaign_updated_at: campaign.updatedAt,
      brand: campaign.brand,
      model: campaign.model,
      version: campaign.versionName,
      transmission: campaign.transmission,
      plan_name: campaign.planName,
      plan_description: campaign.planDescription,
      installment_count: campaign.installmentCount,
      total_installments: campaign.installmentCount,
      final_price: campaign.finalPrice,
      advance_amount: campaign.advanceAmount,
      installment_amount: campaign.installmentAmount,
      installment_is_from: campaign.installmentIsFrom,
      bonus: campaign.bonus,
      benefits: campaign.benefits,
      image: campaign.image,
      case_code: context.caseCode || "",
      prequalification_code: context.prequalificationCode || "",
      seller_name: context.sellerName || "",
      seller_code: context.sellerCode || "",
      seller_phone: context.sellerPhone || ""
    };
  }

  function fromApplication(application, options) {
    var snapshot = application.commercial_snapshot || {};
    var seller = options && options.seller || {};
    var prequalificationCode = snapshot.prequalification_code || "";
    var caseCode = options && options.caseCode || snapshot.case_code || application.request_code;
    var version = [snapshot.version, snapshot.transmission].filter(Boolean).join(" ") || "No informada";
    var planDescription = snapshot.plan_description || application.plan_type || application.campaign_name;
    var minuteCode = prequalificationCode ? "MIN-" + prequalificationCode.replace(/^GS-/, "") : application.request_code;
    return {
      minuteCode: minuteCode,
      issueDate: application.submitted_at || application.confirmed_at || application.created_at || new Date().toISOString(),
      referenceLabel: prequalificationCode ? "Precalificación" : "Operación",
      referenceCode: prequalificationCode || caseCode,
      approvalLabel: prequalificationCode ? "Precalificación aprobada" : "Venta aprobada por Supervisión",
      brand: snapshot.brand || application.brand_name,
      model: snapshot.model || application.model_name,
      version: version,
      planDescription: planDescription,
      advance: snapshot.advance_amount == null ? (snapshot.advance || "A confirmar") : money(snapshot.advance_amount),
      installment: snapshot.installment_amount == null ? (snapshot.installment || "A confirmar") : installmentMoney(snapshot.installment_amount, snapshot.installment_is_from !== false),
      finalPrice: snapshot.final_price == null ? application.agreed_price : snapshot.final_price,
      bonus: snapshot.bonus || "No informada",
      image: snapshot.image || "",
      sellerName: snapshot.seller_name || snapshot.sellerName || seller.full_name || "No informado",
      sellerCode: snapshot.seller_code || snapshot.sellerCode || seller.seller_code || "",
      firstName: application.first_name,
      lastName: application.last_name,
      documentType: application.document_type,
      documentNumber: application.document_number,
      cuil: application.cuil,
      birthDate: application.birth_date,
      address: application.address,
      cityProvince: application.city_province,
      postalCode: application.postal_code,
      maritalStatus: application.marital_status,
      spouseName: application.spouse_name,
      spouseDocument: application.spouse_document,
      primaryPhone: application.primary_phone,
      alternatePhone: application.alternate_phone,
      email: application.email,
      contactSchedule: application.contact_schedule,
      employmentStatus: application.employment_status,
      employerName: application.employer_name,
      employmentSeniority: application.employment_seniority,
      monthlyIncome: application.monthly_income,
      automaticDebit: application.automatic_debit,
      deferredInstallment: application.deferred_installment,
      installmentsPaid: application.installments_paid,
      installmentsToPay: application.installments_to_pay,
      firstPaymentDate: application.first_payment_date,
      firstPaymentAmount: application.first_payment_amount,
      secondPaymentDate: application.second_payment_date,
      secondPaymentAmount: application.second_payment_amount
    };
  }

  function minuteValue(value) {
    return escapeHtml(value === null || value === undefined || value === "" ? "No informado" : value);
  }

  function minuteRow(label, value) {
    return '<div><span>' + escapeHtml(label) + '</span><strong>' + minuteValue(value) + '</strong></div>';
  }

  function buildHtml(data) {
    var spouse = data.spouseName ? data.spouseName + (data.spouseDocument ? " · DNI " + data.spouseDocument : "") : "No corresponde";
    var vehicleVersion = [data.model, data.version].filter(Boolean).join(" ");
    var seller = [data.sellerName, data.sellerCode].filter(Boolean).join(" · ");
    return '' +
      '<article class="minute-sheet" data-brand-theme="' + escapeHtml(String(data.brand || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")) + '">' +
        '<header class="minute-header">' +
          '<div class="minute-header-brand"><img class="minute-company-logo" src="/assets/logo-header.webp" alt="Grupo Sur Automotores"><div class="minute-brand-lockup"><img class="minute-brand-logo" src="' + escapeHtml(BRAND_LOGOS[data.brand] || "/assets/logo-header.webp") + '" alt="Logo ' + escapeHtml(data.brand) + '"><span>Solicitud comercial · ' + escapeHtml(vehicleVersion) + '</span></div></div>' +
          '<div class="minute-identifiers"><strong>' + escapeHtml(data.minuteCode) + '</strong><span>Fecha: ' + escapeHtml(formatDateTime(data.issueDate)) + '</span><span>' + escapeHtml(data.referenceLabel) + ': ' + escapeHtml(data.referenceCode) + '</span></div>' +
        '</header>' +
        '<section class="minute-vehicle">' +
          '<div class="minute-vehicle-image"><img src="' + escapeHtml(data.image) + '" alt="' + escapeHtml(data.brand + " " + vehicleVersion) + '"></div>' +
          '<div class="minute-vehicle-copy"><span>Vehículo evaluado</span><h1>' + escapeHtml(data.brand + " " + vehicleVersion) + '</h1><p>' + escapeHtml(data.planDescription) + '</p><strong>' + escapeHtml(data.approvalLabel) + '</strong></div>' +
        '</section>' +
        '<section class="minute-print-section"><h2>Datos del cliente</h2><div class="minute-data-grid">' +
          minuteRow("Nombre y apellido", data.firstName + " " + data.lastName) +
          minuteRow(data.documentType, data.documentNumber) +
          minuteRow("CUIL", formatCuil(data.cuil)) +
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
          minuteRow("Antigüedad", /año/.test(String(data.employmentSeniority)) ? data.employmentSeniority : data.employmentSeniority + (Number(data.employmentSeniority) === 1 ? " año" : " años")) +
          minuteRow("Ingresos mensuales", money(data.monthlyIncome)) +
        '</div></section>' +
        '<section class="minute-print-section"><h2>Condiciones comerciales</h2><div class="minute-data-grid three-columns">' +
          minuteRow("Marca", data.brand) +
          minuteRow("Modelo", data.model) +
          minuteRow("Versión", data.version) +
          minuteRow("Tipo de plan", data.planDescription) +
          minuteRow("Anticipo informado", data.advance) +
          minuteRow("Cuota informada", data.installment) +
          minuteRow("Precio pactado", money(data.finalPrice)) +
          minuteRow("Cuotas abonadas", String(data.installmentsPaid)) +
          minuteRow("Cuotas a pagar", String(data.installmentsToPay)) +
          minuteRow("Débito automático", data.automaticDebit ? "Sí" : "No") +
          minuteRow("Cuota diferida", data.deferredInstallment ? "Sí" : "No") +
          minuteRow("Asesor", seller) +
          minuteRow("Primer pago", data.firstPaymentDate ? formatDate(data.firstPaymentDate) + " · " + money(data.firstPaymentAmount) : "No informado") +
          minuteRow("Segundo pago", data.secondPaymentDate ? formatDate(data.secondPaymentDate) + " · " + money(data.secondPaymentAmount) : "No informado") +
          minuteRow("Bonificación", data.bonus) +
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
  }

  function print(container, data) {
    container.innerHTML = buildHtml(data);
    container.setAttribute("aria-hidden", "false");
    document.body.classList.add("printing-minute");
    Promise.all(Array.prototype.slice.call(container.querySelectorAll("img")).map(function (image) {
      if (image.complete) return Promise.resolve();
      return new Promise(function (resolve) {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    })).then(function () { window.setTimeout(function () { window.print(); }, 80); });
  }

  window.grupoSurFinalMinute = {
    buildHtml: buildHtml,
    campaignFingerprint: campaignFingerprint,
    commercialSnapshot: commercialSnapshot,
    displayDateInput: displayDateInput,
    formatDate: formatDate,
    fromApplication: fromApplication,
    maskDateInput: maskDateInput,
    normalizeCampaign: normalizeCampaign,
    parseDisplayDate: parseDisplayDate,
    print: print
  };
}());
