(function () {
  "use strict";

  var supabaseClient = window.grupoSurSupabaseClient;
  var state = { profile: null, sellers: [], settings: {}, leads: [], filter: "pending_supervisor", search: "" };
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
      supabaseClient.from("leads").select("id, customer_phone, customer_name, source_channel, source_detail, seller_code_received, qualification_status, priority, intent_summary, model_interest, routing_status, routing_reason, assigned_seller_user_id, assigned_at, last_message_at, created_at").order("last_message_at", { ascending: false }).limit(500)
    ]);
    var failed = results.find(function (item) { return item.error; });
    if (failed) throw failed.error;
    state.sellers = results[0].data || [];
    state.settings = {};
    (results[1].data || []).forEach(function (item) { state.settings[item.seller_user_id] = item; });
    state.leads = results[2].data || [];
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
      return '<article class="lead-card" data-lead-id="' + lead.id + '">' +
        '<div class="lead-person"><strong>' + escapeHtml(lead.customer_name || "Cliente sin nombre") + '</strong><span>+' + escapeHtml(lead.customer_phone) + ' · ' + escapeHtml(formatDate(lead.last_message_at)) + '</span><span>' + escapeHtml(lead.source_channel === "tiktok" ? "TikTok / código " + (lead.seller_code_received || "—") : "WhatsApp general") + '</span></div>' +
        '<div class="lead-summary"><p>' + escapeHtml(lead.intent_summary || "Pendiente de resumen") + '</p><div class="badges"><span class="badge ' + escapeHtml(lead.qualification_status) + '">' + escapeHtml(lead.qualification_status === "qualified" ? "Calificado" : lead.qualification_status === "unqualified" ? "No calificado" : "Seguimiento") + '</span><span class="badge ' + escapeHtml(lead.priority) + '">' + escapeHtml(lead.priority === "high" ? "Prioridad alta" : "Prioridad normal") + '</span><span class="badge">' + escapeHtml(routingLabel(lead)) + '</span></div></div>' +
        '<div class="assignment"><select data-seller-select aria-label="Asignar vendedor">' + sellerOptions(lead.assigned_seller_user_id) + '</select><button class="button primary" data-assign type="button">' + (assigned ? "Reasignar" : "Asignar") + '</button></div>' +
        '<button class="details" data-details type="button">Ver chat</button>' +
      '</article>';
    }).join("");
    document.getElementById("emptyState").hidden = leads.length > 0;
  }

  function renderAll() {
    renderStats();
    renderTeam();
    renderLeads();
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
      var previousSellerId = lead.assigned_seller_user_id;
      var update = await supabaseClient.from("leads").update({ assigned_seller_user_id: sellerId, assigned_by_user_id: state.profile.user_id, assigned_at: new Date().toISOString(), routing_status: "assigned_manual", routing_reason: previousSellerId ? "supervisor_reassignment" : "supervisor_assignment" }).eq("id", lead.id);
      if (!update.error) {
        await supabaseClient.from("lead_assignments").insert({ lead_id: lead.id, seller_user_id: sellerId, assigned_by_user_id: state.profile.user_id, assignment_type: previousSellerId ? "reassigned" : "manual", reason: previousSellerId ? "Reasignado por supervisor" : "Asignado por supervisor" });
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

  if (!supabaseClient) { loginMessage.textContent = "No se pudo conectar con Supabase."; return; }
  supabaseClient.auth.getUser().then(function (result) {
    if (result.data && result.data.user) enterApp().catch(function (error) { loginView.hidden = false; appView.hidden = true; loginMessage.textContent = error.message; });
  });
  window.setInterval(function () { if (state.profile) loadData(true).catch(function () {}); }, 30000);
}());
