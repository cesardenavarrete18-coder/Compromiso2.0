(function (root) {
  "use strict";

  var TRANSITIONS = {
    nuevo: ["contacto_futuro", "en_proceso", "entrevista", "cierre", "sena", "venta", "desistir", "no_contesta", "invalido"],
    no_contesta: ["contacto_futuro", "en_proceso", "entrevista", "cierre", "sena", "venta", "desistir", "no_contesta", "invalido"],
    contacto_futuro: ["contacto_futuro", "no_contesta", "en_proceso", "entrevista", "cierre", "sena", "venta", "desistir"],
    en_proceso: ["en_proceso", "entrevista", "cierre", "sena", "venta", "desistir"],
    entrevista: ["en_proceso", "entrevista", "cierre", "sena", "venta", "desistir"],
    cierre: ["cierre", "entrevista", "en_proceso", "sena", "venta", "desistir"],
    sena: ["sena", "venta", "desistir"],
    venta: ["venta"],
    desistir: [],
    invalido: []
  };

  var LABELS = {
    nuevo: "Nuevo",
    no_contesta: "Sin contacto",
    contacto_futuro: "Pide contacto futuro",
    en_proceso: "En gestión",
    entrevista: "Entrevista",
    cierre: "Cierre",
    sena: "Seña",
    venta: "Venta",
    desistir: "Desistir",
    invalido: "Inválido / Dato erróneo"
  };

  function allowedFrom(status) {
    return (TRANSITIONS[status] || []).slice();
  }

  function canTransition(from, to) {
    return allowedFrom(from).includes(to);
  }

  function assertTransition(from, to) {
    if (!canTransition(from, to)) throw new Error("La transición de " + (LABELS[from] || from) + " a " + (LABELS[to] || to) + " no está permitida.");
    return true;
  }

  root.grupoSurCRMTransitions = {
    map: TRANSITIONS,
    labels: LABELS,
    allowedFrom: allowedFrom,
    canTransition: canTransition,
    assertTransition: assertTransition
  };
}(typeof window === "undefined" ? globalThis : window));
