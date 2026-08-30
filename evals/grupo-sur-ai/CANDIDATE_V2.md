# Candidate v2 — Matrix v1.4 (estado final offline / Fase 2)

Candidate v2 conserva la separación entre extracción, acumulación de perfil, motor Matrix determinístico, reglas duras y generación de respuesta. No reemplaza ni modifica Candidate v1.

## Cambios funcionales

- Separa `human_request`, `commercial_action_request` y `security_intent`; una solicitud humana requiere evidencia de una persona y de interacción.
- Aplica correcciones explícitas antes del estado inicial de Meta, normaliza modelos antes de detectar conflictos y deriva faltantes según la modalidad activa.
- Conserva los cuatro estados del lattice de handoff y genera acciones causales para seña, visita, pedido humano y seguridad.
- Cierra solicitudes de datos de terceros como seguridad/no comercial sin handoff comercial.
- Respeta respuestas de alcance limitado sin iniciar otra batería de preguntas.

## Registro de integridad

- Candidate v1 commit histórico: `29338872d1660225cfd24fad259941f224b576a7`
- Candidate v2 commit de implementación: `c78736402ba6e317c3602fd175f5fb763e36908f`
- Candidate v2 commit final local: `cc0326c`
- Candidate v2 SHA-256 compuesto final (SHA-256 de la lista ordenada de SHA-256 de sus archivos): `412969d9c75c51a13127cc8b7ca73b7ffe0ac702c96c7069ea164140c7e6f92e`
- Grader v1 SHA-256: `151158dd6c65a410daf95a0dc6d9e7520d970d45ccfb58f1864e302f20dea203`
- Grader v1.1 SHA-256: `1eff7a52124a5a80647410f7990c06a555145e981aed79a2aedbac31c164c3d2`
- Matrix v1.4 SHA-256: `b05bce2f43a160e22acbff0e107bfe1ee041f3a45fc1424ce3717f92098f17c9`
- Golden fuente v1.0.0 SHA-256: `934d70c25c69c7543e2faf74e0ee5667fc258a273fcf39237a4bb8c4c394cdd0`
- Golden compilado v1.0.0 SHA-256: `2e096d0230421ac694086e3b2cb85ab8bf87d526cbb9cb9642a3e33ccad1f806`
- Candidate v1 Git tree (base y resultado): `89cc38faf5dea198fffc90f900353b4a83a4644d`

## Resultado offline final

- Suite offline completa: `107 tests / 104 PASS / 3 FAIL`.
- Suite Candidate v2: `40 tests / 37 PASS / 3 FAIL`.
- Todas las regresiones contractualmente implementables pasaron.
- Los tres FAIL informados por Node representan sólo dos casos funcionales bloqueados contractualmente:
  - GSV1-029 — `MISSING_CONTEXT`.
  - GSV1-080 — `GOLDEN_RUNTIME_CONFLICT`.
  - El tercer FAIL es el wrapper parametrizado que contiene GSV1-080; no representa un tercer caso funcional.

## Alcance y riesgos restantes

Las Fases 1 y 2 validan caminos determinísticos offline. La calidad de extracción libre aún depende del modelo en una evaluación futura; no se ejecutó Responses ni el Golden online. Las reglas de evidencia semántica son un guard determinístico conservador y pueden requerir calibración con expresiones humanas no contempladas. No hubo cambios de RAG global, producción, deploy ni merge.
