(function (root) {
  "use strict";

  function unwrapVersion(link) {
    if (!link) return null;
    var version = Object.prototype.hasOwnProperty.call(link, "version") ? link.version : link;
    return Array.isArray(version) ? (version[0] || null) : (version || null);
  }

  function activeVersionsForModel(offer, modelId) {
    return (offer && offer.versions || [])
      .map(unwrapVersion)
      .filter(function (version) {
        return version && version.active !== false && version.model_id === modelId;
      })
      .sort(function (a, b) {
        return String(a.name || "").localeCompare(String(b.name || ""), "es");
      });
  }

  function offerAppliesToModel(offer, modelId) {
    return activeVersionsForModel(offer, modelId).length > 0;
  }

  function offerVersionIds(offer) {
    return (offer && offer.versions || [])
      .map(unwrapVersion)
      .filter(Boolean)
      .map(function (version) { return version.id; });
  }

  function groupSelectedVersions(models, versions, selectedIds) {
    var selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
    return (models || []).map(function (model) {
      var rows = (versions || []).filter(function (version) {
        return version.model_id === model.id && version.active !== false;
      });
      var selectedRows = rows.filter(function (version) { return selected.has(version.id); });
      return {
        model: model,
        versions: rows,
        selectedCount: selectedRows.length,
        allSelected: rows.length > 0 && selectedRows.length === rows.length,
        partiallySelected: selectedRows.length > 0 && selectedRows.length < rows.length
      };
    });
  }

  function dateKeyForTimeZone(value, timeZone) {
    var date = value instanceof Date ? value : new Date(value == null ? Date.now() : value);
    var pieces = {};
    new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date).forEach(function (part) {
      if (part.type !== "literal") pieces[part.type] = part.value;
    });
    return pieces.year + "-" + pieces.month + "-" + pieces.day;
  }

  function argentinaDateKey(value) {
    return dateKeyForTimeZone(value, "America/Argentina/Buenos_Aires");
  }

  root.grupoSurCreditApplicability = Object.freeze({
    unwrapVersion: unwrapVersion,
    activeVersionsForModel: activeVersionsForModel,
    offerAppliesToModel: offerAppliesToModel,
    offerVersionIds: offerVersionIds,
    groupSelectedVersions: groupSelectedVersions,
    argentinaDateKey: argentinaDateKey
  });
}(typeof window !== "undefined" ? window : globalThis));
