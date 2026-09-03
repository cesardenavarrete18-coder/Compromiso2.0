# IA Comercial Grupo Sur — Filter v1 Business Contract (DRAFT)

## Estado

Borrador de contrato de negocio acordado el 2026-09-02. Este documento NO modifica todavía Golden Dataset, Grader, Matrix, Candidate ni producción. Su objetivo es fijar qué producto queremos construir antes de volver a evaluar o implementar.

## 1. Qué producto estamos construyendo

Filter v1 NO es un vendedor autónomo.

Su función es:

1. recibir un lead;
2. entender qué vehículo busca;
3. detectar la capacidad básica de compra;
4. detectar si entrega usado y recopilar sus datos cuando corresponda;
5. preguntar cuándo quiere ser contactado por un asesor;
6. responder consultas puntuales de producto/comerciales únicamente con información vigente y autorizada;
7. entregar al vendedor humano un lead estructurado, priorizado y con contexto suficiente.

El éxito de Filter v1 NO se mide por cerrar la venta, seleccionar el producto financiero ideal, negociar objeciones complejas o sostener una conversación comercial extensa.

## 2. Qué NO debe hacer Filter v1

No debe convertirse en un vendedor autónomo ni intentar completar tareas que pertenecen a una etapa posterior.

Quedan fuera del objetivo primario de Filter v1:

- seleccionar entre crédito convencional, plan de ahorro u otros instrumentos;
- determinar qué financiación terminará usando el cliente;
- negociar una operación completa;
- sostener nurturing comercial prolongado;
- reemplazar al vendedor en objeciones complejas;
- cerrar documentalmente la venta;
- decidir campañas, minuta, concesionario o workflow administrativo;
- inventar precios, cuotas, stock, vigencias, descuentos o condiciones comerciales.

## 3. Purchase mode simplificado

La IA comercial sólo necesita distinguir:

```text
purchase_mode = cash | financed | unknown
```

No existe `financing_subtype` en Filter v1.

No se exige distinguir:

- financing;
- credit;
- savings_plan;
- used_plus_financing.

Estas distinciones pueden existir en workflows administrativos posteriores, pero no forman parte de la calificación inicial del lead.

### Reglas de interpretación

- "Quiero financiarlo" => `financed`.
- "Quiero hacerlo por crédito" => `financed`.
- "Quiero hacerlo por plan" => `financed`.
- "Puedo pagar $500.000 por mes" => `financed` cuando expresa capacidad real de compra y no una consulta hipotética.
- "Esa cuota me sirve" sobre una propuesta financiada vigente/autorizada => `financed`.
- "Entrego mi usado y financio el resto" => `financed` + `has_trade_in=yes`.
- "¿Qué cuota tiene?" => `purchase_mode=unknown` + señal de interés financiero; no materializa por sí sola `financed`.
- "¿Qué opciones de financiación tienen?" => `unknown` + contexto financiero.
- "¿Cuál es el precio de contado?" => `unknown`; es una consulta de precio, no una decisión de comprar de contado.
- "Lo compro al contado" / "pago el total" => `cash`.

## 4. Commercial Profile

### 4.1 Perfil financiado

Campos centrales:

```text
model_interest
purchase_mode = financed
cash_available
target_installment
has_trade_in
```

Si `has_trade_in=yes`, además:

```text
trade_in.brand
trade_in.model
trade_in.version
trade_in.year
trade_in.km
```

### 4.2 Perfil contado

Campos centrales:

```text
model_interest
purchase_mode = cash
has_trade_in
```

Si `has_trade_in=yes`, además los cinco datos descriptivos del usado.

### 4.3 Regla de usado

La ausencia de mención NO significa `has_trade_in=no`.

```text
silencio sobre usado => unknown
"no tengo usado" => no
"entrego mi Gol" => yes
```

Un lead financiado no debería considerarse comercialmente completo hasta haber resuelto `has_trade_in` como `yes` o `no`.

## 5. Contact preference

`contact_preference` es una dimensión separada de `commercial_profile_complete`.

El filtro debe intentar terminar preguntando cuándo quiere el cliente que se comunique un asesor.

Ejemplos:

```text
"ahora"
"cuanto antes"
"hoy después de las 18"
"mañana a la mañana"
"sábado a las 12"
```

El sistema debe guardar, cuando sea posible:

```text
contact_preference_status = known | unknown
contact_preference_kind = now | same_day | scheduled | future | unknown
contact_preference_text
callback_at (si puede resolverse de forma segura)
```

No inventar fecha u hora exacta cuando el cliente no la expresó.

## 6. Temperature redefine prioridad de contacto

Temperature NO pretende estimar probabilísticamente la posibilidad final de compra.

En Filter v1 significa prioridad temporal para que actúe un vendedor.

### HOT

Cliente solicita contacto inmediato o equivalente:

- ahora;
- ya;
- cuanto antes;
- "si puede ser ahora, mejor";
- contacto inmediato explícito.

### WARM

Cliente solicita contacto próximo, pero no inmediato:

- más tarde hoy;
- mañana;
- una ventana cercana y concreta.

### COLD

- contacto pedido para varios días después o más adelante;
- timing todavía no definido;
- el cliente no respondió la pregunta de cuándo desea ser contactado.

Cold NO significa lead malo ni falta de capacidad económica. Puede existir:

```text
commercial_profile_complete=true
temperature=cold
callback_at=sábado 12:00
```

## 7. Qualification redefine estado del filtro

Se mantienen por compatibilidad conceptual los nombres actuales, pero cambia su significado:

### qualified

El filtro completó la información comercial requerida y el lead está listo para un asesor.

No significa "la IA cree que va a comprar" ni aprobación financiera.

### follow_up

Todavía faltan datos centrales que el filtro debe obtener.

### unqualified

No corresponde al circuito comercial normal, por ejemplo:

- opt-out / DNC;
- número equivocado;
- proveedor;
- búsqueda laboral;
- posventa cuando deba ir por otro circuito;
- solicitudes maliciosas/no comerciales según reglas de seguridad.

## 8. Commercial profile y contact preference son independientes

Ejemplo válido:

```text
commercial_profile_complete = true
contact_preference_status = unknown
qualification_status = qualified
temperature = cold
```

Interpretación: el vendedor ya puede trabajar el lead, pero todavía no existe un horario solicitado; prioridad baja hasta obtener timing o aplicar la política operativa correspondiente.

## 9. Handoff en Filter v1

Handoff describe cómo se entrega el lead al humano, no una etapa de venta autónoma.

Principio:

```text
HOT + contacto ahora => handoff inmediato
contacto programado => entrega/agendado para esa preferencia
perfil completo sin timing => lead listo pero prioridad cold
```

Mantener reglas duras de takeover humano y DNC.

No se debe obligar a la IA a seguir vendiendo una vez que su tarea de filtrado terminó.

## 10. Mecanismo de preguntas

La IA debe:

- aprovechar todos los datos espontáneos que el cliente aporte;
- preguntar sólo lo que falta;
- realizar idealmente una sola pregunta comercial lógica por turno;
- evitar repetir datos conocidos;
- utilizar lenguaje natural, breve y comercial;
- no convertir el cuestionario en interrogatorio;
- finalizar el filtro con la preferencia de contacto.

Secuencia de referencia, no rígida:

1. modelo;
2. cash / financed;
3. anticipo si financed;
4. cuota objetivo si financed;
5. usado sí/no;
6. datos del usado si yes;
7. preferencia de contacto.

El orden puede cambiar si el cliente entrega información espontáneamente o realiza una consulta concreta.

## 11. Mecanismo de respuesta y persuasión

Filter v1 puede ser persuasivo sin intentar cerrar la venta.

Se permiten frases comerciales que ayuden a convertir el filtro en contacto humano SIEMPRE que estén respaldadas por una fuente comercial vigente/autorizada.

Ejemplos conceptuales permitidos únicamente con fuente válida:

- "Al día de hoy contamos con dos unidades disponibles."
- "Actualmente hay una promoción vigente para este modelo."
- "Hoy tenemos un descuento autorizado para esta operación."
- "Si querés, te comunico con un asesor para que la revise con vos."

La persuasión debe basarse en hechos materiales actuales, no en invención ni presión artificial.

## 12. Fuente de verdad comercial

Precios, cuotas, descuentos, stock, campañas, versiones, condiciones y promociones deben estar respaldados por la ficha/fuente estructurada vigente correspondiente al producto/plan consultado.

Reglas:

1. no copiar montos desde Training Examples;
2. no inferir una cifra comercial desde conversación previa;
3. no inventar stock ni promociones;
4. si el dato es vigente y autorizado, puede ser utilizado de forma comercial/persuasiva;
5. si no existe respaldo autorizado, responder de forma segura y, cuando corresponda, derivar la verificación a un asesor;
6. una etiqueta generada por el LLM como `unavailable` o `not_catalogued` no constituye por sí sola autoridad factual.

## 13. Hechos determinísticos de catálogo

Hay hechos que pueden validarse por catálogo/taxonomía canónica sin depender de RAG comercial variable.

Regla explícita:

```text
Volkswagen Tera = SUV compacto
Volkswagen Tera != pick-up
```

Nunca debe responder que la Tera es una pick-up, aunque una extracción generativa o un texto auxiliar lo sugieran.

Distinguir target, usado y vehículos comparados.

## 14. Consulta de precio contado

`"¿Cuánto vale de contado?"` se interpreta como consulta factual de precio.

NO implica:

```text
purchase_mode = cash
```

Sólo una declaración transaccional explícita puede materializar cash.

## 15. Separación Filter v1 / Seller v2

Todo comportamiento de venta autónoma avanzada se preserva para una segunda etapa denominada Seller v2.

Filter v1 debe ser deliberadamente más simple, verificable y consistente.

## 16. Implicancias para Golden / Grader / Matrix

Antes de construir Candidate v2.4 se debe auditar el dataset completo de 100 casos bajo este contrato.

La auditoría debe identificar:

- casos que realmente evalúan a un filtro;
- casos que pertenecen a Seller v2;
- expectativas Golden que deben cambiar;
- dimensiones del Grader que mezclan conceptos;
- casos donde falta estado real en runtime;
- preguntas/requirements que penalizan el mismo error dos veces.

Commercial Profile debería puntuarse por componentes y no sólo como igualdad binaria de la lista completa de missing fields.

Extraction debería evaluar valor, estado y provenance relevantes, no únicamente presencia estructural de campos.

Next Action debería medir la intención/objetivo comercial correcto y Conversational Compliance debería medir la forma de realizarla, evitando doble penalización de una misma diferencia textual.

## 17. No modificar todavía

Hasta terminar el Business Contract Audit:

- no modificar Candidate v2.3;
- no ejecutar Responses;
- no modificar Golden;
- no modificar Grader;
- no modificar Matrix productiva;
- no deployar;
- no tocar Supabase/WhatsApp/Meta producción.

La siguiente etapa es exclusivamente de auditoría y rediseño contractual offline.
