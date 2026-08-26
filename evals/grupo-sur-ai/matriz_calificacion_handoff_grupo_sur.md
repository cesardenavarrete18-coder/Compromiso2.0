# Matriz definitiva de calificación, perfil comercial y handoff — Grupo Sur Automotores

**Estado:** especificación funcional definitiva aprobada  
**Versión:** 1.4 — 26/08/2026  
**Alcance:** IA comercial de WhatsApp, Meta Ads y TikTok  
**Restricción:** este documento no implementa código ni modifica producción.

## 1. Principios rectores

1. `qualification_status`, `commercial_temperature` y `handoff_status` son dimensiones independientes. `commercial_profile_complete` es una dimensión derivada adicional y tampoco altera automáticamente las otras tres.
2. La calificación describe la calidad comercial comprobada del lead. No describe quién controla la conversación.
3. La temperatura describe urgencia, compromiso y cercanía de la acción. No mide cuántos datos fueron recolectados.
4. El handoff describe la necesidad y el estado de intervención humana. No cambia por sí mismo la calificación ni la temperatura.
5. La asignación o routing a un vendedor es otra dimensión operativa. Un lead de TikTok puede quedar asignado a un vendedor mientras la IA continúa calificándolo.
6. Un dato desconocido no es una señal negativa.
7. Un dato contradictorio no puede usarse para calificar hasta quedar resuelto.
8. Nunca se infiere falta de capacidad económica por no informar anticipo, cuota o usado.
9. El modelo del anuncio es el interés inicial. Una corrección explícita del cliente lo reemplaza y genera la etiqueta `cambio_de_modelo`.
10. La información comercial vigente sólo puede provenir de fuentes autorizadas y vigentes.
11. Volkswagen Tera es un SUV compacto y nunca debe describirse como pick-up.
12. El agotamiento conversacional puede exigir handoff, pero nunca convierte automáticamente al lead en `qualified`.
13. Un lead puede ser `qualified` con `commercial_profile_complete=false` cuando existe una señal de acción suficiente.
14. Nunca se retrasa una oportunidad `hot`, una solicitud humana, una seña o una visita para completar anticipo o cuota.
15. Cuando el perfil está incompleto, `missing_commercial_fields` debe indicar exactamente qué requisito obligatorio falta según la modalidad.
16. Meta Ads puede aportar modelo y modalidad inicial conocidos cuando la campaña los identifica inequívocamente; no deben volver a preguntarse salvo corrección o ambigüedad.
17. La existencia, descripción y valuación de un usado son hechos diferentes: `has_trade_in=yes` no implica que su perfil esté completo ni que exista un valor autorizado.
18. Todo valor usado como ancla de cuota debe provenir de la fuente comercial estructurada, vigente y autorizada; nunca del prompt ni de aprendizajes.
19. El efectivo disponible, la estimación del cliente sobre su usado y la tasación autorizada se almacenan por separado. Ningún valor estimado por el cliente se convierte en valuación oficial.
20. `initial_capacity` se calcula exclusivamente por código a partir del efectivo conocido y, cuando exista, la valuación autorizada del usado. El LLM no calcula ni completa este campo.
21. Puede existir `qualified + cold`: el plazo y el silencio afectan temperatura, prioridad y nutrición, pero no eliminan una calificación sustentada.
22. `conversation_status` y `do_not_contact` son dimensiones operativas independientes de calificación, temperatura y handoff.
23. El reminder de dos horas no enfría automáticamente al lead; 24 horas sin respuesta es una señal inicial de enfriamiento pendiente de calibración.
24. Los reminders automáticos no cuentan como intervenciones comerciales para el límite conversacional.
25. En TikTok, la ausencia de identificador habilita una única pregunta por código o nombre y apellido; sólo un identificador inválido, ambiguo, contradictorio o irresoluble después del intento escala a Supervisor.
26. La falta actual de capacidad económica con intención exploratoria o futura permanece `follow_up + cold`; sólo un rechazo definitivo o ausencia inequívoca de intención futura permite `unqualified`.

## 2. Contrato de los datos extraídos

Cada campo extraído debe conservar:

- `value`: valor normalizado;
- `status`: `known`, `unknown`, `conflicting` o `not_applicable`;
- `confidence`: `high`, `medium` o `low`;
- `evidence`: identificador del mensaje y fragmento del cliente que lo respalda;
- `updated_at`: momento de la última confirmación;
- `source`: `customer`, `meta_ad`, `tiktok_identifier`, `authorized_commercial_source`, `human` o `system`.

No debe sobrescribirse un valor conocido con `unknown`. Un valor inferido con baja confianza no debe activar por sí solo calificación, temperatura hot, etiqueta sensible ni handoff.

### Campos normalizados

| Campo | Valores / estructura recomendada | Uso principal |
|---|---|---|
| `model_interest` | marca, modelo canónico y variante si fue indicada | Calificación, respuesta, routing |
| `advertised_model` | modelo detectado en Meta Ads | Atribución e interés inicial |
| `purchase_modality` | `financing`, `savings_plan`, `cash`, `credit`, `used_plus_financing`, `undecided`, `unknown`; conserva valor, fuente, confianza y campaña/anuncio de origen | Calificación y etiquetas |
| `modalities_considered` | lista de modalidades mencionadas | Manejo de comparación sin contradicción falsa |
| `cash_available` | monto efectivo inicial, moneda y evidencia del cliente; `$0` es un valor conocido válido | Perfil comercial y capacidad |
| `trade_in_customer_estimate` | monto que el cliente atribuye a su usado, moneda y evidencia; siempre `source=customer` y nunca oficial | Contexto de negociación; no integra la capacidad autorizada |
| `trade_in_authorized_value` | monto, moneda, tasación, vigencia y fuente autorizada | Capacidad inicial autorizada |
| `initial_capacity` | `known_amount`, moneda, componentes y `status=unknown\|partial\|complete`; cálculo determinístico | Capacidad inicial total conocida |
| `campaign_installment_anchor` | cuota inicial vigente recuperada de fuente estructurada, con campaña, vigencia y procedencia | Conversación; no equivale a cuota objetivo |
| `target_installment` | monto, moneda y máximo/objetivo respaldado por declaración o aceptación del cliente | Capacidad y perfil |
| `has_trade_in` | `yes`, `no`, `unknown` | Perfil y etiqueta |
| `trade_in` | marca, modelo, versión, año y km | Perfil descriptivo y calificación |
| `trade_in_profile_complete` | `true` cuando los cinco datos descriptivos están conocidos y sin conflicto; se evalúa sólo si `has_trade_in=yes` | Completitud descriptiva |
| `trade_in_valuation_status` | `not_requested`, `pending`, `customer_estimate` o `authorized` | Estado del proceso de tasación |
| `zone` | localidad/provincia normalizada | Atención y logística |
| `purchase_timeframe` | fecha o rango normalizado | Temperatura y calificación |
| `urgency` | `high`, `medium`, `low`, con evidencia | Temperatura y etiqueta |
| `visit_intent` | `none`, `considering`, `requested`, `scheduled` | Calificación, temperatura, handoff |
| `deposit_intent` | `none`, `considering`, `ready`, `confirmed` | Calificación, temperatura, handoff |
| `objections` | lista tipificada y estado `open`/`resolved` | Conversación y handoff |
| `commercial_intent` | `none`, `exploratory`, `active`, `action_ready` | Las tres dimensiones |
| `spontaneous_information_count` | cantidad de campos útiles aportados antes de ser preguntados | Temperatura/confianza, nunca regla única |
| `human_request` | `none`, `preference`, `explicit`, `repeated` | Handoff |
| `conversation_progress` | campos nuevos, preguntas repetidas, frustración, intentos sin avance | Handoff por agotamiento |
| `commercial_profile_complete` | `true` o `false`, calculado por código | Completitud económica mínima |
| `missing_commercial_fields` | requisitos obligatorios pendientes según modalidad, incluidos `trade_in.*` cuando existe usado; nunca incluye la tasación | Próxima pregunta y resumen de handoff |
| `conversation_status` | `open`, `paused` o `closed` | Continuidad del hilo; nunca propiedad humana ni calificación |
| `do_not_contact` | booleano | Bloqueo de toda salida automática futura cuando es `true` |

## 3. Definiciones ejecutivas

### A. Qué significa exactamente `qualified`

Un lead `qualified` es una persona con intención comercial real sobre un vehículo 0 km atendido por Grupo Sur, cuyo interés y situación permiten que un vendedor continúe con una acción comercial concreta sin tener que reiniciar el descubrimiento desde cero.

Existen dos vías suficientes:

**Vía normal**

1. modelo exacto confirmado;
2. modalidad de compra definida;
3. al menos una señal accionable adicional:
   - efectivo inicial informado;
   - cuota objetivo informada;
   - usado informado con al menos dos datos entre marca/modelo/año/km;
   - plazo de compra informado y comercialmente utilizable;
   - intención concreta de visita;
   - intención de seña;
   - crédito/precalificación ya disponible;
4. intención `active` o `action_ready`;
5. ninguna causal de `unqualified`.

**Vía de acción inmediata**

Modelo exacto confirmado más una acción comercial inequívoca: quiere señar, agendar visita, presentar documentación o concretar la compra. En esta vía la modalidad puede quedar pendiente porque el vendedor debe intervenir ya.

**Particularidad de contado:** modelo exacto + decisión explícita de compra al contado + intención activa es suficiente. El contado ya constituye una señal fuerte de modalidad y capacidad; no se exige preguntar anticipo o cuota.

Una vez alcanzado `qualified`, un plazo lejano no lo degrada a `follow_up` si el vendedor todavía puede avanzar sin reiniciar el descubrimiento. En ese caso corresponde `qualified + cold` y una estrategia de nutrición acorde.

### B. Cuándo debe llegar al vendedor sin estar `qualified`

- solicitud explícita o repetida de una persona;
- intención de comprar/señar/visitar urgente pero todavía falta modelo o modalidad;
- agotamiento conversacional sin progreso;
- frustración con la IA o preguntas repetidas;
- objeción grave de confianza, fraude, reclamo, privacidad o situación sensible;
- consulta cuya respuesta técnica/comercial necesaria no está en una fuente autorizada;
- contradicción de identidad TikTok o routing que requiere Supervisor;
- necesidad de tasación compleja o negociación excepcional;
- cliente existente con reclamo o trámite posventa.

En todos estos casos se conserva `follow_up` o `unqualified` según corresponda.

### C. Diferencia entre `hot` y `qualified`

- `qualified` responde: **¿tenemos información comercial suficiente y confiable para que ventas avance sin reiniciar?**
- `hot` responde: **¿qué tan cerca está el cliente de ejecutar una acción comercial?**

Ejemplos:

- “Quiero comprar hoy, llámeme alguien” sin modelo: `follow_up + hot + handoff_required`.
- “Busco Tera con plan, tengo $8M y compraría en 45 días”: `qualified + warm + handoff_recommended`.
- “Quiero señar una Nivus ahora”: `qualified + hot + handoff_required`.

### D. Campos imprescindibles y campos que mejoran el perfil

| Tipo | Campos |
|---|---|
| Imprescindibles en la vía normal | intención comercial real, modelo exacto, modalidad definida y una señal accionable adicional |
| Imprescindibles en la vía inmediata | modelo exacto e intención inequívoca de seña, visita, documentación o concreción |
| Mejoran fuertemente el perfil | efectivo disponible, cuota objetivo, plazo, usado con sus cinco datos descriptivos y estado de tasación |
| Mejoran atención y routing | zona, objeciones, urgencia, intención de visita, canal, anuncio, asesor TikTok |
| Contextuales, nunca requisito aislado | cantidad de información espontánea, cantidad de mensajes, tono emocional |

### E. Responsabilidad de código y LLM

| Debe resolver código determinístico | Necesita interpretación del LLM |
|---|---|
| Precedencia entre estados y reglas | Extraer lenguaje libre y referencias contextuales |
| Cálculo final de estados, completitud, faltantes e `initial_capacity` | Detectar intención comercial y su evidencia |
| Normalización de enums, moneda, fecha y modelo | Clasificar objeciones y si están resueltas |
| Validación de códigos/nombres TikTok y asesor activo | Interpretar urgencia expresada indirectamente |
| Vigencia y autorización de precios/planes | Identificar correcciones: “no, en realidad...” |
| Detección del cambio entre anuncio y modelo actual | Redactar la respuesta natural |
| Reglas de opt-out, seguridad, privacidad y takeover | Resumir lo entendido sin inventar |
| Conteo de campos conocidos y contradictorios | Proponer la próxima mejor pregunta |
| Aplicación de etiquetas desde campos validados | Estimar intención `exploratory`, `active` o `action_ready` con evidencia |
| Validación final antes del envío | Señalar baja confianza o ambigüedad |

El LLM propone extracciones e interpretaciones. El código valida y decide estados.

### F. Modalidad inicial proveniente de Meta Ads

Cuando una referencia de Meta Ads identifica inequívocamente una operación, la modalidad se carga como dato inicial conocido:

- anuncio de financiación → `purchase_modality=financing`;
- anuncio específico de plan de ahorro → `purchase_modality=savings_plan`;
- anuncio específico de crédito prendario/bancario/terminal → `purchase_modality=credit`.

La evidencia debe conservar:

- `value` normalizado;
- `source=meta_ad`;
- `confidence=high` sólo cuando la campaña o su configuración estructurada sea inequívoca;
- `ad_id`, `campaign_id`, nombre y versión de campaña si están disponibles;
- texto o metadato que originó la clasificación;
- fecha de ingreso y vigencia comercial asociada.

Reglas:

1. La configuración estructurada de la campaña tiene prioridad sobre inferencias libres del texto del anuncio.
2. Si modelo y modalidad están confirmados por el anuncio, la IA no vuelve a preguntar “qué modelo” ni “contado o financiación”.
3. La próxima intervención responde primero la consulta y avanza sobre `cash_available`, `target_installment` o datos descriptivos del usado según el contexto.
4. La modalidad del anuncio es inicial, no irrevocable.
5. Una declaración explícita posterior del cliente prevalece, cambia la fuente activa a `customer` y conserva el valor Meta en el historial.
6. Si el cliente cambia a contado, `cash_available` y `target_installment` pasan a `not_applicable`; las etiquetas activas reflejan contado, aunque el origen financiado se conserve en atribución.
7. Si el anuncio es ambiguo, `purchase_modality=unknown`; no se adivina por palabras genéricas.

### G. Completitud del perfil comercial

`commercial_profile_complete` responde una pregunta diferente de la calificación:

> ¿Conocemos todos los datos económicos mínimos requeridos para la modalidad elegida?

No mide urgencia, no decide handoff y no reemplaza `qualification_status`.

#### Financiación, crédito, plan de ahorro y usado + financiación

El perfil está completo únicamente cuando los cuatro campos siguientes están `known`, no están en conflicto y tienen evidencia suficiente:

1. `model_interest` exacto;
2. `purchase_modality` definida;
3. `cash_available`, incluso cuando su valor conocido sea `$0`;
4. `target_installment` o cuota mensual viable.

Si `has_trade_in=yes`, también deben estar conocidos:

5. `trade_in.brand`;
6. `trade_in.model`;
7. `trade_in.version`;
8. `trade_in.year`;
9. `trade_in.km`.

La tasación del usado no es requisito para completar este perfil. Si existe usado, `commercial_profile_complete=true` exige los cuatro campos anteriores más `trade_in_profile_complete=true`, aunque `trade_in_valuation_status=pending`.

Reglas de interpretación:

- Un monto exacto, rango o máximo declarado puede completar el campo correspondiente.
- `cash_available=0` cuenta como dato conocido si el cliente expresó claramente que no dispone de efectivo inicial. Esto no implica por sí solo descalificación.
- “Busco una cuota baja” no completa `target_installment`; debe existir monto, rango, máximo o aceptación explícita de una cuota autorizada presentada.
- La IA puede presentar `campaign_installment_anchor` como referencia sólo si fue recuperada en ese momento de la fuente estructurada, vigente y autorizada.
- La cuota de campaña no completa `target_installment` hasta que el cliente la acepta o informa otro monto viable.
- La aceptación del cliente es la evidencia de `target_installment`; campaña y cliente deben conservarse como fuentes relacionadas, no confundidas.
- “Tengo un usado” activa inmediatamente `has_trade_in=yes`, la etiqueta `con_usado` y los cinco campos objetivo, pero no completa `cash_available`, `trade_in_profile_complete` ni una valuación.
- `trade_in_profile_complete=true` sólo cuando marca, modelo, versión, año y km están conocidos, sin contradicción y con evidencia suficiente. No exige valor económico.
- `trade_in_customer_estimate` conserva cualquier monto declarado por el cliente como estimación, pero nunca integra `initial_capacity.known_amount` ni se presenta como tasación oficial.
- `trade_in_authorized_value` sólo puede provenir de una fuente o tasación autorizada. El LLM no puede proponerlo, copiarlo desde aprendizajes ni convertir una estimación del cliente.
- La falta de tasación no agrega campos a `missing_commercial_fields` y no impide `commercial_profile_complete=true`.
- Una vez completo el perfil descriptivo del usado en una operación relevante, el proceso de tasación pasa a `pending` sin seguir interrogando al cliente; la solicitud y resolución son tareas comerciales posteriores.
- Los cinco datos del usado se extraen aunque lleguen juntos y sólo se solicitan los faltantes.
- La marca puede normalizarse desde un catálogo autorizado cuando el modelo identifica inequívocamente al fabricante; si existe ambigüedad, `trade_in.brand` permanece faltante.
- Un valor `conflicting` se considera faltante hasta ser resuelto.

#### Cálculo determinístico de `initial_capacity`

`initial_capacity` no debe ser un escalar aislado, porque puede existir una parte conocida y otra pendiente. Debe conservar como mínimo:

- `known_amount`: suma de componentes autorizados conocidos;
- `cash_component`: el valor de `cash_available` cuando está conocido;
- `trade_in_authorized_component`: el valor de `trade_in_authorized_value` cuando está autorizado;
- `status`: `unknown`, `partial` o `complete`;
- `pending_components`: componentes aplicables todavía no autorizados.

Fórmula única:

`initial_capacity.known_amount = cash_available conocido + trade_in_authorized_value autorizado`

La estimación del cliente queda fuera de la suma. El estado se decide así:

| Situación | `known_amount` | `status` |
|---|---:|---|
| No se conoce efectivo ni existe valor autorizado | sin valor | `unknown` |
| Efectivo conocido y no existe usado | efectivo | `complete` |
| Efectivo conocido, incluso `$0`, y el usado espera tasación | efectivo | `partial` |
| Efectivo conocido y usado con valor autorizado | efectivo + valor autorizado | `complete` |
| Efectivo desconocido y usado con valor autorizado | valor autorizado | `partial` |

`known_amount=0` con efectivo confirmado en `$0` es distinto de `unknown`. Si existe un usado pendiente, el resultado es `$0` conocido con estado `partial`.

#### Estado de valuación del usado

La precedencia evita que una única enumeración sea ambigua:

1. `authorized`: existe una valuación autorizada vigente;
2. `pending`: se abrió la tasación y todavía no existe valor autorizado, aunque también haya una estimación del cliente;
3. `customer_estimate`: existe sólo una estimación del cliente y aún no se abrió la tasación;
4. `not_requested`: no existe estimación ni solicitud de tasación.

La estimación del cliente permanece almacenada aunque el estado avance a `pending` o `authorized`. Completar los cinco datos descriptivos en una operación con usado habilita la solicitud de tasación y el estado `pending`, pero no genera nuevas preguntas al cliente.

#### Contado

El perfil comercial está completo cuando:

1. `model_interest` está confirmado;
2. `purchase_modality=cash` está confirmada;
3. existe intención comercial `active` o `action_ready`.

`cash_available` y `target_installment` quedan `not_applicable` y nunca aparecen en `missing_commercial_fields`.

#### Modalidad desconocida o indecisa

- Se incluyen `model_interest` y/o `purchase_modality` si faltan.
- Hasta definir la modalidad no se agregan preventivamente `cash_available` ni `target_installment`, porque podrían no corresponder si el cliente elige contado.
- Si todas las modalidades consideradas pertenecen a la familia financiada, pueden marcarse también los campos económicos faltantes aunque la modalidad específica siga `undecided`.

#### Resultado y conducta

| Situación | `commercial_profile_complete` | Conducta |
|---|---:|---|
| Perfil financiado sin usado con los cuatro campos válidos | true | No preguntar más por economía; resumir y avanzar |
| Perfil financiado con usado, efectivo, cuota y cinco datos descriptivos válidos | true | No preguntar por tasación; abrir o continuar el proceso posterior y avanzar |
| Contado con modelo, modalidad e intención activa | true | No preguntar anticipo ni cuota |
| `qualified` pero faltan campos económicos | false | Mantener `qualified`; intentar obtener un faltante por vez si la IA puede seguir aportando valor |
| `hot`, seña, visita o pedido humano | true o false | No retrasar; ejecutar handoff y entregar la lista de faltantes al humano |
| `handoff_required` o `handed_off` | true o false | La IA no continúa interrogando; los faltantes pasan al responsable humano |
| `unqualified` | false | `missing_commercial_fields=[]`; no continuar recolectando. La completitud no es aplicable comercialmente |

#### Prioridad para preguntar faltantes

1. Responder primero la consulta concreta del cliente.
2. Si falta, confirmar `purchase_modality`.
3. Si el cliente acaba de mencionar un usado, continuar ese hilo pidiendo un único grupo lógico faltante: marca/modelo; luego versión/año; luego km.
4. En operaciones financiadas, obtener `cash_available`, incluida la confirmación explícita de `$0`.
5. Luego obtener `target_installment`; puede usarse una cuota vigente como ancla autorizada.
6. Hacer una sola pregunta o grupo lógico estrechamente relacionado por turno.
7. Si el cliente aporta múltiples datos espontáneamente, extraerlos todos sin volver a preguntarlos.
8. Suspender la recolección ante cualquier causal de `handoff_required`.

Esta prioridad es conversacional; no altera la precedencia de calificación ni de handoff.
La lista de faltantes no es una orden automática de interrogatorio: sólo habilita la próxima pregunta cuando sea pertinente, aporte valor y el cliente mantenga disposición a conversar.

## 4. Matriz de `qualification_status`

### `unqualified`

**Condición suficiente:** al menos una causal inequívoca:

- búsqueda de empleo, proveedores, spam o tema ajeno;
- número equivocado;
- solicitud explícita de no contacto;
- inexistencia de intención comercial y rechazo definitivo;
- operación fuera del negocio confirmado de Grupo Sur.

**Señales negativas:** rechazo definitivo, opt-out, fraude/spam, contacto inválido, propósito no comercial.

**Casos límite:** “ahora no” no equivale a rechazo definitivo; “no tengo anticipo” no descalifica; un reclamo de cliente existente puede ser `unqualified` como lead nuevo y simultáneamente requerir handoff.

### `qualified`

**Condiciones necesarias:** intención comercial real, evidencia confiable, ausencia de causal de descalificación y cumplimiento de una de las dos vías definidas.

**Condiciones suficientes:** vía normal completa, vía inmediata o contado explícito según la definición anterior.

**Señales positivas:** modelo confirmado, modalidad, capacidad, usado detallado, plazo conocido, visita, seña, documentación, respuestas espontáneas útiles.

**Señales negativas:** datos centrales contradictorios, intención meramente exploratoria y ausencia de modelo exacto. Un plazo lejano reduce temperatura/prioridad, pero no borra una calificación ya sustentada.

**Casos límite:** un lead puede estar muy caliente y seguir en `follow_up` si no se conoce qué producto quiere. Tener muchos datos irrelevantes tampoco lo califica.

### `follow_up`

Es el estado por defecto para un posible lead comercial que no cumple todavía `qualified` ni `unqualified`.

Incluye interés exploratorio, información central incompleta, contradicciones abiertas, compra lejana, falta explícita de capacidad actual con interés futuro y leads calientes incompletos enviados a una persona.

### Precedencia

1. Opt-out, contacto inválido o propósito ajeno inequívoco → `unqualified`.
2. Si un campo imprescindible está `conflicting`, no puede utilizarse para `qualified`.
3. Si se cumple vía inmediata → `qualified`.
4. Si se cumple vía normal → `qualified`.
5. En cualquier otro caso comercial → `follow_up`.

## 5. Matriz de `commercial_temperature`

### `hot`

**Condición suficiente:** una señal inequívoca de acción inmediata:

- seña `ready` o `confirmed`;
- visita solicitada/programada dentro de siete días;
- compra explícita dentro de siete días junto con alguna señal de capacidad o compromiso;
- documentación lista y pedido de avanzar;
- pedido humano ligado a una acción concreta inmediata.

**Señales positivas:** “hoy”, “esta semana”, disponibilidad para transferir/señar, visita concreta, decisión tomada.

**Señales negativas:** curiosidad general, plazo indefinido, comparación sin intención, falta total de capacidad declarada.

### `warm`

**Condición suficiente:** intención `active` con participación constructiva, pero sin acción inmediata.

Ejemplos: modelo definido, modalidad considerada, responde datos, plazo entre 8 y 90 días, busca precio/cuota para decidir, tiene anticipo o usado.

### `cold`

**Condición suficiente:** intención `none` o `exploratory` débil, compra lejana, falta explícita de capacidad actual sin alternativa inmediata, más de 24 horas de silencio como señal inicial o estado `unqualified`.

### Precedencia

1. `unqualified` → `cold`.
2. Acción inmediata confirmada → `hot`.
3. Interés activo → `warm`.
4. Exploratorio, lejano o sin respuesta → `cold`.

La temperatura puede subir o bajar con nueva evidencia. No se reduce automáticamente por omitir un dato ni por enviar el primer reminder a las dos horas. El umbral inicial de 24 horas por silencio debe calibrarse con Evals y datos reales.

## 6. Matriz de `handoff_status`

### `continue_ai`

La IA puede aportar valor, queda una próxima pregunta concreta y no existe causal humana obligatoria.

### `handoff_recommended`

Debe ponerse el lead a disposición del equipo sin cortar necesariamente la respuesta actual:

- `qualified + warm`;
- `follow_up + hot` cuando un vendedor puede capturar la oportunidad aunque falten datos;
- tasación o negociación que necesita criterio humano;
- objeción comercial compleja no resuelta;
- información autorizada insuficiente, pero sin urgencia;
- cliente desconfiado que todavía acepta continuar.

Es un estado no bloqueante: mientras ninguna persona haya aceptado la conversación y no aparezca una causal de `handoff_required`, la IA puede seguir respondiendo y completar un campo comercial faltante por vez.

### `handoff_required`

La IA debe dejar de conducir el intercambio y pedir intervención humana:

- solicitud humana explícita o repetida;
- `qualified + hot`;
- seña, documentación sensible o visita inmediata;
- reclamo, privacidad, amenaza legal o incidente sensible;
- frustración clara con la IA;
- repetición de una pregunta ya respondida;
- dos intentos consecutivos sin obtener ningún dato nuevo mientras el cliente continúa respondiendo;
- contradicción de routing TikTok que necesita Supervisor;
- límite operacional de conversación alcanzado, cualquiera sea la calificación;
- afirmación necesaria que no puede validarse y bloquea la decisión del cliente.

### `handed_off`

Estado terminal operativo: una persona o cola responsable aceptó la conversación y el sistema registró propietario y fecha. Decir “te paso con un asesor” no alcanza.

### Precedencia y transición

1. Si ya está `handed_off`, se conserva hasta una liberación humana explícita.
2. Si aparece una causal obligatoria, `handoff_required` domina a `recommended` y `continue_ai`.
3. Si está `qualified + warm`, al menos `handoff_recommended`.
4. Si no hay causal, `continue_ai`.
5. `handoff_required` sólo pasa a `handed_off` cuando existe aceptación/propietario verificable.

### Estado de conversación y no contacto

- `open`: el hilo admite continuidad activa de IA o humano.
- `paused`: no se envía otra respuesta automática hasta un evento definido, como aceptación de handoff, fecha de nutrición o vencimiento de espera.
- `closed`: el motivo quedó resuelto o cerrado y no continúa la calificación.
- `do_not_contact=true`: bloquea toda salida automática futura, incluidos reminders y campañas.

Opt-out y número equivocado producen `closed + do_not_contact=true`. Empleo, proveedor, spam u otra consulta ajena correctamente cerrada producen `closed + do_not_contact=false`, salvo pedido explícito de no contacto. Handoff pendiente que exige silencio de IA produce `paused`; un humano activo puede coexistir con `open + handed_off`. `handoff_status` nunca representa cierre y `conversation_status` nunca representa propiedad de la conversación.

Los reminders se registran como eventos automáticos separados y se excluyen del límite de intervenciones comerciales sustantivas.

## 7. Matriz de etiquetas comerciales

| Etiqueta | Se activa cuando | No se activa cuando | Regla |
|---|---|---|---|
| `financiacion` | modalidad financiación, crédito o usado + financiación | sólo pregunta genérica sin expresar interés | Crédito implica también financiación |
| `plan_de_ahorro` | expresa interés o decisión por plan de ahorro | usa “plan” con otro sentido | Puede coexistir con otras modalidades si las compara |
| `contado` | expresa pago total o compra al contado | sólo pregunta precio | Es modalidad primaria si fue confirmada como elección |
| `credito` | solicita o posee crédito prendario/bancario/terminal | usa “crédito” en sentido no financiero | Implica `financiacion` |
| `con_usado` | `has_trade_in=yes` | pregunta si Grupo Sur toma usados sin afirmar que tiene uno | No exige tener toda la ficha del usado |
| `urgente` | temperatura hot por plazo/acción | usa “urgente” sin intención comercial real | Debe existir evidencia comercial |
| `desconfiado` | objeción de confianza/fraude/concesionaria abierta | pregunta razonable por condiciones | Sólo interna y con evidencia textual |
| `precio` | solicita, compara o negocia precio, cuota, anticipo o costo | no hubo conversación monetaria | No autoriza responder un valor no validado |
| `sin_capacidad_economica_detectada` | declara explícitamente no poder afrontar anticipo/cuota y no ofrece alternativa | no informó dinero | Nunca inferir por zona, lenguaje, demora o falta de datos |
| `cambio_de_modelo` | corrige el modelo del anuncio o uno previamente confirmado | agrega una segunda opción para comparar | Preserva modelo anterior y nuevo |

Las etiquetas no deciden por sí solas calificación ni handoff. Son consecuencias de datos validados.

## 8. Datos contradictorios

### Orden de autoridad

1. Datos personales/preferencias: declaración explícita más reciente del cliente.
2. Información comercial: base estructurada autorizada y vigente.
3. Producto anunciado: referencia Meta como interés inicial, subordinada a corrección del cliente.
4. Identidad del asesor: registro de asesores activos y coincidencia única.
5. Inferencia LLM: nunca prevalece sobre una fuente determinística.

### Reglas

- Una corrección explícita (“no, en realidad...”, “me equivoqué...”) reemplaza el valor anterior y guarda historial.
- Dos valores diferentes sin señal de corrección dejan el campo en `conflicting`.
- Un campo `conflicting` no suma para calificación, temperatura ni etiqueta sensible.
- La IA debe aclarar un solo conflicto central por turno.
- Si el conflicto afecta routing, precio, seña, privacidad o identidad, se requiere intervención humana.
- Si código TikTok y nombre apuntan a personas distintas, no se asigna automáticamente.
- Si TikTok fue mencionado pero el identificador está ausente y todavía no se preguntó, la IA pide una única vez el código o el nombre y apellido del asesor; conserva `continue_ai` salvo otra causal independiente.
- Un identificador inválido, ambiguo, contradictorio o irresoluble después de ese intento exige resolución de Supervisor y no autoriza asignación automática.
- Si una fuente comercial contradice un documento RAG, prevalece la fuente estructurada vigente y se registra el conflicto documental.

## 9. Casos de prueba

Abreviaturas de etiquetas: `FIN`, `PLAN`, `CONT`, `CRED`, `USADO`, `URG`, `DESC`, `PRECIO`, `SIN_CAP`, `CAMBIO`.  
Abreviaturas de campos faltantes: `MOD=model_interest`, `MDA=purchase_modality`, `CASH=cash_available`, `CUO=target_installment`, `TBR=trade_in.brand`, `TMO=trade_in.model`, `TVE=trade_in.version`, `TAN=trade_in.year`, `TKM=trade_in.km`. `—` significa lista vacía. La tasación nunca integra esta lista.

| # | Conversación / situación | Qualification | Temp. | Handoff | Perfil completo | Faltantes | Etiquetas | Fundamento |
|---:|---|---|---|---|---:|---|---|---|
| 1 | “Hola” sin anuncio ni dato adicional | follow_up | cold | continue_ai | false | MOD, MDA | — | Sin intención ni modalidad |
| 2 | Entra por anuncio inequívoco de financiación de Tera y pide “más información” | follow_up | warm | continue_ai | false | CASH, CUO | FIN | Modelo y financiación conocidos desde `meta_ad`; no preguntar modalidad |
| 3 | Anuncio inequívoco de financiación de Tera: “¿Qué precio tiene?” | follow_up | warm | continue_ai | false | CASH, CUO | FIN, PRECIO | Responder con fuente vigente; puede anclar cuota y pedir validación |
| 4 | “Quiero Tera financiada, tengo $5M y puedo pagar hasta $600.000 por mes” | qualified | warm | handoff_recommended | true | — | FIN, PRECIO | Vía normal y perfil económico completo |
| 5 | “La Tera la compraría al contado, pasame precio” | qualified | warm | handoff_recommended | true | — | CONT, PRECIO | Regla específica de contado; CASH y CUO no aplican |
| 6 | “Amarok por plan, tengo $15M y compraría este mes” | qualified | warm | handoff_recommended | false | CUO | PLAN, PRECIO | Qualified por capacidad/plazo; falta cuota viable |
| 7 | “Quiero un 208 por plan; no tengo efectivo inicial y hoy no puedo afrontar ninguna cuota” | follow_up | cold | continue_ai | false | CUO | PLAN, SIN_CAP | `cash_available=0` es conocido; no existe cuota viable |
| 8 | “Nivus con crédito; puedo pagar hasta $700.000 por mes” | qualified | warm | handoff_recommended | false | CASH | FIN, CRED, PRECIO | Qualified por cuota; falta efectivo inicial |
| 9 | “Busco algún SUV, tengo $10M y quiero comprar esta semana” | follow_up | hot | handoff_recommended | false | MOD, MDA | URG, PRECIO | No retrasar oportunidad; faltan modelo exacto y modalidad |
| 10 | “Quiero comprar hoy, que me llame alguien”, sin modelo | follow_up | hot | handoff_required | false | MOD, MDA | URG | Se deriva sin completar perfil |
| 11 | “Quiero ver la Tera hoy en la concesionaria” | qualified | hot | handoff_required | false | MDA | URG | Acción inmediata; no preguntar economía antes del handoff |
| 12 | “Quiero señar una Nivus ahora” | qualified | hot | handoff_required | false | MDA | URG | Seña inmediata domina cualquier faltante |
| 13 | “Quiero hablar con un vendedor”, sin más datos | follow_up | warm | handoff_required | false | MOD, MDA | — | Pedido humano no equivale a perfil completo |
| 14 | Tera + financiación + anticipo, luego pide una persona | qualified | warm | handoff_required | false | CUO | FIN, PRECIO | El humano recibe el campo pendiente; la IA no demora |
| 15 | Con Tera financiada, dos intentos de IA no obtienen CASH ni CUO aunque el cliente sigue respondiendo | follow_up | warm | handoff_required | false | CASH, CUO | FIN | Agotamiento sin cambiar calificación ni completar artificialmente |
| 16 | Con Nivus por plan: “Ya te expliqué tres veces, no me preguntes lo mismo”; no hay CASH ni CUO utilizables | follow_up | warm | handoff_required | false | CASH, CUO | PLAN | Frustración: detener preguntas y entregar faltantes |
| 17 | “No confío, ¿esto es una estafa? Quiero comprobarlo”, sin modelo/modalidad | follow_up | warm | handoff_required | false | MOD, MDA | DESC | Objeción grave; el perfil no retrasa la atención humana |
| 18 | Cliente existente reclama un cobro y amenaza acción legal | unqualified | cold | handoff_required | false | — | — | Perfil no aplicable; atención humana obligatoria |
| 19 | “Quiero dejar mi CV” | unqualified | cold | continue_ai* | false | — | — | Perfil no aplicable; cerrar sin handoff comercial |
| 20 | Proveedor ofrece servicios de limpieza | unqualified | cold | continue_ai* | false | — | — | Motivo ajeno |
| 21 | “Número equivocado, no me escriban más” | unqualified | cold | continue_ai* | false | — | — | Opt-out; no recolectar datos |
| 22 | “No me interesa, eliminen mi contacto” | unqualified | cold | continue_ai* | false | — | — | Opt-out explícito |
| 23 | “Quizás compre una Tera el año que viene” | follow_up | cold | continue_ai | false | MDA | — | Compra lejana; modalidad pendiente |
| 24 | “Tera financiada, tengo $5M, pero sería dentro de seis meses” | follow_up | cold | continue_ai | false | CUO | FIN, PRECIO | Buen perfil parcial, fuera del horizonte y sin cuota viable |
| 25 | “Quiero Tera financiada”, sin capacidad, plazo ni acción | follow_up | warm | continue_ai | false | CASH, CUO | FIN | Modelo + modalidad no completan perfil ni calificación |
| 26 | “Quiero Tera financiada y tengo un usado que para mí vale $8M”, sin detalles ni efectivo declarado | follow_up | warm | continue_ai | false | CASH, CUO, TBR, TMO, TVE, TAN, TKM | FIN, USADO, PRECIO | Estimación `customer_estimate`; no integra capacidad; faltan efectivo, cuota y los cinco datos descriptivos |
| 27 | “Tera financiada; tengo $3M y entrego un Volkswagen Gol Trendline 2020 con 70.000 km. Puedo pagar $450.000 por mes”; tasación abierta | qualified | warm | handoff_recommended | true | — | FIN, USADO, PRECIO | Perfil comercial y usado completos; valuación `pending`; `initial_capacity.known_amount=$3M`, estado `partial` |
| 28 | “Tengo un Corolla 2020 de 50.000 km y busco cambiarlo por un 0 km”, sin modelo/modalidad | follow_up | warm | continue_ai | false | MOD, MDA, TVE | USADO | Toyota/Corolla/año/km extraíbles; falta versión además de operación nueva |
| 29 | “Buscaba Polo... no, en realidad Nivus” | follow_up | warm | continue_ai | false | MDA | CAMBIO | Nivus reemplaza Polo; modalidad pendiente |
| 30 | Anuncio Tera: “Prefiero Amarok financiada y tengo $10M” | qualified | warm | handoff_recommended | false | CUO | FIN, PRECIO, CAMBIO | Modelo y modalidad explícitos del cliente prevalecen sobre Meta |
| 31 | Con modelo conocido: “La quiero al contado o por plan, todavía no decidí” | follow_up | warm | continue_ai | false | MDA | CONT, PLAN | Modalidad primaria indecisa; no preguntar cuota prematuramente |
| 32 | Tera financiada: primero $3M; luego “me equivoqué, son $8M”; no informó cuota | qualified | warm | handoff_recommended | false | CUO | FIN, PRECIO | Corrección resuelta; falta cuota objetivo |
| 33 | Tera financiada: “Tengo $3M... también $8M de efectivo inicial”, sin aclarar ni informar cuota | follow_up | warm | continue_ai | false | CASH, CUO | FIN, PRECIO | `cash_available` contradictorio se considera faltante |
| 34 | TikTok con código válido, sólo dice “hola” | follow_up | cold | continue_ai | false | MOD, MDA | — | Routing asignado no completa perfil |
| 35 | TikTok nombra inequívocamente asesor activo y pide Tera por plan, sin otro dato | follow_up | warm | continue_ai | false | CASH, CUO | PLAN | IA puede seguir completando mientras el vendedor está asignado |
| 36 | TikTok menciona asesor ambiguo y consulta por Tera, sin modalidad | follow_up | warm | handoff_required | false | MDA | — | Supervisor resuelve routing; no se demora por perfil |
| 37 | TikTok: Tera por plan con dos códigos válidos de vendedores distintos | follow_up | warm | handoff_required | false | CASH, CUO | PLAN | Conflicto de routing; faltantes se entregan a Supervisor |
| 38 | Con modelo conocido: “¿Qué motor tiene?”; no existe ficha autorizada y no indicó modalidad | follow_up | warm | handoff_recommended | false | MDA | — | No inventar; modalidad puede preguntarse si no bloquea el handoff |
| 39 | “Quiero este modelo por plan, tengo $9M y la cuota vigente de $465.000 me sirve” con fuente válida | qualified | warm | handoff_recommended | true | — | PLAN, PRECIO | Campaña aporta el ancla; aceptación del cliente aporta CUO |
| 40 | Entra por anuncio inequívoco con modelo y financiación; pasaron más de 24 horas desde el primer reminder sin respuesta | follow_up | cold | continue_ai | false | CASH, CUO | FIN | Modalidad Meta conocida; el silencio prolongado enfría, pero no completa ni descalifica |

## 10. Verificación de consistencia

Las reglas anteriores respetan estos invariantes:

1. Ningún handoff cambia automáticamente `qualification_status`.
2. Ningún límite de conversación produce `qualified`.
3. `hot` puede coexistir con `follow_up`.
4. `qualified` puede coexistir con `hot`, `warm` o `cold`; el plazo nunca borra una calificación sustentada.
5. `unqualified` siempre produce `cold`, aunque pueda requerir atención humana por reclamo.
6. `handed_off` exige aceptación verificable; la mera asignación de routing no alcanza.
7. Un modelo corregido por el cliente prevalece sobre Meta Ads.
8. Los datos contradictorios nunca suman para calificar.
9. Las etiquetas describen hechos/intereses y no reemplazan la matriz.
10. “Sin capacidad económica detectada” sólo surge de declaración explícita.
11. Una ausencia de datos nunca se interpreta como rechazo o incapacidad.
12. RAG, aprendizajes y prompt no tienen autoridad sobre precios vigentes de la base comercial.
13. `commercial_profile_complete=false` nunca reduce automáticamente un lead `qualified` a `follow_up`.
14. `commercial_profile_complete=true` nunca convierte por sí solo un lead en `qualified` ni en `hot`.
15. Todo perfil incompleto comercialmente aplicable debe tener `missing_commercial_fields` exacto y coherente con la modalidad.
16. En contado, `cash_available` y `target_installment` nunca son obligatorios.
17. Una causal de `handoff_required` suspende la recolección de campos faltantes.
18. Una modalidad Meta inequívoca se considera conocida hasta que el cliente la corrija explícitamente.
19. `campaign_installment_anchor` nunca equivale por sí solo a `target_installment`.
20. `has_trade_in=yes` nunca equivale por sí solo a efectivo conocido, perfil descriptivo completo ni valor autorizado.
21. Si existe usado, el perfil financiado completo requiere marca, modelo, versión, año y km, además de modelo 0 km, modalidad, efectivo y cuota; no requiere tasación.
22. `trade_in_customer_estimate` nunca integra `initial_capacity.known_amount`.
23. `initial_capacity` nunca es calculada ni inferida por el LLM.
24. `trade_in_valuation_status=pending` no puede bloquear `commercial_profile_complete=true`.
25. `conversation_status` y `do_not_contact` no se infieren desde handoff ni lo reemplazan.
26. El reminder de dos horas conserva la temperatura previa; sólo el silencio de al menos 24 horas actúa inicialmente como señal de enfriamiento.
27. Los reminders no integran el límite de intervenciones comerciales sustantivas.
28. La ausencia inicial de identificador TikTok no exige Supervisor antes de la única pregunta permitida.
29. La falta económica actual con intención exploratoria/futura no produce `unqualified` por sí sola.

No se detectan contradicciones lógicas internas si se respetan estos invariantes.

## 11. Decisiones de negocio pendientes

1. **Compra de usados:** confirmar si una persona que quiere comprar solamente un usado es `unqualified`, se deriva a otra unidad o queda `follow_up`.
2. **Límite operacional:** definir el máximo absoluto configurable de intervenciones comerciales sustantivas de IA; reminders excluidos. Sólo dispara handoff, nunca calificación.
3. **SLA de aceptación:** definir cuánto tiempo puede permanecer `handoff_required` sin dueño antes de escalar a Supervisor.
4. **Handoff recomendado:** decidir si la IA puede seguir respondiendo mientras espera aceptación o si debe pausar después del mensaje de derivación.
5. **Nutrición de qualified + cold:** definir cadencia y responsable sin degradar la calificación.
6. **Etiqueta sensible:** confirmar quién puede ver `sin_capacidad_economica_detectada` y durante cuánto tiempo. Se recomienda que sea interna, temporal y revisable.
7. **Desconfianza:** definir si toda etiqueta `desconfiado` requiere Supervisor o sólo los casos graves/repetidos.
8. **TikTok asignado:** confirmar si el vendedor asignado recibe una alerta inmediata aunque la IA continúe calificando.
9. **Temperatura por silencio:** calibrar con datos reales el umbral inicial de 24 horas.

## 12. Criterios de aceptación para la futura implementación

- 100% de los estados deben incluir razones y evidencia.
- 0 casos en los que handoff por agotamiento cambie el lead a `qualified`.
- 100% de cambios explícitos de modelo deben respetar la última preferencia del cliente.
- 0 asignaciones TikTok cuando existan identificadores contradictorios.
- 0 precios, cuotas, stock o vigencias sin fuente estructurada válida.
- 0 inferencias de incapacidad económica por ausencia de información.
- 100% de `handed_off` con responsable y fecha de aceptación.
- 100% de opt-outs con bloqueo de futuros envíos automáticos.
- 100% de operaciones financiadas completas con modelo, modalidad, CASH y CUO respaldados.
- 0 oportunidades hot, señas, visitas o pedidos humanos demorados para completar CASH/CUO.
- 100% de perfiles incompletos con `missing_commercial_fields` consistente con la modalidad.
- 0 operaciones de contado marcadas incompletas por falta de CASH o CUO.
- 0 preguntas de modalidad cuando una campaña Meta inequívoca ya la aportó.
- 0 cuotas utilizadas como ancla sin campaña vigente y procedencia registrada.
- 0 cuotas de campaña convertidas en CUO sin aceptación o monto alternativo del cliente.
- 100% de usados detectados con `has_trade_in=yes` desde la primera mención.
- 0 estimaciones de clientes incorporadas a `initial_capacity.known_amount`.
- 100% de perfiles con usado con faltantes individuales de marca, modelo, versión, año y km.
- 100% de cálculos de `initial_capacity` reproducibles por la fórmula determinística.
- 100% de usados descriptivamente completos marcados como tales aunque su valuación siga pendiente.
- Los 40 casos de este documento deben aprobarse antes de activar la matriz en producción.

## 13. Cambios incorporados en versión 1.2

> Registro histórico: las referencias `ANT` y `available_advance` de esta sección describen la versión 1.2 y quedan sustituidas por la separación definida en la versión 1.3.

### Reglas modificadas

1. Meta Ads puede establecer `model_interest` y `purchase_modality` iniciales con fuente, confianza y campaña/anuncio.
2. La declaración posterior del cliente prevalece sobre la modalidad Meta y conserva el historial.
3. Una cuota vigente puede utilizarse como ancla, pero sólo el cliente puede convertirla en `target_installment` al aceptarla.
4. Valores de cuota nunca se toman del prompt ni de aprendizajes.
5. `has_trade_in=yes` se registra desde la primera mención del usado.
6. El usado tiene cinco campos objetivo mínimos: marca, modelo, versión, año y km.
7. Un usado sin valuación no representa un monto concreto de `available_advance`.
8. La IA extrae todos los datos espontáneos y pregunta únicamente un campo o grupo lógico faltante por turno.
9. En anuncios financiados, el recorrido ideal busca modelo, modalidad, ANT, CUO y, si corresponde, los cinco datos del usado.

### Casos cuyo resultado cambió

| Caso | Antes | Versión 1.2 | Motivo |
|---:|---|---|---|
| 2 | Faltaba MDA; sin etiqueta | Faltan ANT y CUO; etiqueta FIN | La campaña financiada aporta modalidad inicial |
| 3 | Faltaba MDA; sólo PRECIO | Faltan ANT y CUO; FIN + PRECIO | No se pregunta modalidad y puede utilizarse ancla de cuota |
| 26 | Faltaban ANT y CUO | Faltan ANT, CUO y los cinco campos `trade_in.*` | “Tengo un usado” sólo confirma existencia |
| 27 | Perfil completo | Perfil incompleto; falta `trade_in.version` | Los cinco datos del usado son obligatorios para completitud |
| 28 | Faltaban MOD y MDA | También falta `trade_in.version` | Los otros datos del usado ya fueron aportados o normalizados |
| 40 | Faltaba MDA | Faltan ANT y CUO; etiqueta FIN | La modalidad ya proviene del anuncio financiado |

Los casos 30 y 39 no cambian de dimensión: en el 30 se explicita que el cliente prevalece sobre Meta; en el 39 se separa la fuente del ancla de cuota de la evidencia de aceptación del cliente.

## 14. Ejemplos conversacionales de referencia

Los marcadores `[CUOTA_VIGENTE_AUTORIZADA]` y `[PRECIO_CONTADO_AUTORIZADO]` representan valores recuperados en tiempo real de la fuente comercial estructurada. No son texto fijo del prompt.

### 1. Financiación con anticipo

**Contexto:** anuncio financiado de Peugeot 208. Modelo y modalidad ya conocidos.

**Cliente:** “Hola, quiero información.”  
**IA:** “Claro. Para el Peugeot 208 hay una propuesta de financiación vigente. Antes de avanzar, ¿con qué monto inicial contás aproximadamente?”  
**Cliente:** “Tengo $5.000.000.”  
**IA:** “Perfecto, registro $5.000.000 de disponibilidad inicial. La alternativa vigente parte de `[CUOTA_VIGENTE_AUTORIZADA]` mensuales. ¿Ese valor te resulta viable?”  
**Cliente:** “Sí, esa cuota me sirve.”

Resultado: `cash_available=$5.000.000`, CUO conocido e `initial_capacity={known_amount:$5.000.000,status:complete}`; perfil completo.

### 2. Financiación sin anticipo

**Cliente:** “Me interesa financiarlo, pero no tengo anticipo.”  
**IA:** “Entiendo, registro que hoy tu disponibilidad inicial en efectivo es $0. No voy a prometer una condición que no esté vigente: para este modelo la referencia autorizada parte de `[CUOTA_VIGENTE_AUTORIZADA]`. ¿Qué cuota mensual podrías sostener cómodamente?”

`cash_available=0` queda conocido. El lead no se descalifica; CUO permanece pendiente hasta una respuesta viable. Sin usado, `initial_capacity={known_amount:0,status:complete}`.

### 3. Usado incompleto

**Cliente:** “Tengo un Volkswagen Gol.”  
**IA:** “Perfecto, ya registré Volkswagen Gol. ¿Qué versión y año es?”  
**Cliente:** “Trendline 2020.”  
**IA:** “Bien, Volkswagen Gol Trendline 2020. ¿Cuántos kilómetros tiene aproximadamente?”

La IA no vuelve a preguntar marca, modelo, versión ni año.

### 4. Usado completo

**Cliente:** “Entrego un Volkswagen Gol Trendline 2020 con 70.000 km.”  
**IA:** “Perfecto, ya registré todos los datos del Gol. Podemos avanzar con la tasación por separado. Para ordenar la financiación, ¿con cuánto efectivo contás inicialmente?”

Se extraen los cinco campos espontáneamente y `trade_in_profile_complete=true`. La tasación pasa a `pending`; no es requisito para completar el perfil comercial. La IA sólo pregunta `cash_available` porque es el faltante económico aplicable.

### 5. Cuota vaga

**Cliente:** “Busco una cuota baja.”  
**IA:** “Entiendo. Hoy la alternativa vigente para este modelo parte de `[CUOTA_VIGENTE_AUTORIZADA]` mensuales. ¿Ese valor te resulta cómodo o necesitás estar por debajo?”

“Cuota baja” no completa CUO. El valor mostrado conserva campaña, vigencia y fuente.

### 6. Cuota confirmada

**IA:** “La alternativa vigente parte de `[CUOTA_VIGENTE_AUTORIZADA]` mensuales. ¿Ese valor te resulta viable?”  
**Cliente:** “Sí, esa cuota me sirve.”

Resultado: `target_installment=[CUOTA_VIGENTE_AUTORIZADA]`, con evidencia en la respuesta del cliente y referencia a la campaña que originó el valor.

### 7. Entra por anuncio financiado y cambia a contado

**Contexto inicial:** anuncio financiado de Peugeot 208.  
`model_interest=Peugeot 208`, `purchase_modality=financing`, `source=meta_ad`.

**Cliente:** “En realidad lo quiero pagar al contado.”  
**IA:** “Perfecto, entonces lo vemos al contado. El valor vigente es `[PRECIO_CONTADO_AUTORIZADO]`. ¿Querés que un asesor continúe con la disponibilidad?”

Resultado:

- `purchase_modality=cash`;
- fuente activa `customer`;
- modalidad Meta conservada en el historial;
- CASH y CUO `not_applicable`;
- `commercial_profile_complete=true` si la intención es activa;
- la IA no vuelve a preguntar anticipo ni cuota.

## 15. Cambios incorporados en versión 1.3

### Reglas modificadas

1. Se elimina `available_advance` como campo mixto y se reemplaza por `cash_available`, `trade_in_customer_estimate`, `trade_in_authorized_value` e `initial_capacity`.
2. `$0` es un valor conocido y válido para `cash_available`; no equivale a dato ausente ni descalificación.
3. La estimación del cliente se conserva como tal y nunca se suma a la capacidad autorizada.
4. `initial_capacity` es un resultado determinístico con `known_amount` y `status`; puede estar parcialmente determinada.
5. El perfil descriptivo del usado se independiza de su tasación mediante `trade_in_profile_complete` y `trade_in_valuation_status`.
6. Marca, modelo, versión, año y km completos bastan para `trade_in_profile_complete=true`.
7. En financiación con usado, la completitud comercial exige modelo, modalidad, efectivo, cuota y perfil descriptivo del usado; no exige una tasación autorizada.
8. La tasación pendiente no aparece en `missing_commercial_fields` ni habilita nuevas preguntas al cliente por sí sola.
9. Al completarse los cinco datos del usado en una operación relevante, la tasación puede abrirse como proceso posterior con estado `pending`.
10. La precedencia de valuación es `authorized` > `pending` > `customer_estimate` > `not_requested`; el monto estimado permanece almacenado por separado.

### Casos de prueba recalculados

| Caso | Versión 1.2 | Versión 1.3 | Motivo |
|---:|---|---|---|
| 2, 3, 8, 15, 16, 25, 26, 33, 35, 37, 40 | Faltante `ANT` | Faltante `CASH` | El efectivo ya no se mezcla con el usado |
| 5 | ANT y CUO no aplicables | CASH y CUO no aplicables | Nueva nomenclatura; resultado de dimensiones sin cambio |
| 7 | ANT=0 conocido | `cash_available=0` conocido | Cero explícito continúa siendo dato válido |
| 26 | La estimación del cliente podía completar parte del ANT | Faltan CASH, CUO y los cinco datos descriptivos; valuación `customer_estimate`; capacidad `unknown` | La estimación no completa efectivo ni integra `initial_capacity` |
| 27 | Perfil incompleto mientras faltaba un dato del usado | Perfil completo con los cinco datos, efectivo y cuota; valuación `pending`; capacidad parcial | La tasación posterior no bloquea completitud |
| 33 | ANT contradictorio | `cash_available` contradictorio | El efectivo en conflicto sigue tratándose como faltante |

Los casos 4, 6, 14, 24, 30, 32 y 39 mantienen sus cuatro dimensiones y su completitud; los montos iniciales allí declarados pasan a almacenarse como `cash_available`. Los demás casos no cambian.

### Resultado estructurado del caso 27

- `cash_available=3000000`;
- `trade_in_customer_estimate=null`;
- `trade_in_authorized_value=null`;
- `trade_in_profile_complete=true`;
- `trade_in_valuation_status=pending`;
- `initial_capacity.known_amount=3000000`;
- `initial_capacity.status=partial`;
- `initial_capacity.pending_components=[trade_in_authorized_value]`;
- `commercial_profile_complete=true`;
- `missing_commercial_fields=[]`.

La IA no formula otra pregunta para tasar el usado. La tasación continúa como tarea comercial separada.

## 16. Revisión arquitectónica final

No queda ninguna contradicción arquitectónica bloqueante dentro de la matriz. Quedan resueltas dos ambigüedades que podían producir implementaciones incompatibles:

1. `initial_capacity` debe representarse como monto conocido más estado, no como un número escalar que pretenda ser total cuando hay componentes pendientes.
2. `trade_in_valuation_status` aplica la precedencia definida; una estimación puede coexistir como dato con una tasación `pending` o `authorized` sin necesitar dos estados simultáneos.

`trade_in_profile_complete` sólo se evalúa como requisito cuando `has_trade_in=yes`. Para operaciones sin usado, su valor no participa en `commercial_profile_complete`; esto evita que un booleano `false` sea interpretado erróneamente como faltante.

## 17. Cambios incorporados en versión 1.4

1. Se oficializa `qualified + cold`: plazo lejano y nutrición afectan temperatura/prioridad, no una calificación ya sustentada.
2. Se incorporan como contrato definitivo `conversation_status=open|paused|closed` y `do_not_contact`.
3. Se fija como política inicial que el reminder de dos horas no enfría; 24 horas sin respuesta es señal de `cold` pendiente de calibración.
4. Los reminders quedan excluidos del límite conversacional.
5. TikTok sin identificador habilita una única pregunta por código o nombre completo; los casos inválidos, ambiguos, contradictorios o irresolubles escalan a Supervisor.
6. La falta económica actual con intención exploratoria o futura permanece `follow_up + cold`, salvo rechazo definitivo o ausencia inequívoca de intención futura.
7. Se eliminan las decisiones pendientes ya resueltas sobre horizonte de calificación y estado de cierre.
8. Esta versión absorbe íntegramente la revisión normativa `2026-08-26-candidate`; ese identificador deja de formar parte del contrato vigente.

**Compatibilidad:** la Matriz v1.4 es la referencia normativa del Golden Dataset v1.0.0. Cualquier cambio funcional posterior exige una nueva versión de matriz y una reevaluación explícita de compatibilidad.
