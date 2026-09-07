(function (root) {
  "use strict";

  var PLAYBOOK_GROUPS = [
    {
      key: "start",
      label: "Inicio",
      items: [
        { key: "initial_message", label: "Enviar mensaje inicial", kind: "message", template: "initial" },
        { key: "confirm_model_version", label: "Confirmar modelo / versión de interés", kind: "check" },
        { key: "detect_primary_need", label: "Detectar necesidad principal", kind: "check" }
      ]
    },
    {
      key: "proposal",
      label: "Propuesta",
      items: [
        { key: "send_quote", label: "Enviar presupuesto", kind: "quote" },
        { key: "send_vehicle_photos", label: "Enviar fotos del vehículo", kind: "material", materialType: "photos" },
        { key: "send_technical_material", label: "Enviar ficha técnica o comparativa si aporta valor", kind: "material", materialType: "technical" }
      ]
    },
    {
      key: "qualification",
      label: "Calificación",
      items: [
        { key: "purchase_modality", label: "Definir modalidad de compra", kind: "check" },
        { key: "initial_capacity", label: "Relevar anticipo o capacidad inicial", kind: "check" },
        { key: "trade_in", label: "Consultar usado en parte de pago", kind: "check" },
        { key: "purchase_urgency", label: "Identificar plazo / urgencia de compra", kind: "check" }
      ]
    },
    {
      key: "advance",
      label: "Avance",
      items: [
        { key: "main_objection", label: "Detectar objeción principal", kind: "check" },
        { key: "schedule_next_contact", label: "Definir y programar próximo contacto", kind: "follow_up" },
        { key: "attempt_next_stage", label: "Intentar llevar a Entrevista o Cierre", kind: "check" }
      ]
    }
  ];

  var MESSAGE_TEMPLATES = [
    {
      key: "initial",
      label: "Mensaje inicial",
      body: "Hola {nombre}, soy {vendedor} de Grupo Sur. Estuve viendo tu consulta por {modelo}. Te escribo para ayudarte a revisar opciones y armar una propuesta según lo que estés buscando. ¿Tenés unos minutos para que lo veamos?"
    },
    {
      key: "quote_follow_up",
      label: "Seguimiento con presupuesto",
      body: "{nombre}, te envío el presupuesto de {modelo} que vimos. Revisalo tranquilo; si querés, después vemos juntos la alternativa que mejor se ajuste a tu forma de compra."
    },
    {
      key: "photos",
      label: "Envío de fotos",
      body: "Te paso también fotos de {modelo} para que puedas verlo con más detalle. Si querés, te muestro las diferencias entre versiones y equipamiento."
    },
    {
      key: "technical",
      label: "Ficha técnica / comparativa",
      body: "Te comparto la información de {modelo}. Decime qué parte te interesa más y te ayudo a comparar versiones y equipamiento sin llenarte de información que no necesitás."
    },
    {
      key: "soft_reactivation",
      label: "Reactivación suave",
      body: "Hola {nombre}, retomo por acá lo que veníamos viendo de {modelo}. ¿Pudiste revisar la propuesta? Si cambió algo de lo que buscás, decime y la ajustamos."
    },
    {
      key: "interview",
      label: "Invitación a entrevista",
      body: "Por lo que vimos, creo que ya tenemos bastante claro el escenario. Si te sirve, coordinamos una entrevista y revisamos juntos la alternativa final antes de avanzar."
    }
  ];

  var MATERIALS = [
    {
      match: ["t-cross", "tcross", "t cross"],
      label: "Volkswagen T-Cross",
      photos: [
        { label: "Vista principal", url: "/assets/volkswagen-tcross-main.webp" },
        { label: "Interior", url: "/assets/volkswagen-tcross-interior.webp" },
        { label: "Diseño", url: "/assets/volkswagen-tcross-design.webp" }
      ],
      technical: [{ label: "Ficha técnica T-Cross", url: "/assets/volkswagen-tcross.pdf", type: "pdf" }]
    },
    {
      match: ["nivus"],
      label: "Volkswagen Nivus",
      photos: [
        { label: "Vista principal", url: "/assets/volkswagen-nivus-main.webp" },
        { label: "Interior", url: "/assets/volkswagen-nivus-interior.webp" },
        { label: "Diseño", url: "/assets/volkswagen-nivus-design.webp" }
      ],
      technical: [{ label: "Ficha técnica Nivus", url: "/assets/volkswagen-nivus.pdf", type: "pdf" }]
    },
    {
      match: ["taos"],
      label: "Volkswagen Taos",
      photos: [
        { label: "Vista principal", url: "/assets/volkswagen-taos-main.webp" },
        { label: "Interior", url: "/assets/volkswagen-taos-interior.webp" },
        { label: "Diseño", url: "/assets/volkswagen-taos-design.webp" }
      ],
      technical: [{ label: "Ficha técnica Taos", url: "/assets/volkswagen-taos.pdf", type: "pdf" }]
    },
    {
      match: ["tera"],
      label: "Volkswagen Tera",
      photos: [
        { label: "Vista principal", url: "/assets/volkswagen-tera-main.webp" },
        { label: "Interior", url: "/assets/volkswagen-tera-interior.webp" }
      ],
      technical: [{ label: "Ficha técnica Tera", url: "/assets/volkswagen-tera.pdf", type: "pdf" }]
    },
    {
      match: ["amarok"],
      label: "Volkswagen Amarok",
      photos: [
        { label: "Vista principal", url: "/assets/volkswagen-amarok-main.webp" },
        { label: "Interior", url: "/assets/volkswagen-amarok-interior.webp" }
      ],
      technical: [{ label: "Ficha técnica Amarok", url: "/assets/volkswagen-amarok.pdf", type: "pdf" }]
    },
    {
      match: ["208"],
      label: "Peugeot 208",
      photos: [
        { label: "Vista principal", url: "/assets/peugeot-208-main.webp" },
        { label: "Interior", url: "/assets/peugeot-208-interior.webp" }
      ],
      technical: [{ label: "Ficha técnica 208", url: "/assets/peugeot-208.pdf", type: "pdf" }]
    },
    {
      match: ["2008"],
      label: "Peugeot 2008",
      photos: [
        { label: "Vista principal", url: "/assets/peugeot-2008-main.webp" },
        { label: "Interior", url: "/assets/peugeot-2008-interior.webp" },
        { label: "Diseño", url: "/assets/peugeot-2008-design.webp" },
        { label: "Vista trasera", url: "/assets/peugeot-2008-rear.webp" }
      ],
      technical: [{ label: "Ficha técnica 2008", url: "/assets/peugeot-2008.pdf", type: "pdf" }]
    },
    {
      match: ["partner"],
      label: "Peugeot Partner",
      photos: [
        { label: "Vista principal", url: "/assets/partner-product-front.webp" },
        { label: "Interior", url: "/assets/partner-interior-wide.webp" },
        { label: "Carga", url: "/assets/partner-rear-load.webp" }
      ],
      technical: [{ label: "Ficha técnica Partner", url: "/assets/peugeot-partner.pdf", type: "pdf" }]
    },
    {
      match: ["cronos"],
      label: "Fiat Cronos",
      photos: [
        { label: "Vista principal", url: "/assets/fiat-cronos-main.webp" },
        { label: "Interior", url: "/assets/fiat-cronos-interior.webp" }
      ],
      technical: [{ label: "Ficha técnica Cronos", url: "/assets/fiat-cronos.pdf", type: "pdf" }]
    },
    {
      match: ["titano"],
      label: "Fiat Titano",
      photos: [
        { label: "Vista principal", url: "/assets/fiat-titano-main.webp" },
        { label: "Interior", url: "/assets/fiat-titano-interior.webp" },
        { label: "Diseño", url: "/assets/fiat-titano-design.webp" }
      ],
      technical: [{ label: "Ficha técnica Titano", url: "/assets/fiat-titano.pdf", type: "pdf" }]
    },
    {
      match: ["mobi"],
      label: "Fiat Mobi",
      photos: [
        { label: "Vista principal", url: "/assets/fiat-mobi-main.webp" },
        { label: "Interior", url: "/assets/fiat-mobi-interior.webp" },
        { label: "Diseño", url: "/assets/fiat-mobi-design.webp" }
      ],
      technical: []
    },
    {
      match: ["polo"],
      label: "Volkswagen Polo",
      photos: [{ label: "Imagen de catálogo", url: "/assets/vw-polo-robust-catalog-v2.webp" }],
      technical: []
    },
    {
      match: ["virtus"],
      label: "Volkswagen Virtus",
      photos: [{ label: "Imagen de catálogo", url: "/assets/vw-virtus-catalog-v2.webp" }],
      technical: []
    },
    {
      match: ["toro"],
      label: "Fiat Toro",
      photos: [{ label: "Imagen de catálogo", url: "/assets/fiat-toro.webp" }],
      technical: []
    },
    {
      match: ["fiorino"],
      label: "Fiat Fiorino",
      photos: [{ label: "Imagen de catálogo", url: "/assets/fiat-fiorino.webp" }],
      technical: []
    }
  ];

  function normalize(value) {
    return String(value || "").trim().toLocaleLowerCase("es-AR");
  }

  function findTemplate(key) {
    return MESSAGE_TEMPLATES.find(function (item) { return item.key === key; }) || null;
  }

  function interpolate(body, context) {
    var data = context || {};
    return String(body || "")
      .replace(/\{nombre\}/g, data.customerName || "")
      .replace(/\{vendedor\}/g, data.sellerName || "tu asesor comercial")
      .replace(/\{modelo\}/g, data.modelInterest || "tu próximo 0 km");
  }

  function resolveMaterials(modelInterest) {
    var normalized = normalize(modelInterest);
    return MATERIALS.find(function (entry) {
      return entry.match.some(function (needle) { return normalized.includes(needle); });
    }) || null;
  }

  function allItemKeys() {
    return PLAYBOOK_GROUPS.reduce(function (keys, group) {
      return keys.concat(group.items.map(function (item) { return item.key; }));
    }, []);
  }

  root.grupoSurManagementPlaybook = {
    groups: PLAYBOOK_GROUPS,
    templates: MESSAGE_TEMPLATES,
    materials: MATERIALS,
    allItemKeys: allItemKeys,
    findTemplate: findTemplate,
    interpolate: interpolate,
    resolveMaterials: resolveMaterials
  };
}(typeof window === "undefined" ? globalThis : window));
