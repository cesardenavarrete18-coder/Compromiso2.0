# Branch Archive Manifest — 2026-09-11

Base verificada para esta auditoría: `main @ d8add165ac68d9999291c0c23c2dd7bb72789fcb`.

Objetivo: documentar qué ramas siguen siendo fuentes activas de trabajo, cuáles deben preservarse por valor histórico o futuro y cuáles pueden eliminarse sin perder patrimonio técnico. Este manifiesto no autoriza merges ni borrados por sí mismo.

## Ramas que deben conservarse

| Rama | SHA auditado | Estado | Motivo |
|---|---|---|---|
| `main` | `d8add165ac68d9999291c0c23c2dd7bb72789fcb` | CANÓNICA | Producción y única base para nuevos desarrollos funcionales. |
| `eval-candidate-v2.3-grader-v1.3` | `d17cdc646752741134230bb817d47f66a0c506f0` | CONSERVAR | Línea canónica Seller/Matrix/Evals. Contiene Candidate v2.3, Matrix v1.4, Golden Dataset, graders, manifests, runtime replica y tests. No debe mergearse directamente a main; sirve como laboratorio/evaluación. |
| `agent/cartera-tasacion-mobile-webhook` | `d6882ebe2ecf53783db6f093053bd5438f1f84ed` | CONSERVAR HASTA PORT | Contiene trabajo único de Tasador/Mercado Libre todavía no absorbido por main: OAuth ML, referencias de mercado, comparables, vehicle_appraisals y UI histórica. Debe portarse a una rama nueva desde main antes de eliminarse. |

## Ramas que deben archivarse antes de eliminarse

| Rama | SHA auditado | Acción |
|---|---|---|
| `eval-candidate-v2.2-grader-v1.3` | `472a8c77f3e54710d799cdec5453234a890ccd9b` | Crear tag/snapshot histórico del baseline Candidate v2.2 + Grader v1.3; luego eliminar branch. |
| `codex/initiate-ia-comercial-v2-integration-process` | `cab2105d19199b2df05ae9770578c84686b9f821` | Opcional: tag histórico del stack Filter v1 pre-Shadow RC1 si se desea conservar esa etapa como referencia; después eliminar #37/#38/#39 branches. |

## Ramas staging/temporales Seller seguras para eliminar

- `ai-matrix-v1.4-candidate-v2.3-upload-staging` @ `24ca563b35e2177d0009d0a4fb2d4c8aba5389f2` — su runtime Candidate v2.3 ya existe en la rama Seller canónica.
- `tmp-v23-upload2` — su único test Candidate v2.3 fue comparado y ya existe idéntico en la rama Seller canónica.
- `eval-grader-v1.3-contract-fix` @ `8f85bba655cace9abe9bb340c014ac8ad8a9e134` — Grader v1.3 ya está contenido en la rama Seller canónica.

## PR legacy cerrados y ramas preservadas sólo para archivo hasta limpieza

- PR #15 `agent/admventas-presupuestos` @ `90710ebc206f5746731024287a4fd9d8c29857f4` — superseded por desarrollos posteriores; nuevo ADM Ventas debe partir de main.
- PR #37 `codex/consolidate-technical-design-for-filter-v1` @ `0422598735edab2498f411fbaacc34eefa3ae035` — etapa histórica de Filter v1.
- PR #38 `codex/implement-filter-v1.1-extractor-changes` @ `d7cff5ce2f277c4a9669357009a9c8c7f156b0c3` — etapa histórica de extractor.
- PR #39 `codex/initiate-ia-comercial-v2-integration-process` @ `cab2105d19199b2df05ae9770578c84686b9f821` — reemplazado por Shadow RC1 y posteriores hardenings en main.
- PR #42 `codex/confirm-repository-and-branch-before-modification` @ `8351729f206dcc8ecdbe7352fd90fc43011f158d` — CRM V2 terminó integrado por el release #56.

Cerrar estos PR no eliminó ninguna rama ni commit.

## Ramas integradas/superseded candidatas a eliminación

Las siguientes ramas no deben usarse como base de nuevos trabajos. Sus cambios relevantes fueron integrados, superseded o reemplazados por implementaciones posteriores en `main`:

- `agent/admventas-presupuestos`
- `agent/crm-lead-agenda`
- `agent/datero-provisorio-mis-ventas`
- `agent/fix-result-stepper`
- `agent/importacion-rellamados-minuta-pdf`
- `agent/supervisor-lead-routing`
- `audit/filter-v1-business-contract`
- `claude/ai-v2-shadow-rc1`
- `claude/audit-v2-branch-prs-sjz6l7`
- `codex/add-hardening-to-existing-branch`
- `codex/confirm-repository-and-branch-before-modification`
- `codex/consolidate-technical-design-for-filter-v1`
- `codex/implement-filter-v1.1-extractor-changes`
- `codex/implement-vercel-preview-for-supabase`
- `codex/initiate-ia-comercial-v2-integration-process`
- `codex/mejoras-vendedores-administracion-agosto`
- `eval-grader-v1.3-contract-fix`
- `feat/admin-credit-active-archive-ux`
- `feat/admin-credit-multi-vehicle-applicability`
- `feat/admin-credit-multi-vehicle-v2-integration`
- `feat/crm-en-gestion-playbook`
- `feat/crm-v2-visual-redesign`
- `feat/supervisor-portfolio-followup`
- `fix/reconcile-ai-v2-shadow-migration-version`
- `fix/reconcile-bank-credit-migration-version`
- `fix/restore-shared-final-minute-flow`
- `fix/shadow-observation-hardening`
- `hardening/crm-v2-playbook-acl`
- `hardening/crm-v2-recall-production-compat`
- `hardening/crm-v2-release-integrity`
- `hardening/crm-v2-supervisor-compat`
- `hotfix/credit-multi-model-legacy-guards`
- `hotfix/crm-v2-atomic-answer-payload`
- `hotfix/crm-v2-start-current-protocol`
- `hotfix/family-q-trade-in-corrections`
- `integration/credit-multi-vehicle-v2-port`
- `integration/crm-v2-approved-visual`
- `release/crm-v2-main-integration`
- `release/crm-v2-final-main-integration`
- `prototipo-vendedores`
- `tmp-do-not-use`

## Reglas para nuevos desarrollos

1. Todo nuevo desarrollo funcional debe partir del `main` vigente.
2. Supervisor V2 debe crearse desde main, no desde `feat/supervisor-portfolio-followup` ni ramas históricas.
3. ADM Ventas V2 debe crearse desde main, no desde `agent/admventas-presupuestos`.
4. Administración V2 debe crearse desde main.
5. Seller/Matrix/Evals se mantiene como línea especializada separada en `eval-candidate-v2.3-grader-v1.3` hasta que se decida cómo portar su resultado a producción.
6. Tasador debe portarse selectivamente desde `agent/cartera-tasacion-mobile-webhook` hacia una rama nueva basada en main; no se debe mergear la rama legacy directamente.
7. Antes de eliminar físicamente una branch, verificar que figure en este manifiesto como eliminable o que tenga un snapshot/tag de archivo explícito.

## Próximas ramas recomendadas

- `feat/supervisor-v2` desde `main`
- posteriormente `feat/admventas-v2` desde `main`
- posteriormente `feat/administracion-v2` desde `main`
- cuando se retome Tasador: `feat/vehicle-appraisal-v2` desde `main`

## Nota sobre Vercel

Eliminar branches evita nuevos Preview deployments para esas ramas, pero no implica necesariamente la eliminación inmediata de deployments históricos ya retenidos por Vercel. La limpieza de deployments debe auditarse por separado en Vercel.
