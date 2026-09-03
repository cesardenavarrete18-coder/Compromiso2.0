# IA Comercial Grupo Sur — Seller v2 Preserved Design

## Propósito

Este documento preserva el trabajo realizado hasta Candidate v2.3 que excede el alcance de Filter v1 y puede reutilizarse cuando Grupo Sur avance hacia una IA vendedora más autónoma.

La decisión de simplificar Filter v1 NO invalida este trabajo. Se lo desacopla deliberadamente para evitar que la primera etapa cargue complejidad propia de un vendedor autónomo.

## 1. Punto de congelamiento canónico

### Candidate v2.3

- Branch: `ai-matrix-v1.4-candidate-v2.3`
- Commit: `4d346564c6bb94baef43fca82b68ed0bb4a1f073`
- Tree: `a233bdc49affbc05e784c40eea592e5c5b450564`
- Parent: `75ff988aec4215b78d34852cca665c8736d14e58`
- Compound: `629143b6bd730803e849ad0a7eaecfdc9741242e081aed460e84e400977225c3`
- Portable: `ec343001c6a7730069f2459d1ad608878b964ec1d87afbc09169fb754bc9f283`

### Eval assembly

- Branch: `eval-candidate-v2.3-grader-v1.3`
- Commit: `d17cdc646752741134230bb817d47f66a0c506f0`
- Tree: `46777ee993c32a78d36eb994c5f89ab696ff9d03`
- Parent: Candidate v2.3 canonical commit.

### Grader v1.3

- Canonical SHA-256: `9daa4d58acc3ddec9f52c0e1ec0981d315029978df714f887d08959bcbbef142`
- Branch de origen: `eval-grader-v1.3-contract-fix`
- Commit: `8f85bba655cace9abe9bb340c014ac8ad8a9e134`

### Frozen Golden / Matrix de la evaluación histórica

- Matrix SHA-256: `b05bce2f43a160e22acbff0e107bfe1ee041f3a45fc1424ce3717f92098f17c9`
- Golden source SHA-256: `934d70c25c69c7543e2faf74e0ee5667fc258a273fcf39237a4bb8c4c394cdd0`
- Golden compiled SHA-256: `2e096d0230421ac694086e3b2cb85ab8bf87d526cbb9cb9642a3e33ccad1f806`
- 100 casos: `GSV1-001..GSV1-100`.

### Última evaluación online canónica v2.3

- Run ID: `candidate-v2.3-grader-v1.3-2026-09-02T21-13-27-552Z`
- Score: 88.33
- PASS / FAIL: 54 / 46
- Critical failures reales: 0
- Outputs frozen SHA-256: `a7a9daec59943e9a218b8faccab9ee74fa6198142c349f9a0be88c081fb0fc5f`
- Responses required / actual / bypass / retries: 85 / 88 / 15 / 3
- Definitive errors: 0
- Grounding / Hallucinations / Privacy: 100 / 100 / 100

Este punto histórico debe permanecer reproducible. No reinterpretar retroactivamente sus resultados como si hubiera usado el contrato futuro de Filter v1.

## 2. Qué representaba Matrix v1.4

Matrix v1.4 fue diseñada para una IA comercial más cercana a un vendedor autónomo que a un simple filtro.

Dimensiones principales preservadas:

```text
qualification_status
commercial_temperature
handoff_status
commercial_profile_complete
conversation_status
do_not_contact
next_action
```

Además existían perfiles económicos, señales de intención, seguimiento, objeciones, routing, trade-in, factual grounding y mecanismos de seguridad.

## 3. Purchase modalities históricas

Seller v2 puede recuperar, si comercialmente vuelve a ser útil, la discriminación avanzada entre:

```text
financing
credit
savings_plan
cash
used_plus_financing
```

La conclusión de Filter v1 es que esta discriminación NO debe ser un requisito inicial de recepción/calificación.

En Seller v2 podría reaparecer únicamente cuando aporte valor real para:

- elegir producto financiero;
- argumentar opciones;
- comparar alternativas;
- presentar condiciones vigentes;
- determinar el circuito administrativo posterior.

Nunca debería forzarse al cliente a seleccionar una etiqueta financiera antes de comprender su capacidad económica.

## 4. Commercial Profile avanzado preservado

El diseño anterior contemplaba:

- modelo exacto;
- modalidad;
- cash disponible;
- cuota objetivo;
- usado sí/no;
- marca/modelo/versión/año/km del usado;
- estimación del cliente sobre el usado;
- valuación autorizada separada;
- capacidad inicial calculada sólo con componentes autorizados/materializados;
- zona;
- horizonte de compra;
- urgencia;
- intención de visita;
- intención de seña;
- intención comercial;
- pedido de humano;
- action request;
- estados y contexto operativo.

Regla preservada: la estimación del cliente sobre un usado NO equivale a una tasación autorizada.

## 5. Trade-in avanzado

Preservar para Seller v2:

- `has_trade_in`;
- datos descriptivos del usado;
- `trade_in_customer_estimate`;
- `trade_in_authorized_value`;
- `trade_in_valuation_status`;
- apertura separada del proceso de valuación;
- cálculo de initial capacity sin sumar una estimación no autorizada.

La valuación puede seguir pendiente sin impedir que una operación tenga datos comerciales suficientes.

## 6. Qualification avanzada

El diseño anterior separaba:

- `follow_up`;
- `qualified`;
- `unqualified`.

Reglas históricas relevantes:

- modelo + modalidad no bastaban por sí solos;
- se requería señal comercial accionable e intención activa/action-ready para la ruta normal;
- acción inmediata (seña, visita, documentación/closing) podía calificar incluso con perfil incompleto;
- contado requería modelo exacto + intención explícita de compra cash + intención activa;
- falta de capacidad económica actual con intención futura/exploratoria no debía transformarse automáticamente en `unqualified`.

Para Filter v1 `qualified` cambia a "filtro completo". Este criterio histórico queda preservado exclusivamente como insumo potencial de Seller v2.

## 7. Temperature avanzada

El diseño anterior pretendía representar cercanía/intensidad comercial:

- `hot` para acciones inmediatas;
- `warm` para participación comercial constructiva;
- `cold` para horizonte lejano, ausencia de capacidad actual, silencio prolongado u otras señales.

Se preservan las ideas de:

- 2h reminder no enfría automáticamente;
- 24h de silencio como señal;
- plazo long-term;
- immediate/action-ready;
- no current capacity.

Filter v1 redefine Temperature como prioridad temporal de contacto. La semántica histórica puede reaparecer en Seller v2 con otro nombre, por ejemplo `purchase_readiness`, para no volver a mezclar dos conceptos.

## 8. Handoff avanzado

Estados históricos:

```text
continue_ai
handoff_recommended
handoff_required
handed_off
```

Contrato canónico preservado:

```text
handoff_required -> conversation_status=paused
handed_off -> conversation_status=open + AI bloqueada por takeover
```

Causales desarrolladas:

- pedido humano explícito;
- seña;
- visita;
- documentación;
- urgencia/closing;
- frustración;
- preguntas repetidas conocidas;
- límite de turnos sustantivos;
- routing TikTok no resoluble;
- postventa;
- fuentes comerciales variables/conflictivas;
- takeover/ownership humano.

Seller v2 podrá recuperar estas causales cuando necesite decidir cuándo dejar de vender y cuándo transferir.

## 9. Strong action precedence

Principio desarrollado y preservado:

Una acción inequívoca del cliente debe dominar la recolección de campos faltantes.

Ejemplos:

- "quiero señarlo ahora";
- "quiero ir a verlo hoy";
- "que me llame un asesor";
- "ya tengo la documentación y quiero avanzar".

No seguir interrogando cash/modality si la causal requiere intervención humana inmediata.

## 10. TikTok routing

Contrato desarrollado:

- si falta identificador, preguntar UNA vez código o nombre completo del asesor;
- identificador inválido, ambiguo, conflictivo, inactivo o no resoluble => Supervisor;
- no elegir arbitrariamente el primer/último código;
- routing es independiente de la calificación comercial.

Este mecanismo puede seguir siendo útil tanto en Filter v1 como en Seller v2.

## 11. Reminder / silence / conversation control

Preservado:

- reminders no cuentan como turnos comerciales sustantivos;
- una política de reminder único puede detener automatización posterior;
- silencio prolongado modifica estado/prioridad;
- `conversation_status=open|paused|closed`;
- DNC independiente;
- takeover humano bloquea respuesta automática.

## 12. Objeciones y reparación

Seller v2 puede reutilizar el trabajo sobre:

- desconfianza;
- fraude percibido;
- objeciones técnicas;
- precio/cuota;
- frustración;
- repetición de preguntas;
- repair before collection;
- handoff por causales graves.

Filter v1 sólo necesita manejar estas situaciones lo suficiente como para mantener una recepción segura y humana o derivar.

## 13. Conversational compliance

Principios útiles preservados:

- una pregunta lógica por turno como default;
- no repetir datos conocidos;
- aprovechar información espontánea;
- contestar una consulta concreta antes de continuar el cuestionario cuando corresponda;
- respuestas breves, naturales y cálidas;
- no formular baterías de preguntas;
- no confundir pedido de humano con visita física;
- no interpretar imperativos comerciales como pedido humano.

Seller v2 puede ampliar este bloque con técnicas persuasivas, objeciones y cierre.

## 14. Commercial facts / RAG

Trabajo preservado:

- precios, cuotas, stock, vigencias, descuentos y condiciones deben salir de una fuente estructurada autorizada y actual;
- Training Examples son referencia de conducta, nunca fuente factual;
- respuestas del LLM no autorizan hechos por sí mismas;
- retrieval debe distinguir authorized/current vs unavailable/conflicting/unverified;
- no inventar montos;
- una estimación del cliente no es una fuente comercial oficial.

Seller v2 deberá profundizar esta capa para poder vender de forma autónoma con seguridad.

## 15. Taxonomía de vehículos

Protección crítica desarrollada:

```text
Volkswagen Tera = SUV compacto
Volkswagen Tera != pick-up
Fiat Toro = pick-up
Volkswagen Amarok = pick-up
```

El guard de Candidate v2.3 ya cubre Tera incluso frente a una respuesta generativa incorrecta.

Preservar además:

- resolución determinística modelo único -> marca;
- target vs trade-in;
- comparaciones entre modelos;
- variantes/refinamientos sin generar falsos conflictos.

## 16. Cash price idiom

Regla histórica que debe sobrevivir a ambas etapas:

```text
"precio de contado"
"cuánto sale al contado"
"descuento pagando al contado"
```

NO establecen por sí solos una compra cash.

Cash requiere intención transaccional inequívoca, por ejemplo:

```text
"lo compro al contado"
"pago el total"
```

## 17. Provenance boundary

Principio fundamental de v2.3 que debe preservarse en cualquier Seller v2:

Runtime commercial truth puede provenir de:

1. evidencia explícita del cliente;
2. persisted canonical state materializado;
3. structured Meta referral;
4. deterministic existing canonical state;
5. eventos operativos canónicos;
6. fuentes comerciales actuales autorizadas.

No utilizar para fabricar estado comercial:

- `eval_id`;
- Golden expected values;
- `structured_context` diagnóstico;
- `known_state_requirements` como valor comercial;
- grader;
- Training Examples;
- evidence.quote generada por el modelo;
- texto previo del asistente como autoridad comercial.

## 18. Persisted state / memoria comercial

Hallazgo estructural preservado:

Una IA vendedora necesita memoria comercial canónica, no reconstruir toda la operación desde conversación libre en cada turno.

Seller v2 debería recibir estado estructurado durable de:

- modelo;
- capacidad económica;
- modalidad/producto cuando ya esté realmente definido;
- usado;
- valuación;
- horizonte;
- objeciones relevantes;
- ownership/handoff;
- condiciones comerciales presentadas/aceptadas;
- campañas/facts autorizados utilizados.

## 19. Posibles capacidades Seller v2

Al retomar esta etapa se pueden desarrollar, sobre la base preservada:

- recomendación automática de producto financiero;
- comparación crédito vs plan según capacidad;
- recomendación de modelo/versión;
- manejo profundo de objeciones;
- persuasión y cierre;
- propuesta de campaña vigente;
- seguimiento/nurture multi-turno;
- reactivación;
- agenda de visita;
- seña;
- documentación;
- valoración de usado integrada;
- handoff inteligente sólo cuando aporta valor;
- negociación limitada bajo reglas autorizadas;
- vendedor IA 100% en escenarios habilitados.

## 20. Qué NO se debe perder al simplificar Filter v1

No borrar ni reescribir la historia canónica de Candidate v2.3 para hacerla parecer un filtro.

No modificar retroactivamente sus hashes, evals o artifacts.

No eliminar del repositorio los módulos/tests/audits históricos que documentan:

- taxonomy guard;
- provenance audit;
- profile accumulator;
- matrix engine;
- hard rules;
- extraction schema;
- routing;
- reminder semantics;
- ownership;
- factual grounding.

La nueva arquitectura debe convivir con este punto de referencia.

## 21. Reanudación futura de Seller v2

Cuando se decida iniciar Seller v2:

1. partir de este documento y del frozen Candidate v2.3 como material de investigación;
2. NO asumir que el Golden v1 original sigue siendo el contrato correcto;
3. crear un Business Contract específico para Seller v2;
4. definir qué dimensiones son de filtrado y cuáles de venta;
5. posiblemente reemplazar `commercial_temperature` de compra por un nombre explícito como `purchase_readiness`;
6. construir un Golden Seller v2 separado del Golden Filter v1;
7. mantener provenance/grounding/privacy como invariantes;
8. sólo después construir Candidate Seller v2.

## 22. Relación con Filter v1

Filter v1 y Seller v2 son dos productos conectados pero distintos:

```text
LEAD
  -> Filter v1
      -> ficha estructurada + timing de contacto
          -> vendedor humano

FUTURO:
LEAD
  -> Seller v2
      -> comprensión + propuesta + objeciones + negociación + cierre/handoff
```

La decisión actual es perfeccionar primero Filter v1, manteniendo Seller v2 preservado como segunda etapa independiente.
