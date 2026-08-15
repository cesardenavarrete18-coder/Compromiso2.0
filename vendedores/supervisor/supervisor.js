(function () {
  "use strict";

  var supabaseClient = window.grupoSurSupabaseClient;
  var state = { profile: null, sellers: [], settings: {}, leads: [], sales: [], activeSale: null, filter: "pending_supervisor", search: "" };
  var loginView = document.getElementById("loginView");
  var appView = document.getElementById("appView");
  var loginForm = document.getElementById("loginForm");
  var loginMessage = document.getElementById("loginMessage");
  var pageMessage = document.getElementById("pageMessage");

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char];
    });
  }

  function initials(value) {
    return String(value || "SU").split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0); }).join("").toUpperCase();
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  function money(value) {
    if (value == null || value === "") return "Importe no informado";
    return "$" + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Number(value));
  }

  function localDateKey(value) {
    var date = new Date(value);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? label : button.dataset.label;
  }

  async function getManagementProfile() {
    var userResult = await supabaseClient.auth.getUser();
    var user = userResult.data && userResult.data.user;
    if (!user || userResult.error) return null;
    var result = await supabaseClient.from("profiles").select("user_id, full_name, role, active").eq("user_id", user.id).single();
    if (result.error || !result.data || !["supervisor", "admin"].includes(result.data.role) || !result.data.active) return null;
    return result.data;
  }

  async function loadData(silent) {
    if (!silent) pageMessage.textContent = "Actualizando información…";
    var results = await Promise.all([
      supabaseClient.from("profiles").select("user_id, full_name, seller_code, active").eq("role", "seller").order("full_name"),
      supabaseClient.from("seller_routing_settings").select("seller_user_id, daily_quota, paused"),
      supabaseClient.from("leads").select("id, customer_phone, customer_name, source_channel, source_detail, seller_code_received, qualification_status, priority, intent_summary, model_interest, routing_status, routing_reason, assigned_seller_user_id, assigned_at, last_message_at, created_at, crm:lead_crm(status, priority, next_contact_at, sale_confirmation_status)").order("last_message_at", { ascending: false }).limit(500),
      supabaseClient.from("lead_sale_requests").select("id, lead_id, seller_user_id, vehicle, sale_amount, notes, status, requested_at, seller:profiles!lead_sale_requests_seller_user_id_fkey(full_name, seller_code), lead:leads(customer_name, customer_phone, intent_summary)").eq("status", "pending").order("requested_at")
    ]);
    var failed = results.find(function (item) { return item.error; });
    if (failed) throw failed.error;
    state.sellers = results[0].data || [];
    state.settings = {};
    (results[1].data || []).forEach(function (item) { state.settings[item.seller_user_id] = item; });
    state.leads = results[2].data || [];
    state.sales = results[3].data || [];
    renderAll();
    pageMessage.textContent = "";
  }

  function sellerById(id) {
    return state.sellers.find(function (seller) { return seller.user_id === id; });
  }

  function renderStats() {
    var today = localDateKey(new Date());
    document.getElementById("pendingStat").textContent = state.leads.filter(function (lead) { return lead.routing_status === "pending_supervisor"; }).length;
    document.getElementById("directStat").textContent = state.leads.filter(function (lead) { return lead.routing_status === "assigned_direct" && lead.assigned_at && localDateKey(lead.assigned_at) === today; }).length;
    document.getElementById("assignedStat").textContent = state.leads.filter(function (lead) { return lead.assigned_seller_user_id && lead.assigned_at && localDateKey(lead.assigned_at) === today; }).length;
    document.getElementById("unqualifiedStat").textContent = state.leads.filter(function (lead) { return lead.qualification_status === "unqualified"; }).length;
    document.getElementById("pendingSalesStat").textContent = state.sales.length;
  }

  function assignedToday(sellerId) {
    var today = localDateKey(new Date());
    return state.leads.filter(function (lead) { return lead.assigned_seller_user_id === sellerId && lead.assigned_at && localDateKey(lead.assigned_at) === today; }).length;
  }

  function renderTeam() {
    document.getElementById("teamCount").textContent = state.sellers.length === 1 ? "1 vendedor" : state.sellers.length + " vendedores";
    document.getElementById("teamGrid").innerHTML = state.sellers.map(function (seller) {
      var settings = state.settings[seller.user_id] || { daily_quota: 20, paused: false };
      var current = assignedToday(seller.user_id);
      return '<article class="team-card" data-seller-id="' + seller.user_id + '">' +
        '<span class="team-avatar">' + escapeHtml(initials(seller.full_name)) + '</span>' +
        '<div class="team-copy"><strong>' + escapeHtml(seller.full_name) + '</strong><small>' + escapeHtml(seller.seller_code) + ' · ' + current + '/' + settings.daily_quota + ' hoy</small></div>' +
        '<div class="team-controls"><label class="quota">Cupo <input data-quota type="number" min="0" max="500" value="' + settings.daily_quota + '"></label><button class="pause' + (settings.paused ? " paused" : "") + '" data-pause type="button">' + (settings.paused ? "Reanudar" : "Pausar") + '</button></div>' +
      '</article>';
    }).join("");
  }

  function filteredLeads() {
    var query = state.search.toLocaleLowerCase("es-AR");
    return state.leads.filter(function (lead) {
      var matchesFilter = state.filter === "all" || lead.routing_status === state.filter;
      var haystack = [lead.customer_name, lead.customer_phone, lead.intent_summary, lead.model_interest, lead.seller_code_received].join(" ").toLocaleLowerCase("es-AR");
      return matchesFilter && (!query || haystack.includes(query));
    });
  }

  function sellerOptions(selectedId) {
    return '<option value="">Seleccionar vendedor</option>' + state.sellers.filter(function (seller) { return seller.active; }).map(function (seller) {
      var settings = state.settings[seller.user_id] || { daily_quota: 20, paused: false };
      return '<option value="' + seller.user_id + '"' + (seller.user_id === selectedId ? " selected" : "") + (settings.paused ? " disabled" : "") + '>' + escapeHtml(seller.full_name + " · " + assignedToday(seller.user_id) + "/" + settings.daily_quota + (settings.paused ? " · pausado" : "")) + '</option>';
    }).join("");
  }

  function routingLabel(lead) {
    if (lead.routing_status === "assigned_direct") return "Código válido";
    if (lead.routing_status === "assigned_manual") return "Asignación manual";
    if (lead.routing_reason === "invalid_seller_code") return "Código no válido";
    if (lead.routing_reason === "daily_quota_reached") return "Cupo alcanzado";
    if (lead.routing_reason === "seller_paused") return "Vendedor pausado";
    return "Bandeja general";
  }

  function renderLeads() {
    var labels = {
      pending_supervisor: ["Leads pendientes", "La IA ya resumió la intención; elegí a quién asignar cada oportunidad."],
      assigned_direct: ["Derivaciones directas", "Ingresaron con un código válido y fueron notificadas al supervisor."],
      assigned_manual: ["Asignaciones manuales", "Oportunidades distribuidas desde esta bandeja."],
      all: ["Todos los leads", "Vista completa del flujo comercial recibido por WhatsApp."]
    };
    document.getElementById("listTitle").textContent = labels[state.filter][0];
    document.getElementById("listSubtitle").textContent = labels[state.filter][1];
    var leads = filteredLeads();
    document.getElementById("leadList").innerHTML = leads.map(function (lead) {
      var assigned = sellerById(lead.assigned_seller_user_id);
      var crm = Array.isArray(lead.crm) ? lead.crm[0] : lead.crm;
      return '<article class="lead-card" data-lead-id="' + lead.id + '">' +
        '<div class="lead-person"><strong>' + escapeHtml(lead.customer_name || "Cliente sin nombre") + '</strong><span>+' + escapeHtml(lead.customer_phone) + ' · ' + escapeHtml(formatDate(lead.last_message_at)) + '</span><span>' + escapeHtml(lead.source_channel === "tiktok" ? "TikTok / código " + (lead.seller_code_received || "—") : "WhatsApp general") + '</span></div>' +
        '<div class="lead-summary"><p>' + escapeHtml(lead.intent_summary || "Pendiente de resumen") + '</p><div class="badges"><span class="badge ' + escapeHtml(lead.qualification_status) + '">' + escapeHtml(lead.qualification_status === "qualified" ? "Calificado" : lead.qualification_status === "unqualified" ? "No calificado" : "Seguimiento") + '</span><span class="badge ' + escapeHtml((crm && crm.priority) || lead.priority) + '">' + escapeHtml((crm && crm.priority) === "high" || lead.priority === "high" ? "Prioridad alta" : "Prioridad normal") + '</span><span class="badge">' + escapeHtml(crm && crm.status ? crm.status.replace(/_/g, " ") : "nuevo") + '</span><span class="badge">' + escapeHtml(routingLabel(lead)) + '</span></div></div>' +
        '<div class="assignment"><select data-seller-select aria-label="Asignar vendedor">' + sellerOptions(lead.assigned_seller_user_id) + '</select><button class="button primary" data-assign type="button">' + (assigned ? "Reasignar" : "Asignar") + '</button></div>' +
        '<button class="details" data-details type="button">Ver chat</button>' +
      '</article>';
    }).join("");
    document.getElementById("emptyState").hidden = leads.length > 0;
  }

  function renderSales() {
    document.getElementById("salesCount").textContent = state.sales.length === 1 ? "1 pendiente" : state.sales.length + " pendientes";
    document.getElementById("salesList").innerHTML = state.sales.length ? state.sales.map(function (sale) {
      var seller = Array.isArray(sale.seller) ? sale.seller[0] : sale.seller;
      var lead = Array.isArray(sale.lead) ? sale.lead[0] : sale.lead;
      return '<article class="sale-row" data-sale-id="' + sale.id + '"><div><strong>' + escapeHtml(lead && lead.customer_name || "Cliente sin nombre") + '</strong><small>+' + escapeHtml(lead && lead.customer_phone || "") + ' · ' + escapeHtml(formatDate(sale.requested_at)) + '</small></div><div><strong>' + escapeHtml(sale.vehicle) + '</strong><span>' + escapeHtml(sale.notes || lead && lead.intent_summary || "Sin observaciones") + '</span></div><div><span class="sale-amount">' + escapeHtml(money(sale.sale_amount)) + '</span><small>' + escapeHtml(seller && seller.full_name || "Vendedor") + ' · ' + escapeHtml(seller && seller.seller_code || "") + '</small></div><button class="button primary" data-review-sale type="button">Revisar</button></article>';
    }).join("") : '<div class="sales-empty">No hay ventas pendientes de confirmación.</div>';
  }

  async function renderRanking() {
    var month = document.getElementById("rankingMonth").value;
    var result = await supabaseClient.rpc("get_sales_ranking", { p_month: month ? month + "-01" : null });
    document.getElementById("supervisorRanking").innerHTML = result.error || !result.data.length ? '<div class="sales-empty">Todavía no hay datos para este mes.</div>' : result.data.map(function (item, index) {
      return '<article class="rank-card"><span class="rank-place">' + (index + 1) + '</span><div><strong>' + escapeHtml(item.seller_name) + '</strong><small>' + escapeHtml(item.seller_code) + ' · ' + item.assigned_leads + ' leads</small></div><div class="rank-result"><b>' + item.confirmed_sales + '</b><small>' + escapeHtml(item.conversion_rate) + '% conversión</small></div></article>';
    }).join("");
  }

  function renderAll() {
    renderStats();
    renderTeam();
    renderLeads();
    renderSales();
    renderRanking();
    document.getElementById("manualSellerSelect").innerHTML = '<option value="">Bandeja general</option>' + state.sellers.filter(function (seller) { return seller.active; }).map(function (seller) { return '<option value="' + seller.user_id + '">' + escapeHtml(seller.full_name + " · " + seller.seller_code) + '</option>'; }).join("");
  }

  async function enterApp() {
    var profile = await getManagementProfile();
    if (!profile) {
      await supabaseClient.auth.signOut({ scope: "local" });
      throw new Error("Esta cuenta no tiene permisos de supervisor o administrador.");
    }
    state.profile = profile;
    document.getElementById("profileName").textContent = profile.full_name;
    document.getElementById("avatar").textContent = initials(profile.full_name);
    loginView.hidden = true;
    appView.hidden = false;
    await loadData(false);
  }

  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    loginMessage.textContent = "";
    var button = loginForm.querySelector('button[type="submit"]');
    setBusy(button, true, "Ingresando…");
    try {
      var result = await supabaseClient.auth.signInWithPassword({ email: loginForm.elements.email.value.trim().toLowerCase(), password: loginForm.elements.password.value });
      if (result.error) throw result.error;
      await enterApp();
    } catch (error) {
      loginMessage.textContent = error.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : error.message;
    } finally {
      setBusy(button, false);
    }
  });

  document.getElementById("logoutButton").addEventListener("click", async function () {
    await supabaseClient.auth.signOut({ scope: "local" });
    state.profile = null;
    appView.hidden = true;
    loginView.hidden = false;
  });

  document.querySelector(".sidebar nav").addEventListener("click", function (event) {
    var button = event.target.closest("[data-filter]");
    if (!button) return;
    state.filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach(function (item) { item.classList.toggle("active", item === button); });
    renderLeads();
  });

  document.getElementById("searchInput").addEventListener("input", function () { state.search = this.value.trim(); renderLeads(); });
  document.getElementById("refreshButton").addEventListener("click", async function () {
    setBusy(this, true, "Actualizando…");
    try { await loadData(false); } catch (error) { pageMessage.textContent = error.message; pageMessage.classList.add("error"); }
    finally { setBusy(this, false); }
  });

  document.getElementById("teamGrid").addEventListener("change", async function (event) {
    if (!event.target.matches("[data-quota]")) return;
    var card = event.target.closest("[data-seller-id]");
    var quota = Number(event.target.value);
    if (!Number.isInteger(quota) || quota < 0 || quota > 500) return;
    var current = state.settings[card.dataset.sellerId] || { paused: false };
    var result = await supabaseClient.from("seller_routing_settings").upsert({ seller_user_id: card.dataset.sellerId, daily_quota: quota, paused: current.paused, updated_by: state.profile.user_id });
    if (result.error) pageMessage.textContent = "No se pudo actualizar el cupo."; else await loadData(true);
  });

  document.getElementById("teamGrid").addEventListener("click", async function (event) {
    var button = event.target.closest("[data-pause]");
    if (!button) return;
    var card = button.closest("[data-seller-id]");
    var current = state.settings[card.dataset.sellerId] || { daily_quota: 20, paused: false };
    setBusy(button, true, "Guardando…");
    var result = await supabaseClient.from("seller_routing_settings").upsert({ seller_user_id: card.dataset.sellerId, daily_quota: current.daily_quota, paused: !current.paused, updated_by: state.profile.user_id });
    if (result.error) { pageMessage.textContent = "No se pudo cambiar el estado de derivación."; setBusy(button, false); } else await loadData(true);
  });

  document.getElementById("leadList").addEventListener("click", async function (event) {
    var card = event.target.closest("[data-lead-id]");
    if (!card) return;
    var lead = state.leads.find(function (item) { return item.id === card.dataset.leadId; });
    if (event.target.closest("[data-assign]")) {
      var button = event.target.closest("[data-assign]");
      var sellerId = card.querySelector("[data-seller-select]").value;
      if (!sellerId) { pageMessage.textContent = "Elegí un vendedor antes de asignar."; return; }
      setBusy(button, true, "Asignando…");
      var update = await supabaseClient.rpc("assign_lead_to_seller", { p_lead_id: lead.id, p_seller_user_id: sellerId });
      if (!update.error) {
        await loadData(true);
      } else {
        pageMessage.textContent = "No se pudo asignar el lead.";
        setBusy(button, false);
      }
      return;
    }
    if (event.target.closest("[data-details]")) {
      document.getElementById("dialogLeadName").textContent = lead.customer_name || "+" + lead.customer_phone;
      document.getElementById("dialogLeadSummary").textContent = lead.intent_summary || "Sin resumen disponible.";
      document.getElementById("conversation").innerHTML = '<div class="message-bubble">Cargando conversación…</div>';
      document.getElementById("leadDialog").showModal();
      var messages = await supabaseClient.from("lead_messages").select("direction, body, created_at").eq("lead_id", lead.id).order("created_at");
      document.getElementById("conversation").innerHTML = messages.error || !messages.data.length
        ? '<div class="message-bubble">Todavía no hay mensajes disponibles.</div>'
        : messages.data.map(function (message) { return '<div class="message-bubble ' + escapeHtml(message.direction) + '">' + escapeHtml(message.body || "Mensaje sin texto") + '<small>' + escapeHtml(formatDate(message.created_at)) + '</small></div>'; }).join("");
    }
  });

  document.getElementById("manualLeadButton").addEventListener("click", function () {
    document.getElementById("manualLeadForm").reset();
    document.getElementById("manualLeadMessage").textContent = "";
    document.getElementById("manualLeadDialog").showModal();
  });

  document.getElementById("manualLeadSubmit").addEventListener("click", async function () {
    var form = document.getElementById("manualLeadForm");
    var message = document.getElementById("manualLeadMessage");
    var name = form.elements.customerName.value.trim();
    var phone = form.elements.customerPhone.value.trim();
    message.textContent = "";
    if (name.length < 2 || phone.length < 6) { message.textContent = "Completá el nombre y el teléfono del cliente."; return; }
    setBusy(this, true, "Guardando…");
    var result = await supabaseClient.rpc("create_manual_lead", {
      p_customer_name: name,
      p_customer_phone: phone,
      p_source_detail: form.elements.sourceDetail.value.trim(),
      p_model_interest: form.elements.modelInterest.value.trim(),
      p_intent_summary: form.elements.summary.value.trim(),
      p_priority: form.elements.priority.value,
      p_seller_user_id: form.elements.sellerId.value || null,
      p_next_contact_at: form.elements.nextContactAt.value ? new Date(form.elements.nextContactAt.value).toISOString() : null
    });
    if (result.error) { message.textContent = result.error.message; setBusy(this, false); return; }
    document.getElementById("manualLeadDialog").close();
    await loadData(true);
    pageMessage.textContent = "Lead cargado correctamente.";
    setBusy(this, false);
  });

  document.getElementById("salesList").addEventListener("click", function (event) {
    var button = event.target.closest("[data-review-sale]");
    if (!button) return;
    var row = button.closest("[data-sale-id]");
    var sale = state.sales.find(function (item) { return item.id === row.dataset.saleId; });
    if (!sale) return;
    state.activeSale = sale;
    var seller = Array.isArray(sale.seller) ? sale.seller[0] : sale.seller;
    var lead = Array.isArray(sale.lead) ? sale.lead[0] : sale.lead;
    document.getElementById("saleReviewTitle").textContent = "Venta de " + (lead && lead.customer_name || "cliente");
    document.getElementById("saleReviewSummary").innerHTML = '<strong>' + escapeHtml(sale.vehicle) + ' · ' + escapeHtml(money(sale.sale_amount)) + '</strong><span>Informada por ' + escapeHtml(seller && seller.full_name || "Vendedor") + ' el ' + escapeHtml(formatDate(sale.requested_at)) + '</span><span>' + escapeHtml(sale.notes || "Sin observaciones") + '</span>';
    document.getElementById("saleReviewNote").value = "";
    document.getElementById("saleReviewMessage").textContent = "";
    document.getElementById("saleReviewDialog").showModal();
  });

  async function reviewSale(approved, button) {
    if (!state.activeSale) return;
    var message = document.getElementById("saleReviewMessage");
    var note = document.getElementById("saleReviewNote").value.trim();
    message.textContent = "";
    if (!approved && note.length < 3) { message.textContent = "Indicá el motivo del rechazo para orientar al vendedor."; return; }
    setBusy(button, true, approved ? "Confirmando…" : "Rechazando…");
    var result = await supabaseClient.rpc("review_lead_sale", { p_request_id: state.activeSale.id, p_approved: approved, p_review_note: note });
    if (result.error) { message.textContent = result.error.message; setBusy(button, false); return; }
    document.getElementById("saleReviewDialog").close();
    state.activeSale = null;
    await loadData(true);
    pageMessage.textContent = approved ? "Venta confirmada y sumada al ranking." : "La venta fue observada y volvió a Cierre.";
    setBusy(button, false);
  }

  document.getElementById("saleApproveButton").addEventListener("click", function () { reviewSale(true, this); });
  document.getElementById("saleRejectButton").addEventListener("click", function () { reviewSale(false, this); });
  document.getElementById("rankingMonth").addEventListener("change", renderRanking);

  var rankingNow = new Date();
  document.getElementById("rankingMonth").value = rankingNow.getFullYear() + "-" + String(rankingNow.getMonth() + 1).padStart(2, "0");

  if (!supabaseClient) { loginMessage.textContent = "No se pudo conectar con Supabase."; return; }
  supabaseClient.auth.getUser().then(function (result) {
    if (result.data && result.data.user) enterApp().catch(function (error) { loginView.hidden = false; appView.hidden = true; loginMessage.textContent = error.message; });
  });
  window.setInterval(function () { if (state.profile) loadData(true).catch(function () {}); }, 30000);
}());
