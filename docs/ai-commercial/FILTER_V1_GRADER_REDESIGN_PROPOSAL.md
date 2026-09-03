# Filter v1 — propuesta de rediseño del Grader

## Decisión

Grader v1.3 es evidencia histórica reproducible, no un contrato apto para Filter v1. La propuesta es crear un grader nuevo y versionado; no alterar v1.3. El artefacto declarado para v1.3 (`9daa4d58…`) no está presente como objeto recuperable en este checkout, por lo que la revisión se apoya en su contrato preservado, el Golden congelado, Matrix 1.4 y los graders anteriores visibles. Esta limitación impide afirmar equivalencia de implementación línea por línea, pero no impide detectar incompatibilidades contractuales.

## Dimensiones

| Dimensión actual | Dictamen | Diseño Filter v1 |
|---|---|---|
| Qualification | rediseñar | Derivada: `qualified` si el perfil requerido está completo; `follow_up` si faltan componentes; `unqualified` sólo por exclusión comercial. |
| Commercial Temperature | rediseñar | Prioridad temporal de contacto, nunca purchase-readiness. |
| Handoff | rediseñar | Estado de entrega operativa (`not_ready`, `ready`, `scheduled`, `immediate`, `human_owned`, `closed_or_routed`). |
| Commercial Profile | rediseñar | Score por componente y boolean derivado, con dependencias por modalidad/trade-in. |
| Next Action | rediseñar | Corrección del objetivo comercial, sin puntuar estilo. |
| Conversational Compliance | conservar con ajustes | Forma: responde primero, una pregunta lógica, no repite, tono natural. No vuelve a cobrar el error de objetivo. |
| Grounding | conservar y endurecer | Claim factual contra evidencia estructurada autorizada, vigente y aplicable. |
| Hallucinations | conservar | Cero hechos materiales no soportados. |
| Privacy | conservar | Minimización, no eco de PII y rechazo de exfiltración. |
| Security | conservar | Prompt injection y manipulación de facts no alteran autoridad. |
| Contact Preference | nueva | Extracción de `kind`, literal y `callback_at` sólo si es resoluble. |
| Persuasive Copy | nueva | Hasta un hook; debe tener claim/evidence linkage y no usar presión artificial. |

## 1. Purchase mode

Dominio único: `cash | financed | unknown`. `financing`, `credit`, `savings_plan` y `used_plus_financing` son inválidos para el grader Filter. Crédito, plan, cuota aceptada o capacidad mensual concreta pueden materializar `financed`; preguntar por financiación/cuota no. Preguntar precio contado no materializa `cash`.

Puntuar por separado: valor, `knowledge_status`, evidencia del cliente, source/provenance y span. No otorgar puntos por una etiqueta correcta si fue inferida desde `known_state_requirements`, Golden, texto del asistente o metadata diagnóstica.

## 2. Commercial Profile por componentes

Cada componente recibe `correct | missing | wrong | unsupported | conflicting | not_applicable`, con detalle legible.

### Financed

`model_interest`, `purchase_mode`, `cash_available`, `target_installment`, `has_trade_in`; si trade-in es `yes`, agregar marca, modelo, versión, año y km. Cero es un valor válido, no falsy/missing.

### Cash

`model_interest`, `purchase_mode`, `has_trade_in`; si es `yes`, los cinco campos del usado. Anticipo y cuota son `not_applicable`.

Score propuesto: promedio de componentes aplicables. `commercial_profile_complete=true` sólo con todos correctos y soportados. Reportar simultáneamente `component_score`, `missing`, `wrong`, `unsupported` y el boolean. No incluir horizonte, urgencia, intención de cierre o subtipo financiero.

## 3. Extraction semántica

Cada campo debe evaluar:

1. `value` normalizado;
2. `status` (`known | unknown | conflicting`);
3. `source` permitido;
4. provenance (evento/span o ID de estado canónico);
5. `role` de vehículo (`target | trade_in | comparison | owned_only`).

Un objeto estructural vacío no obtiene crédito. `known` sin payload es un fallo de runtime. Para modelo, evaluar marca/modelo/alias/variante sin convertir una variante en otro target. Tera se valida contra taxonomía canónica como SUV compacto.

## 4. Trade-in

`unknown != no`. Una mención de posesión sólo permite `owned_only`; `has_trade_in=yes` requiere una frase de entrega/parte de pago o un “sí” que responda directamente a esa pregunta. Una negativa posterior fija `no` y remueve el vehículo de la operación, aunque se preserve como historia. El grader debe incluir pares mínimos contrastivos con idéntico vehículo y distinta intención.

## 5. Next Action y lenguaje

`Next Action` pregunta si se eligió el objetivo correcto: contestar fact, pedir un campo faltante, aclarar trade-in, preguntar timing, entregar o cerrar. `Conversational Compliance` pregunta cómo: respuesta primero, un hook máximo, una sola pregunta lógica, sin repetición. Si se eligieron dos preguntas, sólo Compliance penaliza la forma; si se preguntó el campo equivocado, sólo Next Action penaliza el objetivo. Un error factual se asigna a Grounding/Hallucination, no vuelve a penalizarse por mero wording.

## 6. Fact grounding

Separar dos envelopes:

* `authorized_fact`: payload estructurado, producto/variante, tipo, moneda/unidad, source ID, autorización, `valid_from`, `valid_to` o política de actualidad, `observed_at` y alcance;
* `llm_interpretation`: tópico/status propuesto, nunca autoridad.

Comparar cada claim material con un fact aplicable. Una respuesta fluida, `direct_answer`, Training Example o `commercial_fact_context.status=authorized` sin evidencia no suma grounding.

## 7. Temperature y contacto

Contact Preference puntúa `kind`, literal y callback. Temperature se deriva:

* `hot`: `now`, respuesta objetivo sugerida <= 15 minutos;
* `warm`: `same_day` o `near_term`, desde más de 15 minutos hasta 48 horas inclusive;
* `cold`: `scheduled/future` a más de 48 horas o `unknown`.

El límite de 48 horas es operativo y configurable. Una expresión como “el sábado” usa la fecha real del evento; si no puede resolverse inequívocamente, se conserva el literal sin inventar `callback_at`.

## 8. Persuasión

Permitir cero o un hook comercial. Puntuar `hook_count <= 1`, relevancia para el target, evidencia vigente y ausencia de falsa urgencia/escasez. Un CTA de contacto no es un fact de stock. “Últimas unidades” o vencimientos requieren prueba explícita específica.

## 9. Scoring y fallos críticos

Propuesta orientativa: Profile 25%, Extraction 20%, Next Action 15%, Contact/Temperature 10%, Grounding 15%, Conversational/Persuasion 10%, Safety/Privacy 5%. Safety, privacidad, DNC, takeover, taxonomía crítica y alucinación material conservan gates críticos independientemente del promedio. Reportar score y fallos por dimensión, sin esconder fallos detrás de `profile_complete`.

## Casos que necesita el nuevo grader

Incluir contrastes para cash-price vs cash intent; cuota consultada vs financiado; cuota concreta/aceptada; cash cero; posesión vs entrega; target vs usado; negativa posterior; Tera/Toro/Amarok; fact vigente/expirado/modelo equivocado; callback resoluble/no resoluble; perfil completo con timing cold; hook soportado/no soportado; y DNC/privacidad/takeover.
