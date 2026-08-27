(function () {
  "use strict";

  var finalMinute = window.grupoSurFinalMinute;
  var mounted = null;

  function dialogHtml() {
    return '<dialog class="crm-dialog" id="finalMinuteDialog" data-final-minute-dialog>' +
      '<form class="crm-dialog-shell application-form" id="finalMinuteForm" data-final-minute-form novalidate>' +
        '<button class="crm-dialog-close" type="button" aria-label="Cerrar">×</button>' +
        '<p class="eyebrow dark">Minuta de venta / Solicitud comercial</p>' +
        '<h2 data-final-minute-title>Completar minuta</h2>' +
        '<p>Los datos disponibles ya están precargados. Revisá y completá la información definitiva junto al cliente.</p>' +
        '<section class="application-section"><div class="application-section-heading"><span>01</span><div><h3>Datos del cliente</h3><p>Identificación y domicilio declarado.</p></div></div><div class="application-grid">' +
          '<label class="field-group"><span>Nombre</span><input class="text-input" name="firstName" required></label>' +
          '<label class="field-group"><span>Apellido</span><input class="text-input" name="lastName" required></label>' +
          '<label class="field-group"><span>Tipo de documento</span><select class="text-input" name="documentType" required><option value="DNI">DNI</option><option value="LC">LC</option><option value="LE">LE</option><option value="Pasaporte">Pasaporte</option></select></label>' +
          '<label class="field-group"><span>Número de documento</span><input class="text-input" name="documentNumber" inputmode="numeric" maxlength="12" required></label>' +
          '<label class="field-group"><span>CUIL</span><input class="text-input" name="cuil" inputmode="numeric" maxlength="13" required></label>' +
          '<label class="field-group"><span>Fecha de nacimiento</span><input class="text-input" name="birthDate" type="text" inputmode="numeric" maxlength="10" placeholder="dd/mm/yyyy" autocomplete="off" required></label>' +
          '<label class="field-group field-wide"><span>Domicilio</span><input class="text-input" name="address" required></label>' +
          '<label class="field-group"><span>Localidad / Provincia</span><input class="text-input" name="cityProvince" required></label>' +
          '<label class="field-group"><span>Código postal</span><input class="text-input" name="postalCode" maxlength="10" required></label>' +
          '<label class="field-group"><span>Estado civil</span><select class="text-input" name="maritalStatus" required><option value="">Seleccionar</option><option>Soltero/a</option><option>Casado/a</option><option>Conviviente</option><option>Divorciado/a</option><option>Viudo/a</option></select></label>' +
          '<label class="field-group"><span>Nombre del cónyuge</span><input class="text-input" name="spouseName"></label>' +
          '<label class="field-group"><span>DNI del cónyuge</span><input class="text-input" name="spouseDocument" inputmode="numeric" maxlength="12"></label>' +
        '</div></section>' +
        '<div class="application-columns">' +
          '<section class="application-section"><div class="application-section-heading"><span>02</span><div><h3>Contacto</h3><p>Canales y horario preferido.</p></div></div><div class="application-grid one-column">' +
            '<label class="field-group"><span>Teléfono particular</span><input class="text-input" name="primaryPhone" required></label>' +
            '<label class="field-group"><span>Teléfono alternativo</span><input class="text-input" name="alternatePhone"></label>' +
            '<label class="field-group"><span>Correo electrónico</span><input class="text-input" name="email" type="email" required></label>' +
            '<label class="field-group"><span>Forma y horario de contacto</span><input class="text-input" name="contactSchedule" required></label>' +
          '</div></section>' +
          '<section class="application-section"><div class="application-section-heading"><span>03</span><div><h3>Datos laborales</h3><p>Situación declarada por el cliente.</p></div></div><div class="application-grid one-column">' +
            '<label class="field-group"><span>Condición laboral</span><select class="text-input" name="employmentStatus" required><option value="">Seleccionar</option><option>Relación de dependencia</option><option>Monotributista / autónomo</option><option>Jubilado/a o pensionado/a</option><option>Actividad informal</option><option>Otro</option></select></label>' +
            '<label class="field-group"><span>Empresa / actividad</span><input class="text-input" name="employerName" required></label>' +
            '<label class="field-group"><span>Antigüedad laboral</span><span class="input-affix input-affix-suffix"><input class="text-input" name="employmentSeniority" type="number" min="0" max="80" step="1" required><span>años</span></span></label>' +
            '<label class="field-group"><span>Sueldo / ingresos mensuales</span><span class="input-affix input-affix-prefix"><span>$</span><input class="text-input" name="monthlyIncome" type="number" min="1" step="1" required></span></label>' +
          '</div></section>' +
        '</div>' +
        '<section class="application-section"><div class="application-section-heading"><span>04</span><div><h3>Condiciones comerciales vigentes</h3><p>Estos campos se consultan en la ficha actual del plan y no pueden editarse desde la minuta.</p></div></div>' +
          '<div class="application-vehicle-summary"><strong data-final-minute-vehicle></strong><span data-final-minute-campaign></span></div>' +
          '<div class="application-grid commercial-grid">' +
            '<label class="field-group"><span>Marca</span><input class="text-input" name="brandName" readonly required></label>' +
            '<label class="field-group"><span>Modelo</span><input class="text-input" name="modelName" readonly required></label>' +
            '<label class="field-group"><span>Versión</span><input class="text-input" name="versionName" readonly required></label>' +
            '<label class="field-group"><span>Tipo de plan</span><input class="text-input" name="planType" readonly required></label>' +
            '<label class="field-group"><span>Total del plan</span><input class="text-input" name="totalInstallments" readonly required></label>' +
            '<label class="field-group"><span>Valor final del plan</span><input class="text-input" name="agreedPrice" readonly required></label>' +
            '<label class="field-group"><span>Anticipo informado</span><input class="text-input" name="advanceAmount" readonly required></label>' +
            '<label class="field-group"><span>Cuota informada</span><input class="text-input" name="installmentAmount" readonly required></label>' +
            '<label class="field-group field-wide"><span>Bonificación</span><input class="text-input" name="bonus" readonly required></label>' +
            '<label class="field-group"><span>Débito automático</span><select class="text-input" name="automaticDebit" required><option value="">Seleccionar</option><option value="true">Sí</option><option value="false">No</option></select></label>' +
            '<label class="field-group"><span>Cuota diferida</span><select class="text-input" name="deferredInstallment" required><option value="">Seleccionar</option><option value="true">Sí</option><option value="false">No</option></select></label>' +
            '<label class="field-group"><span>Cuotas abonadas</span><input class="text-input" name="installmentsPaid" type="number" value="1" readonly required></label>' +
            '<label class="field-group"><span>Cuotas a pagar</span><input class="text-input" name="installmentsToPay" type="number" readonly required></label>' +
            '<label class="field-group"><span>Fecha del primer pago</span><input class="text-input" name="firstPaymentDate" type="text" inputmode="numeric" maxlength="10" placeholder="dd/mm/yyyy" autocomplete="off"></label>' +
            '<label class="field-group"><span>Importe del primer pago</span><input class="text-input" name="firstPaymentAmount" type="number" min="0" step="1"></label>' +
            '<label class="field-group"><span>Fecha del segundo pago</span><input class="text-input" name="secondPaymentDate" type="text" inputmode="numeric" maxlength="10" placeholder="dd/mm/yyyy" autocomplete="off"></label>' +
            '<label class="field-group"><span>Importe del segundo pago</span><input class="text-input" name="secondPaymentAmount" type="number" min="0" step="1"></label>' +
          '</div></section>' +
        '<label class="consent-box application-consent"><input name="applicationConsent" type="checkbox" required><span><strong>Confirmación conjunta</strong>El vendedor leyó la información junto al cliente y ambas partes confirman los datos y las condiciones vigentes antes de emitir la Minuta Definitiva.</span></label>' +
        '<p class="form-error" data-final-minute-error role="alert" aria-live="polite"></p>' +
        '<button class="primary-button" data-final-minute-submit type="submit" disabled>Guardar y generar PDF</button>' +
      '</form></dialog>';
  }

  function digits(value) { return String(value || "").replace(/\D/g, ""); }

  function validCuil(value) {
    var clean = digits(value);
    if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;
    var weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    var sum = weights.reduce(function (total, weight, index) { return total + Number(clean[index]) * weight; }, 0);
    var check = 11 - sum % 11;
    if (check === 11) check = 0;
    if (check === 10) check = 9;
    return check === Number(clean[10]);
  }

  function setField(form, name, value) {
    var field = form.elements[name];
    if (field && value !== null && value !== undefined) field.value = String(value);
  }

  function fillApplication(form, application) {
    if (!application) return;
    var seniority = parseInt(String(application.employment_seniority || "").replace(/\D/g, ""), 10);
    [["firstName", application.first_name], ["lastName", application.last_name], ["documentType", application.document_type], ["documentNumber", application.document_number], ["cuil", application.cuil], ["birthDate", finalMinute.displayDateInput(application.birth_date)], ["address", application.address], ["cityProvince", application.city_province], ["postalCode", application.postal_code], ["maritalStatus", application.marital_status], ["spouseName", application.spouse_name], ["spouseDocument", application.spouse_document], ["primaryPhone", application.primary_phone], ["alternatePhone", application.alternate_phone], ["email", application.email], ["contactSchedule", application.contact_schedule], ["employmentStatus", application.employment_status], ["employerName", application.employer_name], ["employmentSeniority", Number.isFinite(seniority) ? seniority : ""], ["monthlyIncome", application.monthly_income], ["automaticDebit", String(Boolean(application.automatic_debit))], ["deferredInstallment", String(Boolean(application.deferred_installment))], ["firstPaymentDate", finalMinute.displayDateInput(application.first_payment_date)], ["firstPaymentAmount", application.first_payment_amount], ["secondPaymentDate", finalMinute.displayDateInput(application.second_payment_date)], ["secondPaymentAmount", application.second_payment_amount]].forEach(function (item) { setField(form, item[0], item[1]); });
  }

  var adapters = {
    prequalification: function (context) { return context.currentApplication || context.provisionalApplication || null; },
    sales: function (context) { return context.currentApplication || context.application || null; }
  };

  function campaignMoney(value, isFrom) {
    if (value === null || value === undefined || value === "") return "A confirmar";
    var label = "$" + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Number(value));
    return isFrom ? "Desde " + label : label;
  }

  function read(form) {
    var f = form.elements;
    var birthDate = finalMinute.parseDisplayDate(f.birthDate.value);
    var firstDate = f.firstPaymentDate.value ? finalMinute.parseDisplayDate(f.firstPaymentDate.value) : "";
    var secondDate = f.secondPaymentDate.value ? finalMinute.parseDisplayDate(f.secondPaymentDate.value) : "";
    var documentNumber = digits(f.documentNumber.value);
    var cuil = digits(f.cuil.value);
    var spouseDocument = digits(f.spouseDocument.value);
    var email = f.email.value.trim().toLowerCase();
    var seniority = Number(f.employmentSeniority.value);
    var income = Number(f.monthlyIncome.value);
    var firstAmount = f.firstPaymentAmount.value === "" ? null : Number(f.firstPaymentAmount.value);
    var secondAmount = f.secondPaymentAmount.value === "" ? null : Number(f.secondPaymentAmount.value);
    if (f.firstName.value.trim().length < 2 || f.lastName.value.trim().length < 2) return { error: "Completá el nombre y el apellido del cliente." };
    if (!f.documentType.value || documentNumber.length < 7 || documentNumber.length > 12 || !validCuil(cuil)) return { error: "Revisá el tipo y número de documento y el CUIL informado." };
    if (!birthDate) return { error: "Ingresá una fecha de nacimiento real con formato dd/mm/aaaa." };
    var adultDate = new Date(); adultDate.setFullYear(adultDate.getFullYear() - 18);
    if (new Date(birthDate + "T12:00:00") > adultDate) return { error: "La minuta debe corresponder a una persona mayor de 18 años." };
    if (f.address.value.trim().length < 5 || f.cityProvince.value.trim().length < 3 || f.postalCode.value.trim().length < 3 || !f.maritalStatus.value) return { error: "Completá el domicilio, localidad/provincia, código postal y estado civil." };
    if (["Casado/a", "Conviviente"].includes(f.maritalStatus.value) && (f.spouseName.value.trim().length < 3 || spouseDocument.length < 7)) return { error: "Completá el nombre y DNI del cónyuge o conviviente." };
    if (digits(f.primaryPhone.value).length < 8 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || f.contactSchedule.value.trim().length < 3) return { error: "Revisá el teléfono, el correo y el horario de contacto." };
    if (!f.employmentStatus.value || f.employerName.value.trim().length < 2 || !Number.isInteger(seniority) || seniority < 0 || seniority > 80 || !Number.isInteger(income) || income < 1) return { error: "Revisá la situación laboral, antigüedad e ingresos mensuales." };
    if (f.automaticDebit.value === "" || f.deferredInstallment.value === "") return { error: "Indicá si corresponde débito automático y cuota diferida." };
    if ((f.firstPaymentDate.value && !firstDate) || (f.secondPaymentDate.value && !secondDate)) return { error: "Las fechas de pago deben ser reales y tener formato dd/mm/aaaa." };
    if (Boolean(firstDate) !== (firstAmount !== null) || Boolean(secondDate) !== (secondAmount !== null)) return { error: "Cada pago informado debe tener fecha e importe." };
    if ((firstAmount !== null && (!Number.isFinite(firstAmount) || firstAmount < 0)) || (secondAmount !== null && (!Number.isFinite(secondAmount) || secondAmount < 0))) return { error: "Los importes de pago deben ser números válidos mayores o iguales a cero." };
    if (!f.applicationConsent.checked) return { error: "Confirmá la lectura conjunta de la minuta y de las condiciones vigentes." };
    return { data: { firstName: f.firstName.value.trim(), lastName: f.lastName.value.trim(), documentType: f.documentType.value, documentNumber: documentNumber, cuil: cuil, birthDate: birthDate, address: f.address.value.trim(), cityProvince: f.cityProvince.value.trim(), postalCode: f.postalCode.value.trim().toUpperCase(), maritalStatus: f.maritalStatus.value, spouseName: f.spouseName.value.trim(), spouseDocument: spouseDocument, primaryPhone: f.primaryPhone.value.trim(), alternatePhone: f.alternatePhone.value.trim(), email: email, contactSchedule: f.contactSchedule.value.trim(), employmentStatus: f.employmentStatus.value, employerName: f.employerName.value.trim(), employmentSeniority: seniority, monthlyIncome: income, automaticDebit: f.automaticDebit.value === "true", deferredInstallment: f.deferredInstallment.value === "true", firstPaymentDate: firstDate || null, firstPaymentAmount: firstAmount, secondPaymentDate: secondDate || null, secondPaymentAmount: secondAmount } };
  }

  function mount() {
    if (mounted) return mounted;
    document.body.insertAdjacentHTML("beforeend", dialogHtml());
    var dialog = document.querySelector("[data-final-minute-dialog]");
    var form = dialog.querySelector("[data-final-minute-form]");
    var error = form.querySelector("[data-final-minute-error]");
    var submit = form.querySelector("[data-final-minute-submit]");
    ["birthDate", "firstPaymentDate", "secondPaymentDate"].forEach(function (name) { form.elements[name].addEventListener("input", function () { finalMinute.maskDateInput(this); }); });
    form.querySelector(".crm-dialog-close").addEventListener("click", function () { dialog.close(); });
    mounted = {
      dialog: dialog,
      form: form,
      error: error,
      submit: submit,
      open: function (context) {
        var adapter = adapters[context.origin];
        if (!adapter) throw new Error("El origen de la Minuta Definitiva no es válido.");
        form.reset();
        form.dataset.minuteOrigin = context.origin;
        fillApplication(form, adapter(context));
        form.elements.applicationConsent.checked = false;
        form.querySelector("[data-final-minute-title]").textContent = context.title || "Completar minuta";
        error.textContent = "";
        submit.disabled = true;
        dialog.showModal();
      },
      applyCampaign: function (campaign) {
        setField(form, "brandName", campaign.brand); setField(form, "modelName", campaign.model); setField(form, "versionName", campaign.version); setField(form, "planType", campaign.planDescription); setField(form, "totalInstallments", campaign.installmentCount); setField(form, "agreedPrice", campaignMoney(campaign.finalPrice, false)); setField(form, "advanceAmount", campaignMoney(campaign.advanceAmount, false)); setField(form, "installmentAmount", campaignMoney(campaign.installmentAmount, campaign.installmentIsFrom)); setField(form, "bonus", campaign.bonus); setField(form, "installmentsPaid", 1); setField(form, "installmentsToPay", campaign.installmentCount - 1);
        form.querySelector("[data-final-minute-vehicle]").textContent = [campaign.brand, campaign.model, campaign.version].filter(Boolean).join(" ");
        form.querySelector("[data-final-minute-campaign]").textContent = campaign.planDescription + " · Valor final vigente " + campaignMoney(campaign.finalPrice, false);
      },
      read: function () { return read(form); },
      setLoading: function (message) { error.textContent = message || ""; submit.disabled = true; },
      setReady: function () { error.textContent = ""; submit.disabled = false; },
      requireConfirmation: function (message) { form.elements.applicationConsent.checked = false; error.textContent = message; submit.disabled = false; },
      close: function () { if (dialog.open) dialog.close(); }
    };
    return mounted;
  }

  window.grupoSurFinalMinuteForm = { adapters: adapters, mount: mount };
}());
