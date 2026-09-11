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

  function greatestCommonDivisor(a, b) {
    var left = Math.abs(Math.round(Number(a) || 0));
    var right = Math.abs(Math.round(Number(b) || 0));
    while (right) {
      var remainder = left % right;
      left = right;
      right = remainder;
    }
    return left || 1;
  }

  function financedRangeStep(minimum, maximum, preferredStep) {
    var min = Number(minimum);
    var max = Number(maximum);
    var preferred = Number(preferredStep == null ? 100000 : preferredStep);
    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(preferred) || preferred <= 0) return 1;
    var cents = 100;
    var distance = Math.abs(Math.round((max - min) * cents));
    var preferredCents = Math.max(1, Math.round(preferred * cents));
    if (!distance) return preferredCents / cents;
    return greatestCommonDivisor(preferredCents, distance) / cents;
  }

  function snapFinancedAmount(value, minimum, maximum, step) {
    var cents = 100;
    var min = Math.round(Number(minimum) * cents);
    var max = Math.round(Number(maximum) * cents);
    var amount = Math.round(Number(value) * cents);
    var increment = Math.max(1, Math.round(Number(step) * cents));
    if (![min, max, amount, increment].every(Number.isFinite)) return Number(minimum) || 0;
    if (max <= min) return min / cents;
    amount = Math.min(max, Math.max(min, amount));
    if (amount === min || amount === max) return amount / cents;
    var snapped = min + Math.round((amount - min) / increment) * increment;
    return Math.min(max, Math.max(min, snapped)) / cents;
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
    financedRangeStep: financedRangeStep,
    snapFinancedAmount: snapFinancedAmount,
    argentinaDateKey: argentinaDateKey
  });
}(typeof window !== "undefined" ? window : globalThis));
