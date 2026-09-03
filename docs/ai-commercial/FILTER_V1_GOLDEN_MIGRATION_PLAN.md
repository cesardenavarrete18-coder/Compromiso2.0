# Filter v1 — plan de migración del Golden

## Principios

Crear un dataset nuevo; no editar ni reinterpretar Golden v1, Matrix 1.4, Candidate v2.3 o Grader v1.3. Conservar hashes y manifests históricos. La auditoría JSONL es insumo de diseño, no Golden ejecutable.

## Resultado de triage

| Veredicto | Cantidad | Acción |
|---|---:|---|
| keep | 33 | Portar escenario al nuevo schema y revisar wording, manteniendo la invariante Filter. |
| rewrite | 8 | Mantener intención del test y reemplazar expectativas Seller por estado Filter. |
| move_to_seller_v2 | 20 | Copiar a backlog/dataset Seller v2 u operativo; no borrar el original. |
| remove_or_merge | 9 | Consolidar routing TikTok fuera del Golden comercial core. |
| runtime_contract_issue | 30 | Materializar estado/facts/provenance antes de admitirlo en el nuevo Golden. |

## Fases

1. **Freeze verificable:** registrar SHAs conocidos, validar los 100 IDs y archivar manifest sin cambios.
2. **Schema Filter:** definir tipos de purchase mode, estados/provenance, roles de vehículo, contact preference y fact envelope.
3. **Runtime fixtures:** reemplazar banderas simbólicas por valores y evidencia reales; fijar `event_at`, timezone y catálogo versionado.
4. **Reescritura:** generar expected exclusivamente desde el contrato de negocio, con revisión humana caso por caso.
5. **Suites separadas:** `filter-core`, `filter-edge-and-safety`, `seller-v2-preserved`, `routing-and-ownership`, `reminders`.
6. **Contrastes faltantes:** agregar pares posesión/entrega, precio contado/intención cash, pregunta de cuota/capacidad financiada, callback y hooks.
7. **Grader nuevo:** validar componentes, provenance y no doble penalización con fixtures unitarios offline.
8. **Gate documental:** sólo declarar Golden v2 definible cuando facts y estado persistido tengan contrato materializado.

## Schema de caso propuesto

Cada caso debe contener `eval_id`, `event_at`, timezone, inbound event, canonical state previo con valores, source/provenance, authorized facts con payload, taxonomy version, expected extraction, expected profile components, contact preference, qualification, temperature, handoff, next action y requisitos/prohibiciones conversacionales.

`structured_context`, títulos, requisitos y expected values nunca deben ingresar al runtime del Candidate. Un marcador redacted debe incluir su tipo/semántica en un fixture estructurado, no obligar al modelo/grader a adivinar el valor.

## Criterios de salida

* purchase mode sólo usa `cash|financed|unknown`;
* cada `known` tiene payload y provenance;
* cada vehículo tiene rol;
* trade-in `yes` posee evidencia de intención;
* profile completeness deriva de componentes;
* contact timing es independiente;
* cada claim material tiene fact autorizado aplicable;
* Seller/operaciones están fuera de la suite core;
* seguridad, privacidad, DNC, grounding y takeover preservan gates;
* revisión humana aprueba los 100 expected.

## Decisión de readiness

`READY_TO_DEFINE_FILTER_V1_GOLDEN_V2=no`.

Se puede comenzar a definir schema y fixtures, pero no congelar el Golden hasta resolver el envelope de facts, los `known` sin payload, el estado temporal real y la separación de suites. Esta decisión no bloquea el diseño offline; evita que otro Golden vuelva a codificar ambigüedad como autoridad.
