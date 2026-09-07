(function (root) {
  "use strict";

  var TIME_ZONE = "America/Argentina/Buenos_Aires";
  var TERMINAL_STATUSES = ["venta", "desistir", "invalido"];

  function crmOf(lead) {
    if (!lead || !lead.crm) return { status: "nuevo" };
    return Array.isArray(lead.crm) ? lead.crm[0] || {} : lead.crm;
  }

  function dateKey(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(value));
  }

  function manualAction(lead) {
    var crm = crmOf(lead);
    if (crm.next_contact_source !== "manual" || !crm.next_contact_at) return null;
    return { at: crm.next_contact_at, note: crm.next_contact_note || "Próximo contacto acordado" };
  }

  function protocolRecommendation(lead, pendingTask, nowValue) {
    var crm = crmOf(lead);
    if (!pendingTask || pendingTask.status !== "pending" || TERMINAL_STATUSES.includes(crm.status) || manualAction(lead)) return null;
    return {
      task: pendingTask,
      past: new Date(pendingTask.due_start).getTime() < new Date(nowValue || Date.now()).getTime()
    };
  }

  function agendaBucket(lead, nowValue) {
    var crm = crmOf(lead);
    if (TERMINAL_STATUSES.includes(crm.status)) return "closed";
    if (crm.status === "nuevo") return "new";
    var manual = manualAction(lead);
    if (!manual) return "unscheduled";
    var now = new Date(nowValue || Date.now());
    if (new Date(manual.at).getTime() < now.getTime()) return "overdue";
    return dateKey(manual.at) === dateKey(now) ? "today" : "upcoming";
  }

  function belongsToRecommendedSection(lead, pendingTask, nowValue) {
    return crmOf(lead).status === "no_contesta" && Boolean(protocolRecommendation(lead, pendingTask, nowValue));
  }

  function appendStyleOnce(id, href) {
    if (typeof document === "undefined" || document.getElementById(id)) return;
    var link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function appendScriptOnce(id, src, onload) {
    if (typeof document === "undefined") return;
    var existing = document.getElementById(id);
    if (existing) {
      if (onload) onload();
      return;
    }
    var script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = false;
    if (onload) script.addEventListener("load", onload, { once: true });
    document.head.appendChild(script);
  }

  function loadEnGestionExperience() {
    if (typeof document === "undefined") return;
    appendStyleOnce("crm-en-gestion-style", "/vendedores/en-gestion.css?v=20260907-2");

    function loadUi() {
      if (root.grupoSurEnGestionExperience) return;
      appendScriptOnce("crm-en-gestion-ui", "/vendedores/en-gestion.js?v=20260907-1");
    }

    if (root.grupoSurManagementPlaybook) loadUi();
    else appendScriptOnce("crm-management-playbook-model", "/vendedores/management-playbook-model.js?v=20260907-1", loadUi);
  }

  root.grupoSurAgendaModel = {
    TIME_ZONE: TIME_ZONE,
    manualAction: manualAction,
    protocolRecommendation: protocolRecommendation,
    agendaBucket: agendaBucket,
    belongsToRecommendedSection: belongsToRecommendedSection
  };

  loadEnGestionExperience();
}(typeof window === "undefined" ? globalThis : window));
