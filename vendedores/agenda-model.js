(function (root) {
  "use strict";

  var TIME_ZONE = "America/Argentina/Buenos_Aires";
  var TERMINAL_STATUSES = ["venta", "desistir", "invalido"];
  var TASK_FIELDS = "id, sequence_id, lead_id, sequence_order, channel, call_attempt, message_step, protocol_day, protocol_band, band_attempt, due_start, due_end, status, outcome, note, performed_at, recorded_at, completed_at, updated_at, template:contact_message_templates(title,body)";
  var LEGACY_TASK_FIELDS = "id, sequence_id, lead_id, sequence_order, channel, call_attempt, message_step, due_start, due_end, status, outcome, note, completed_at, updated_at, template:contact_message_templates(title,body)";

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

  function matchesPortfolioStatus(lead, status) {
    if (!status || status === "all") return true;
    return crmOf(lead).status === status;
  }

  function portfolioSections(leads, options) {
    var settings = options || {};
    var now = new Date(settings.now || Date.now());
    var sections = { overdue: [], today: [], newLead: [], upcoming: [], integrity: [] };
    (leads || []).filter(function (lead) {
      return matchesPortfolioStatus(lead, settings.status);
    }).forEach(function (lead) {
      var bucket = agendaBucket(lead, now);
      if (bucket === "overdue") sections.overdue.push(lead);
      else if (bucket === "today") sections.today.push(lead);
      else if (bucket === "new") sections.newLead.push(lead);
      else if (bucket === "upcoming") sections.upcoming.push(lead);
      else if (bucket === "unscheduled") sections.integrity.push(lead);
    });
    function actionTime(lead) {
      var action = manualAction(lead);
      return action ? new Date(action.at).getTime() : 0;
    }
    sections.overdue.sort(function (a, b) { return actionTime(a) - actionTime(b); });
    sections.today.sort(function (a, b) { return actionTime(a) - actionTime(b); });
    sections.upcoming.sort(function (a, b) { return actionTime(a) - actionTime(b); });
    sections.newLead.sort(function (a, b) { return new Date(a.created_at || a.assigned_at || 0) - new Date(b.created_at || b.assigned_at || 0); });
    return sections;
  }

  function missingTaskAuditColumns(error) {
    var message = String(error && error.message || "");
    return Boolean(error && /performed_at|recorded_at|protocol_day|protocol_band|band_attempt|interview_mode|interview_operational_status|interview_objective|final_objection|deposit_validation|post_deposit_action|previous_status|terminal_at/i.test(message) && (["42703", "PGRST204"].includes(error.code) || /does not exist|schema cache|could not find/i.test(message)));
  }

  function normalizeTasks(tasks, schema) {
    return (tasks || []).map(function (task) {
      if (schema === "v2") return task;
      return Object.assign({}, task, {
        performed_at: null,
        recorded_at: task.completed_at || task.updated_at || null,
        presentation_schema: "legacy"
      });
    });
  }

  var BAND_ORDER = { "10-12": 1, "14-16": 2, "17-19": 3 };

  function protocolTaskOrder(a, b) {
    return (Number(a.protocol_day) - Number(b.protocol_day))
      || ((BAND_ORDER[a.protocol_band] || 99) - (BAND_ORDER[b.protocol_band] || 99))
      || (Number(a.band_attempt || 0) - Number(b.band_attempt || 0))
      || (Number(a.sequence_order) - Number(b.sequence_order));
  }

  function isCanonicalV2Protocol(tasks, startedAt) {
    var calls = (tasks || []).filter(function (task) { return task.channel === "call"; });
    if (calls.length !== 18) return false;
    var groups = {};
    var dayDates = {};
    var valid = calls.every(function (task) {
      if (![1, 2, 3, 4].includes(task.protocol_day) || !BAND_ORDER[task.protocol_band] || ![1, 2].includes(task.band_attempt)) return false;
      var key = task.protocol_day + ":" + task.protocol_band;
      if (!groups[key]) groups[key] = [];
      groups[key].push(task);
      var date = dateKey(task.due_start);
      if (dayDates[task.protocol_day] && dayDates[task.protocol_day] !== date) return false;
      dayDates[task.protocol_day] = date;
      var bounds = task.protocol_band.split("-").map(Number);
      var startHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(new Date(task.due_start)));
      var endHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(new Date(task.due_end)));
      return startHour >= bounds[0] && endHour <= bounds[1] && (!startedAt || new Date(task.due_end) >= new Date(startedAt));
    });
    if (!valid || Object.keys(groups).length !== 9) return false;
    if (!Object.values(groups).every(function (items) { return items.length === 2 && items.map(function (item) { return item.band_attempt; }).sort().join(",") === "1,2"; })) return false;
    var days = Object.keys(dayDates).map(Number).sort();
    if (days.length < 3 || days.length > 4 || days.some(function (day, index) { return day !== index + 1; })) return false;
    if (!days.every(function (day, index) { return index === 0 || dayDates[days[index - 1]] < dayDates[day]; })) return false;
    var ordered = calls.slice().sort(protocolTaskOrder);
    return ordered.every(function (task, index) { return index === 0 || new Date(ordered[index - 1].due_start) <= new Date(task.due_start); });
  }

  async function loadContactTasks(client) {
    try {
      var v2 = await client.from("lead_contact_tasks").select(TASK_FIELDS).order("due_start", { ascending: true }).limit(3500);
      if (!v2.error) return { tasks: normalizeTasks(v2.data, "v2"), schema: "v2", error: null };
      if (!missingTaskAuditColumns(v2.error)) return { tasks: [], schema: "unavailable", error: v2.error };
      var legacy = await client.from("lead_contact_tasks").select(LEGACY_TASK_FIELDS).order("due_start", { ascending: true }).limit(3500);
      if (legacy.error) return { tasks: [], schema: "unavailable", error: legacy.error };
      return { tasks: normalizeTasks(legacy.data, "legacy"), schema: "legacy", error: null };
    } catch (error) {
      return { tasks: [], schema: "unavailable", error: error };
    }
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
    belongsToRecommendedSection: belongsToRecommendedSection,
    matchesPortfolioStatus: matchesPortfolioStatus,
    portfolioSections: portfolioSections,
    missingTaskAuditColumns: missingTaskAuditColumns,
    normalizeTasks: normalizeTasks,
    protocolTaskOrder: protocolTaskOrder,
    isCanonicalV2Protocol: isCanonicalV2Protocol,
    loadContactTasks: loadContactTasks
  };

  loadEnGestionExperience();
}(typeof window === "undefined" ? globalThis : window));
