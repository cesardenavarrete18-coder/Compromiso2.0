(function () {
  "use strict";

  var supabaseClient;
  var reloadClients;
  var dialog;
  var form;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function setBusy(button, busy) {
    if (busy) { button.dataset.label = button.textContent; button.textContent = "Guardando…"; button.disabled = true; }
    else { button.textContent = button.dataset.label || "Agregar a cartera"; button.disabled = false; }
  }
  function setMessage(value, error) {
    var element = document.getElementById("completedClientMessage");
    element.textContent = value || "";
    element.classList.toggle("error", !!error);
  }
  function optional(value) { var clean = String(value || "").trim(); return clean || null; }
  function numberOrNull(value) { return value === "" || value == null ? null : Number(value); }

  async function loadSellers() {
    var result = await supabaseClient.from("profiles").select("user_id,full_name,seller_code").eq("role", "seller").eq("active", true).order("full_name");
    if (result.error) throw result.error;
    form.elements.seller_user_id.innerHTML = '<option value="">Seleccionar vendedor</option>' + (result.data || []).map(function (seller) {
      return '<option value="' + escapeHtml(seller.user_id) + '">' + escapeHtml(seller.full_name) + ' · ' + escapeHtml(seller.seller_code) + '</option>';
    }).join("");
  }

  async function open() {
    try { await loadSellers(); }
    catch (error) { document.getElementById("clientActionMessage").textContent = error.message; return; }
    form.reset();
    form.elements.installments_paid.value = "1";
    form.elements.installments_to_pay.value = "83";
    form.elements.sale_date.value = new Date().toISOString().slice(0, 10);
    setMessage("");
    dialog.showModal();
  }

  function validatePaymentPair(dateName, amountName, label) {
    var hasDate = !!form.elements[dateName].value;
    var hasAmount = form.elements[amountName].value !== "";
    if (hasDate !== hasAmount) { setMessage("Completá la fecha y el importe del " + label + ".", true); return false; }
    return true;
  }

  async function save(event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!validatePaymentPair("first_payment_date", "first_payment_amount", "primer pago") || !validatePaymentPair("second_payment_date", "second_payment_amount", "segundo pago")) return;
    var button = document.getElementById("saveCompletedClientButton");
    var data = Object.fromEntries(new FormData(form).entries());
    var payload = {
      seller_user_id: data.seller_user_id,
      sale_date: data.sale_date,
      admin_notes: optional(data.admin_notes),
      first_name: data.first_name.trim(), last_name: data.last_name.trim(),
      document_type: data.document_type, document_number: data.document_number.replace(/\D/g, ""), cuil: data.cuil.replace(/\D/g, ""), birth_date: data.birth_date,
      address: data.address.trim(), city_province: data.city_province.trim(), postal_code: data.postal_code.trim(), marital_status: data.marital_status,
      spouse_name: optional(data.spouse_name), spouse_document: optional(data.spouse_document) && data.spouse_document.replace(/\D/g, ""),
      primary_phone: data.primary_phone.trim(), alternate_phone: optional(data.alternate_phone), email: data.email.trim().toLowerCase(), contact_schedule: data.contact_schedule.trim(),
      employment_status: data.employment_status.trim(), employer_name: data.employer_name.trim(), employment_seniority: data.employment_seniority.trim(), monthly_income: Number(data.monthly_income),
      brand_name: data.brand_name, model_name: data.model_name.trim(), campaign_name: data.campaign_name.trim(), plan_type: data.plan_type.trim(), agreed_price: Number(data.agreed_price),
      installments_paid: Number(data.installments_paid), installments_to_pay: Number(data.installments_to_pay), automatic_debit: form.elements.automatic_debit.checked, deferred_installment: form.elements.deferred_installment.checked,
      first_payment_date: optional(data.first_payment_date), first_payment_amount: numberOrNull(data.first_payment_amount), second_payment_date: optional(data.second_payment_date), second_payment_amount: numberOrNull(data.second_payment_amount)
    };
    setMessage(""); setBusy(button, true);
    var result = await supabaseClient.rpc("create_completed_client_from_admin", { p_data: payload });
    if (result.error) { setMessage(result.error.message, true); setBusy(button, false); return; }
    await reloadClients();
    dialog.close(); form.reset(); setBusy(button, false);
    document.getElementById("clientActionMessage").textContent = "Cliente finalizado agregado correctamente a la cartera.";
  }

  function init(client, reload) {
    supabaseClient = client; reloadClients = reload; dialog = document.getElementById("completedClientDialog"); form = document.getElementById("completedClientForm");
    document.getElementById("completedClientButton").addEventListener("click", open);
    document.querySelectorAll("[data-close-completed-client]").forEach(function (button) { button.addEventListener("click", function () { dialog.close(); }); });
    form.addEventListener("submit", save);
  }

  window.grupoSurCompletedClient = { init: init };
}());
