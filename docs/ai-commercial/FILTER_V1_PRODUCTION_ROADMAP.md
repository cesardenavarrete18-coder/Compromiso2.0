# Filter v1 — roadmap hacia producción

## Objetivo

Llevar Filter v1 a producción sin volver a optimizar Candidate contra un contrato ambiguo. El orden es deliberado: primero contrato y datos, luego evaluación, después implementación y finalmente tráfico real.

## Gate 0 — contrato funcional consolidado

Fuente de negocio:

`docs/ai-commercial/FILTER_V1_FINAL_BUSINESS_CONTRACT.md`

No avanzar si una implementación contradice ese contrato sin revisión humana explícita.

## Fase 1 — corregir auditoría histórica

Actualizar la auditoría GSV1-001..100 para que refleje el contrato final.

Corregir al menos:

- advertised modality != purchase mode;
- posesión de usado != trade-in;
- target != comparison/owned vehicle;
- dos modelos candidatos sin elección arbitraria;
- consultas de cuota/precio contado no materializan modalidad;
- pedido humano y acciones fuertes -> immediate handoff;
- operational shared != Seller v2;
- contact priority basada en timing;
- unknown/explicitly_unknown/missing diferenciados.

Regenerar el Markdown de 100 casos a partir del JSONL corregido.

Todavía NO crear Golden ejecutable.

## Fase 2 — diseñar contratos técnicos

Crear diseños versionados para:

### Canonical Filter State

Debe cubrir como mínimo:

- target/brand/model candidates;
- purchase_mode;
- down_payment_amount;
- monthly_installment_capacity;
- has_trade_in;
- trade-in vehicle fields con status/provenance;
- location opcional;
- contact preference;
- contact priority;
- handoff;
- qualification;
- provenance por campo;
- estado `known | missing | explicitly_unknown | conflicting` donde aplique.

### Facts simplificados Filter v1

PLAN_FACTS se proyecta determinísticamente desde `public.campaigns` activas y TECHNICAL_FACTS desde catálogo. El envelope avanzado siguiente queda `deferred_to_seller_v2` y no bloquea v1. Conserva como referencia futura:

- immutable fact ID;
- fact type;
- product/variant subject;
- payload;
- source ID;
- authorized/current status;
- validity;
- observed_at;
- allowed claim o claim scope;
- conditions;
- supersession/revocation.

### Technical Catalog

Catálogo canónico/versionado de:

- marca;
- modelo;
- aliases;
- variante;
- body type;
- motor;
- equipamiento/especificaciones autorizadas.

La taxonomía crítica (p.ej. Tera SUV compacto) no depende de RAG variable.

### Resolución comercial por fact

No seleccionar plan ni crear `ai_primary_offer`. Para cada consulta usar el mínimo no nulo entre campaigns del target con `active=true`: final_price para valor de referencia, installment_amount para cuota y advance_amount para retiro. Preservar source_campaign_id y bloquear combinaciones sintéticas entre campañas. Subscription amount no está materializado y requiere confirmación comercial.

### Business Hours + Handoff

Definir calendario operativo configurable, sábado incluido, para:

- hot/warm/cold;
- mensajes dentro/fuera de horario;
- immediate vs scheduled;
- no prometer SLA humano inexistente.

## Fase 3 — materializar datos reales en fixtures

Eliminar fixtures simbólicos como:

- `known` sin payload;
- `current_authorized` sin fact;
- `available/unavailable` sin subject/source;
- redactions sin semántica estructurada.

Agregar `event_at`, timezone, estado previo canónico, facts autorizados y catálogo versionado.

No usar expected/Golden como runtime.

## Fase 4 — Golden Filter v1

Crear dataset NUEVO. No editar Golden v1 histórico.

Suites sugeridas:

- `filter-core`;
- `filter-edge-and-safety`;
- `operational-shared`;
- `seller-v2-preserved`;
- `reminders/nurturing`.

Contrastes mínimos obligatorios:

- poseer usado vs entregarlo;
- precio contado vs intención cash;
- preguntar cuota vs capacidad mensual;
- anuncio financiero vs intención financed;
- Tera target vs Toro comparison;
- dos modelos candidatos;
- pedido humano con perfil incompleto;
- acción fuerte con perfil incompleto;
- qualified + cold;
- qualified + hot;
- monto ambiguo;
- fact vigente/expirado/modelo equivocado;
- hook autorizado/no autorizado;
- DNC/privacy/takeover.

Revisión humana caso por caso antes de congelar hash.

## Fase 5 — Grader Filter v1

Crear grader nuevo/versionado. No alterar v1.3.

Dimensiones mínimas:

- extraction value/status/source/provenance/role;
- commercial profile por componentes;
- qualification derivada;
- contact preference;
- contact priority;
- handoff;
- next action;
- conversational compliance;
- grounding;
- hallucination;
- privacy/security;
- persuasive framing/hook.

Evitar doble penalización. Mantener gates críticos de seguridad, DNC, takeover, taxonomía crítica y alucinación material.

No fijar pesos definitivos hasta tener fixtures y tests unitarios.

## Fase 6 — implementación Candidate Filter v1

Recién aquí implementar runtime nuevo.

Principios:

- no reutilizar inferencias Seller v2 por conveniencia;
- adapter de compatibilidad si se conservan nombres históricos;
- determinismo para reglas críticas;
- LLM para interpretación conversacional, no como autoridad factual;
- una pregunta lógica por turno;
- answer first;
- commercial framing;
- máximo un hook autorizado;
- handoff inmediato cuando corresponde.

## Fase 7 — evaluación offline

Ejecutar:

- unit tests de schema/normalizer/decision engine;
- Golden Filter v1 completo;
- adversariales;
- tests de facts y expiración;
- tests de business hours;
- tests de no-response durante takeover.

No ir a shadow hasta eliminar fallos críticos y lograr score acordado con diagnóstico legible por dimensión.

## Fase 8 — replay histórico CRM

Tomar conversaciones reales históricas, anonimizadas cuando corresponda, y reproducirlas offline respetando sólo la información disponible hasta cada turno.

Evaluar:

- estado construido;
- preguntas;
- respuesta factual;
- handoff;
- contact priority;
- fricción;
- falsas inferencias.

No premiar similitud con la respuesta histórica; evaluar contra el contrato Filter v1.

Los fallos reales que revelen patrones nuevos pueden convertirse en casos Golden de regresión.

## Fase 9 — shadow mode

Procesar tráfico real en paralelo sin enviar respuestas Filter v1.

Comparar con operación actual:

- perfil construido;
- hechos usados;
- derivaciones;
- timing;
- copy;
- tasa de campos resueltos;
- falsos handoffs;
- oportunidades perdidas.

Usar una muestra suficiente antes de habilitar respuestas.

## Fase 10 — rollout controlado

Despliegue progresivo:

1. porcentaje pequeño de leads;
2. monitoreo de seguridad y grounding;
3. revisión humana de conversaciones;
4. incremento por etapas;
5. rollback simple disponible.

No mezclar este rollout con cambios funcionales no relacionados.

## Definition of Done para producción

Filter v1 está listo cuando:

- contrato funcional congelado/versionado;
- canonical state materializado;
- facts autorizados con payload/provenance/vigencia;
- catálogo técnico versionado;
- resolución por fact determinística sobre campaigns activas;
- business hours configurados;
- Golden Filter v1 aprobado;
- Grader Filter v1 aprobado;
- 0 fallos críticos en eval acordado;
- replay CRM satisfactorio;
- shadow mode satisfactorio;
- rollback y observabilidad listos;
- Seller v2 preservado sin contaminar Filter v1.

## Simplificación aprobada — Implementation Phase 1

`public.campaigns` activa es la autoridad comercial v1; `valid_from/to` no son requisito. Bank credit, primary offer, selección/comparación financiera y envelope genérico quedan `deferred_to_seller_v2`. Physical stock no participa. El core offline se revisa antes de Golden, DB, webhook o tráfico.

## Phase 3a — semantic extraction contract

The offline `filter-v1-semantic-extractor/1.0` contract precedes Golden: injected provider, strict evidence, enum validation, deterministic safety normalization and fail-closed engine adapter. It contains no commercial facts or effect decisions. Next: isolated online extractor evaluation; only after acceptance create the human-reviewed Golden Filter v1.
