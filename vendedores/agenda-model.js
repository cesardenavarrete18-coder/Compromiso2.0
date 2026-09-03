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

  root.grupoSurAgendaModel = {
    TIME_ZONE: TIME_ZONE,
    manualAction: manualAction,
    protocolRecommendation: protocolRecommendation,
    agendaBucket: agendaBucket,
    belongsToRecommendedSection: belongsToRecommendedSection
  };
}(typeof window === "undefined" ? globalThis : window));
