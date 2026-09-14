(function () {
  "use strict";

  var supabaseClient = window.grupoSurSupabaseClient;
  if (!supabaseClient) return;

  var loading = false;
  var protocolByLead = {};
  var performanceBySeller = {};

  function localDateKey(value) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(value || new Date());
  }

  function monthStartKey() {
    return localDateKey(new Date()).slice(0, 7) + "-01";
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function percent(value) {
    return value == null ? "—" : Number(value).toFixed(1).replace(".0", "") + "%";
  }

  function actionLabel(row) {
    if (!row) return "Sin próxima acción";
    if (row.next_task_channel === "call") return "Llamada " + Number(row.next_task_call_attempt || row.protocol_current_call_attempt || 0);
    if (row.next_task_channel === "whatsapp") return "WhatsApp " + Number(row.next_task_message_step || 0);
    return row.next_task_id ? "Tarea de seguimiento" : "Sin próxima acción";
  }

  function protocolSituation(row, now) {
    if (!row || row.protocol_status !== "active" || !row.next_task_due_start) return null;
    var start = new Date(row.next_task_due_start).getTime();
    var end = row.next_task_due_end ? new Date(row.next_task_due_end).getTime() : start;
    var current = now || Date.now();
    if (end <= current) return { key: "overdue", label: "VENCIDA" };
    if (localDateKey(new Date(start)) === localDateKey(new Date(current))) return { key: "today", label: "HOY" };
    if (start > current) return { key: "upcoming", label: "PRÓXIMA" };
    return { key: "today", label: "HOY" };
  }

  function protocolProgressLabel(row) {
    if (!row || row.protocol_status !== "active") return "";
    var total = Number(row.protocol_call_total || 18);
    var attempt = Number(row.protocol_current_call_attempt || Math.min(total, Number(row.protocol_call_completed || 0) + 1));
    var parts = ["EN PROTOCOLO", "llamada " + attempt + "/" + total];
    if (row.protocol_current_day) parts.push("día " + row.protocol_current_day);
    if (row.protocol_current_band) parts.push(row.protocol_current_band);
    return parts.join(" · ");
  }

  function patchPortfolioRows() {
    document.querySelectorAll("[data-portfolio-lead]").forEach(function (rowElement) {
      var row = protocolByLead[rowElement.dataset.portfolioLead];
      if (!row || row.operational_status !== "no_contesta" || row.protocol_status !== "active") return;

      var situation = protocolSituation(row);
      var situationCell = rowElement.children[5];
      var actionCell = rowElement.children[6];
      var dateCell = rowElement.children[7];
      if (!situationCell || !actionCell || !dateCell) return;

      var status = situationCell.querySelector(".followup-status");
      if (status && situation) {
        ["unmanaged", "overdue", "today", "upcoming", "unscheduled", "completed"].forEach(function (key) {
          status.classList.remove(key);
          rowElement.classList.remove("followup-" + key);
        });
        status.classList.add(situation.key);
        rowElement.classList.add("followup-" + situation.key);
        status.textContent = situation.label;
      }

      var completedBadge = situationCell.querySelector(".followup-secondary");
      if (!row.completed_today && completedBadge) completedBadge.remove();
      if (row.completed_today && !completedBadge) {
        completedBadge = document.createElement("span");
        completedBadge.className = "followup-secondary";
        completedBadge.textContent = "COMPLETADA HOY";
        situationCell.appendChild(completedBadge);
      }

      var skippedToday = Number(row.protocol_call_skipped_today || 0);
      var missed = situationCell.querySelector("[data-protocol-missed-today]");
      if (!skippedToday && missed) missed.remove();
      if (skippedToday) {
        if (!missed) {
          missed = document.createElement("small");
          missed.dataset.protocolMissedToday = "true";
          missed.className = "protocol-missed-label";
          situationCell.appendChild(missed);
        }
        missed.textContent = skippedToday + (skippedToday === 1 ? " intento omitido hoy" : " intentos omitidos hoy");
      }

      var progress = situationCell.querySelector("[data-protocol-progress]");
      if (progress) {
        progress.textContent = protocolProgressLabel(row);
        progress.classList.remove("is-overdue");
      }

      var actionStrong = actionCell.querySelector("strong");
      if (actionStrong) actionStrong.textContent = actionLabel(row);
      var actionSource = actionCell.querySelector(".action-source");
      if (row.next_task_id) {
        if (!actionSource) {
          actionSource = document.createElement("small");
          actionSource.className = "action-source protocol_recommendation";
          actionCell.appendChild(actionSource);
        }
        actionSource.textContent = "RECOMENDADO";
      } else if (actionSource) {
        actionSource.remove();
      }

      var dateStrong = dateCell.querySelector("strong");
      if (dateStrong) dateStrong.textContent = row.next_task_due_start ? formatDate(row.next_task_due_start) : "Sin programar";
      var overdueAge = dateCell.querySelector(".overdue-age");
      if (overdueAge) overdueAge.remove();
    });
  }

  function patchSellerCards() {
    var rows = Object.keys(protocolByLead).map(function (leadId) { return protocolByLead[leadId]; });
    document.querySelectorAll("[data-portfolio-seller]").forEach(function (card) {
      var sellerId = card.dataset.portfolioSeller;
      var perf = performanceBySeller[sellerId];
      var activeCount = rows.filter(function (row) {
        return row.protocol_status === "active" && row.seller_user_id === sellerId;
      }).length;
      var summary = card.querySelector("[data-operational-seller]");
      if (!summary) return;
      summary.textContent = activeCount + " en protocolo · cumplimiento " + percent(perf && perf.compliance_pct) +
        " · en horario " + percent(perf && perf.on_time_pct) +
        " · omitidas " + percent(perf && perf.omitted_pct);
    });
  }

  function installStyles() {
    if (document.getElementById("strictProtocolStyles")) return;
    var style = document.createElement("style");
    style.id = "strictProtocolStyles";
    style.textContent = ".protocol-missed-label{display:block;margin-top:5px;font-size:10px;font-weight:800;color:#b85b00;text-transform:uppercase}";
    document.head.appendChild(style);
  }

  async function refreshStrictProtocol() {
    if (loading) return;
    var appView = document.getElementById("appView");
    if (!appView || appView.hidden) return;
    loading = true;
    try {
      var refreshResult = await supabaseClient.rpc("refresh_due_contact_protocols");
      if (refreshResult.error) throw refreshResult.error;

      var today = localDateKey(new Date());
      var results = await Promise.all([
        supabaseClient.rpc("get_supervisor_portfolio_followup_v2"),
        supabaseClient.rpc("get_supervisor_protocol_performance", {
          p_from: monthStartKey(),
          p_to: today
        })
      ]);
      if (results[0].error) throw results[0].error;
      if (results[1].error) throw results[1].error;

      protocolByLead = {};
      (results[0].data || []).forEach(function (row) { protocolByLead[row.lead_id] = row; });
      performanceBySeller = {};
      (results[1].data || []).forEach(function (row) { performanceBySeller[row.seller_user_id] = row; });

      patchPortfolioRows();
      patchSellerCards();
    } catch (error) {
      console.error("[supervisor-protocol-strict]", error);
    } finally {
      loading = false;
    }
  }

  function init() {
    installStyles();
    var appView = document.getElementById("appView");
    if (appView) {
      new MutationObserver(function () {
        if (!appView.hidden) window.setTimeout(refreshStrictProtocol, 450);
      }).observe(appView, { attributes: true, attributeFilter: ["hidden"] });
    }

    var refresh = document.getElementById("refreshButton");
    if (refresh) refresh.addEventListener("click", function () { window.setTimeout(refreshStrictProtocol, 450); });

    document.querySelectorAll('[data-supervisor-view="portfolio"]').forEach(function (button) {
      button.addEventListener("click", function () { window.setTimeout(refreshStrictProtocol, 300); });
    });

    var portfolioRows = document.getElementById("portfolioRows");
    if (portfolioRows) {
      new MutationObserver(function () { window.setTimeout(function () {
        patchPortfolioRows();
        patchSellerCards();
      }, 50); }).observe(portfolioRows, { childList: true, subtree: false });
    }

    window.setTimeout(refreshStrictProtocol, 650);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}());
