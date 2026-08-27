# Evaluación A/B canónica v1

Esta infraestructura compara dos brazos contemporáneos sin reinterpretar el Baseline v2 histórico:

- **Control:** runtime legacy congelado del commit `79f1a9ef537c103efbe6a58082191501e3622e0c`.
- **Candidate:** Candidate v1 congelada del commit `29338872d1660225cfd24fad259941f224b576a7`.
- **Grader único:** `src/graders.mjs` de Candidate v1, SHA-256 `151158dd6c65a410daf95a0dc6d9e7520d970d45ccfb58f1864e302f20dea203`.

El Control no importa ni ejecuta módulos Candidate. Candidate no altera el runtime Control. Ambos reciben compilaciones independientes del mismo Golden Dataset y deben coincidir con `AB_INPUT_MANIFEST.json` antes de cualquier transporte.

## Barreras previas

La validación offline comprueba:

1. hashes de grader, Golden Dataset, Matriz, snapshots y ambos runtimes;
2. modelo, Vector Store y snapshot de 11 Training Examples;
3. exactamente 100 IDs y hashes idénticos de `runtime_input`;
4. igualdad por dimensión: mensaje, modelo previo, historial, Meta, calificación previa, control conversacional, DNC, takeover, routing y datos persistidos;
5. outputs legacy sin dimensiones nuevas continúan como `CAPABILITY_MISSING`.

## Persistencia obligatoria

Cada brazo genera dentro de `evals/grupo-sur-ai/ab-artifacts/<ab_run_id>/<arm>/`:

- `metadata.json`;
- `outputs.json`;
- `results.json`;
- `report.md`;
- `artifact-manifest.json`;
- `SHA256SUMS`.

Los archivos sólo aceptan los 100 IDs `GSV1-*` congelados. Antes de escribirlos se escanean patrones de API keys, Authorization, credenciales y JWT. Después se audita nuevamente el directorio y se bloquean `.env` o archivos faltantes.

La ejecución futura debe realizarse sobre la rama aislada `eval-ab-v1-artifacts`. Después de cada brazo, se ejecuta la auditoría, se verifica `SHA256SUMS` y se publica un commit independiente. El brazo Candidate no puede comenzar hasta confirmar la persistencia del Control. La comparación final se publica como un tercer commit en la misma rama.

Esa rama nunca se mezcla con `main`. El Baseline v2 histórico permanece identificado como `NOT_REPLAYABLE`, con `63.31 / 88.76`, y no se sobrescribe.

## Orden futuro

1. Crear `ab_run_id` nuevo.
2. Ejecutar y publicar Control.
3. Verificar commit y hashes de Control.
4. Ejecutar y publicar Candidate con el mismo `AB_INPUT_MANIFEST.json`.
5. Generar `comparison.json` y `comparison.md`.

Las funciones de ejecución requieren una autorización explícita por brazo (`EXECUTE_AB_V1_CONTROL_100_CASES` o `EXECUTE_AB_V1_CANDIDATE_100_CASES`). No se incluye ninguna autorización activa en el repositorio.

## Validación offline

```bash
node --import tsx src/ab-v1/validate.mjs
node --import tsx --test test/ab-v1.test.mjs
```

Estos comandos no cargan credenciales, no usan red, no llaman Responses y no ejecutan ninguno de los 100 casos contra un runtime.
