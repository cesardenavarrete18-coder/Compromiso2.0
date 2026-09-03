(function (root) {
  "use strict";

  var TIME_ZONE = "America/Argentina/Buenos_Aires";
  var TERMINAL_STATUSES = ["venta", "desistir", "invalido"];

  function crmOf(lead) {
    if (!lead || !lead.crm) return { status: "nuevo", priority: lead && lead.priority || "normal" };
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

  function numberValue(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function protocolRecommendation(summary) {
    if (!summary || !summary.next_task_id || !summary.next_task_due_start) return null;
    var label = summary.next_task_channel === "call"
      ? "Llamada " + numberValue(summary.next_task_call_attempt)
      : summary.next_task_channel === "whatsapp"
        ? "WhatsApp " + numberValue(summary.next_task_message_step)
        : "Tarea de seguimiento";
    return {
      at: summary.next_task_due_start,
      label: label,
      source: "protocol_recommendation",
      sourceLabel: "RECOMENDADO"
    };
  }

  function manualAction(lead) {
    var crm = crmOf(lead);
    if (!crm.next_contact_at || crm.next_contact_source !== "manual") return null;
    return {
      at: crm.next_contact_at,
      label: crm.next_contact_note || "Próximo contacto acordado",
      source: "manual",
      sourceLabel: "MANUAL"
    };
  }

  function nextAction(lead) {
    return manualAction(lead);
  }

  function deriveFollowUpStatus(lead, summary, nowValue) {
    summary = summary || {};
    var crm = crmOf(lead);
    var now = nowValue ? new Date(nowValue) : new Date();
    var active = Boolean(lead && lead.assigned_seller_user_id && !TERMINAL_STATUSES.includes(crm.status));
    var managementCount = numberValue(summary.management_count);
    var withoutManagement = Boolean(active && crm.status === "nuevo" && managementCount === 0);
    // The backend derives this dimension from the Lead's complete commercial
    // history. It must not be inferred from the absence of an effective contact:
    // an untouched "nuevo" Lead belongs to Sin gestion, not Sin primer contacto.
    var withoutFirstContact = Boolean(active && summary.without_first_contact === true);
    var action = active ? nextAction(lead) : null;
    var recommendation = active ? protocolRecommendation(summary) : null;
    var key = "completed";

    if (withoutManagement) key = "unmanaged";
    else if (action && new Date(action.at).getTime() < now.getTime()) key = "overdue";
    else if (action && dateKey(action.at) === dateKey(now)) key = "today";
    else if (action && new Date(action.at).getTime() > now.getTime()) key = "upcoming";
    else if (active) key = "unscheduled";

    return {
      key: key,
      label: {
        unmanaged: "SIN GESTIÓN",
        overdue: "VENCIDA",
        today: "HOY",
        upcoming: "PRÓXIMA",
        unscheduled: "SIN PROGRAMAR",
        completed: "COMPLETADA"
      }[key],
      active: active,
      withoutManagement: withoutManagement,
      withoutFirstContact: withoutFirstContact,
      completedToday: Boolean(summary.completed_today),
      managementCount: managementCount,
      nextAction: action,
      protocolRecommendation: recommendation
    };
  }

  function normalize(value) {
    return String(value || "").toLocaleLowerCase("es-AR");
  }

  function matchesFilters(lead, derived, filters) {
    filters = filters || {};
    var crm = crmOf(lead);
    if (!filters.historical && !derived.active) return false;
    if (filters.seller && lead.assigned_seller_user_id !== filters.seller) return false;
    if (filters.status && crm.status !== filters.status) return false;
    if (filters.priority && (crm.priority || lead.priority || "normal") !== filters.priority) return false;
    if (filters.situation === "without_first_contact" && !derived.withoutFirstContact) return false;
    if (filters.situation === "completed_today" && !derived.completedToday) return false;
    if (filters.situation && !["without_first_contact", "completed_today"].includes(filters.situation) && derived.key !== filters.situation) return false;
    if (filters.search) {
      var haystack = normalize([lead.customer_name, lead.customer_phone, lead.model_interest, lead.intent_summary].join(" "));
      if (!haystack.includes(normalize(filters.search))) return false;
    }
    return true;
  }

  function isReassignable(lead) {
    return Boolean(lead && lead.assigned_seller_user_id && !TERMINAL_STATUSES.includes(crmOf(lead).status));
  }

  function pruneSelection(selection, visibleLeads) {
    var visibleReassignableIds = new Set((visibleLeads || []).filter(isReassignable).map(function (lead) { return lead.id; }));
    return (selection || []).filter(function (leadId) { return visibleReassignableIds.has(leadId); });
  }

  function metrics(rows) {
    return rows.reduce(function (result, row) {
      var derived = row.derived;
      if (derived.active) result.active += 1;
      if (derived.withoutManagement) result.unmanaged += 1;
      if (derived.withoutFirstContact) result.withoutFirstContact += 1;
      if (derived.key === "overdue") result.overdue += 1;
      if (derived.key === "today") result.today += 1;
      if (derived.key === "upcoming") result.upcoming += 1;
      if (derived.key === "unscheduled") result.unscheduled += 1;
      if (derived.completedToday && derived.active) result.completedToday += 1;
      if (crmOf(row.lead).status === "entrevista" && derived.active) result.interviews += 1;
      if (["cierre", "sena"].includes(crmOf(row.lead).status) && derived.active) result.closing += 1;
      return result;
    }, { active: 0, unmanaged: 0, withoutFirstContact: 0, overdue: 0, today: 0, upcoming: 0, unscheduled: 0, completedToday: 0, interviews: 0, closing: 0 });
  }

  function elapsedParts(fromValue, toValue) {
    var diffMinutes = Math.max(0, Math.floor((new Date(toValue || Date.now()).getTime() - new Date(fromValue).getTime()) / 60000));
    var days = Math.floor(diffMinutes / 1440);
    var hours = Math.floor((diffMinutes % 1440) / 60);
    var minutes = diffMinutes % 60;
    return { totalMinutes: diffMinutes, days: days, hours: hours, minutes: minutes };
  }

  function elapsedLabel(fromValue, toValue) {
    if (!fromValue) return "Asignación sin fecha";
    var parts = elapsedParts(fromValue, toValue);
    if (parts.days) return "Asignado hace " + parts.days + (parts.days === 1 ? " día" : " días");
    if (parts.hours) return "Asignado hace " + parts.hours + " h" + (parts.minutes ? " " + parts.minutes + " min" : "");
    return "Asignado hace " + parts.minutes + " min";
  }

  function assignmentAttention(fromValue, toValue) {
    var minutes = elapsedParts(fromValue, toValue).totalMinutes;
    if (minutes > 180) return "critical";
    if (minutes >= 60) return "attention";
    return "normal";
  }

  root.grupoSurFollowUpModel = {
    TIME_ZONE: TIME_ZONE,
    TERMINAL_STATUSES: TERMINAL_STATUSES.slice(),
    dateKey: dateKey,
    protocolRecommendation: protocolRecommendation,
    deriveFollowUpStatus: deriveFollowUpStatus,
    matchesFilters: matchesFilters,
    isReassignable: isReassignable,
    pruneSelection: pruneSelection,
    metrics: metrics,
    elapsedParts: elapsedParts,
    elapsedLabel: elapsedLabel,
    assignmentAttention: assignmentAttention
  };
}(typeof window === "undefined" ? globalThis : window));
